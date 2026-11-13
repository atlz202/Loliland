// Проверка распределения заданий и цветов. Запуск: npm run test:unit
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HITECH } from '../src/data/hitech/index.ts'
import { ROLES, WORK_ROLES } from '../src/data/roles.ts'
import type { RoleId } from '../src/data/types.ts'
import { memberColors, shiftHue } from '../src/lib/colors.ts'
import { buildPlan, loadOf, pathOf, questTasksOf, responsible, roleLoads, uncoveredRoles } from '../src/lib/plan.ts'
import { blockersOf, EMPTY_PROGRESS, summarize, viewOf } from '../src/lib/status.ts'

const c = HITECH
const ids = (n: number) => Array.from({ length: n }, (_, i) => `u${i + 1}`)

function checkPlan(plan: ReturnType<typeof buildPlan>, members: string[]) {
  assert.equal(Object.keys(plan.tasks).length, c.tasks.length)
  for (const t of c.tasks) {
    const p = plan.tasks[t.id]
    assert.ok(p, `задание ${t.id} без плана`)
    assert.ok(responsible(p).length > 0, `задание ${t.id} никому не досталось`)
    assert.equal(new Set(p.a).size, p.a.length, `задание ${t.id}: исполнитель повторяется`)
    for (const m of responsible(p)) assert.ok(members.includes(m), `задание ${t.id}: чужой ${m}`)
    if (t.slots.includes('all')) assert.deepEqual([...p.a].sort(), [...members].sort(), `задание ${t.id} не у всех`)
    if (t.slots.includes('quest')) assert.ok(p.q, `задание ${t.id}: нет квестовика`)
    else assert.equal(p.q, undefined)
  }
  // У каждого своя очередь, и зависимость в ней всегда раньше.
  // На дереве очередь идёт только вверх, а внутри одного ряда слева направо.
  const column = new Map(c.groups.map((g, i) => [g.id, i]))
  for (const m of members) {
    const path = pathOf(plan, c, m)
    path.forEach((t, i) => {
      if (!i) return
      const prev = path[i - 1]
      assert.ok(prev.order < t.order)
      assert.ok(prev.epoch < t.epoch || prev.level <= t.level, `путь ${m}: шаг вниз от задания ${prev.id} к заданию ${t.id}`)
      if (prev.epoch === t.epoch && prev.level === t.level)
        assert.ok(column.get(prev.group)! < column.get(t.group)!, `путь ${m}: шаг влево от задания ${prev.id} к заданию ${t.id}`)
    })
  }
}

test('один игрок со всеми ролями получает всё', () => {
  const plan = buildPlan({ catalog: c, members: ['solo'], roles: { solo: WORK_ROLES }, questRunner: 'solo' })
  checkPlan(plan, ['solo'])
  assert.deepEqual(plan.uncovered, [])
  assert.equal(plan.questFallback, null)
  // 72 и 73 только квестовые, в очередь не встают.
  assert.equal(pathOf(plan, c, 'solo').length, 82)
  assert.equal(questTasksOf(plan, c, 'solo').length, 6)
})

test('11 игроков по одной роли: задание роли у её держателя', () => {
  const members = ids(11)
  const roles = Object.fromEntries(members.map((m, i) => [m, [WORK_ROLES[i]]])) as Record<string, RoleId[]>
  const plan = buildPlan({ catalog: c, members, roles, questRunner: 'u3' })
  checkPlan(plan, members)
  assert.deepEqual(plan.uncovered, [])
  for (const t of c.tasks)
    for (const slot of t.slots) {
      if (slot === 'all' || slot === 'any' || slot === 'quest') continue
      assert.ok(plan.tasks[t.id].a.includes(members[WORK_ROLES.indexOf(slot)]), `задание ${t.id}: роль ${slot}`)
    }
  // «Любой свободный» идёт тому, у кого меньше всего работы к этому моменту, а не Драконику.
  const dragon = members[WORK_ROLES.indexOf('dragon')]
  assert.ok(!plan.tasks[36].a.includes(dragon))
  assert.equal(questTasksOf(plan, c, 'u3').length, 6)
})

test('роль у двоих делится поровну, у человека с двумя ролями нагрузка больше', () => {
  const members = ['a', 'b', 'c']
  const roles: Record<string, RoleId[]> = { a: ['dragon'], b: ['dragon', 'multi'], c: WORK_ROLES.filter((r) => r !== 'dragon' && r !== 'multi') }
  const plan = buildPlan({ catalog: c, members, roles, questRunner: null })
  checkPlan(plan, members)
  const dragonTasks = c.tasks.filter((t) => t.slots.includes('dragon'))
  const hours = (m: string) => dragonTasks.filter((t) => plan.tasks[t.id].a.includes(m)).reduce((n, t) => n + ({ L: 0.5, M: 2, H: 6, X: 12 }[t.difficulty ?? 'M']), 0)
  assert.ok(Math.abs(hours('a') - hours('b')) <= 12, `драконик: ${hours('a')} и ${hours('b')}`)
  assert.ok(hours('a') > 20 && hours('b') > 20)
  // Ни одно задание драконика не досталось обоим сразу.
  for (const t of dragonTasks) assert.equal(plan.tasks[t.id].a.filter((m) => m === 'a' || m === 'b').length, 1)
  const load = loadOf(plan, c, members)
  assert.ok(load.b.hours > load.a.hours, 'у b две роли, нагрузка должна быть больше')
})

test('роли без исполнителя попадают в список, их задания всё равно розданы', () => {
  const members = ['a', 'b']
  const roles: Record<string, RoleId[]> = { a: ['ae', 'coder'], b: ['dragon'] }
  assert.deepEqual(uncoveredRoles(c, members, roles), WORK_ROLES.filter((r) => !['ae', 'coder', 'dragon'].includes(r)))
  const plan = buildPlan({ catalog: c, members, roles, questRunner: null })
  checkPlan(plan, members)
  assert.equal(plan.uncovered.length, 8)
  // Квестовик не выбран: квесты у того, у кого меньше ролей.
  assert.equal(plan.questFallback, 'b')
  assert.equal(questTasksOf(plan, c, 'b').length, 6)
})

test('план не зависит от порядка ключей и повторного запуска, вышедшие игроки игнорируются', () => {
  const members = ids(5)
  const roles: Record<string, RoleId[]> = { u1: ['ae', 'coder', 'ind1'], u2: ['ind2', 'meka', 'misc'], u3: ['beekeeper', 'beemech', 'ragu'], u4: ['dragon'], u5: ['multi', 'dragon'], ghost: ['dragon'] }
  const one = buildPlan({ catalog: c, members, roles, questRunner: 'ghost' })
  const two = buildPlan({ catalog: c, members, roles: Object.fromEntries(Object.entries(roles).reverse()), questRunner: 'ghost' })
  assert.deepEqual(one, two)
  checkPlan(one, members)
  assert.ok(one.questFallback, 'квестовик не из команды должен замениться')
})

test('пустая команда и игроки без ролей не ломают распределение', () => {
  assert.deepEqual(buildPlan({ catalog: c, members: [], roles: {}, questRunner: null }).tasks, {})
  const members = ids(3)
  const plan = buildPlan({ catalog: c, members, roles: {}, questRunner: null })
  checkPlan(plan, members)
  const load = loadOf(plan, c, members)
  const hours = members.map((m) => load[m].hours)
  assert.ok(Math.max(...hours) - Math.min(...hours) <= 12, `без ролей нагрузка должна быть ровной: ${hours}`)
})

test('нагрузка ролей в каталоге посчитана', () => {
  const loads = roleLoads(c)
  assert.equal(loads.dragon.count, 17)
  assert.equal(loads.ragu.count, 1)
  assert.ok(loads.dragon.hours > loads.multi.hours)
})

test('цвета: одна роль — её цвет, несколько — градиент, одинаковые наборы различаются', () => {
  const color = (id: RoleId) => ROLES.find((r) => r.id === id)!.color
  const out = memberColors(['a', 'b', 'c', 'd'], { a: ['beekeeper'], b: ['ind1', 'beekeeper'], c: ['beekeeper'], d: [] }, 'b')
  assert.equal(out.a.css, color('beekeeper'))
  assert.deepEqual(out.b.stops, [color('ind1'), color('beekeeper'), color('quest')])
  assert.ok(out.b.css.startsWith('linear-gradient('))
  assert.notEqual(out.c.css, out.a.css)
  assert.equal(out.c.css, shiftHue(color('beekeeper'), 28))
  assert.match(out.d.css, /^#[0-9a-f]{6}$/)
  assert.equal(shiftHue('#ff0000', 120), '#00ff00')
})

test('статусы: задание ждёт, пока не готовы зависимости', () => {
  const t5 = c.taskById.get(5)!
  assert.equal(viewOf(t5, EMPTY_PROGRESS), 'blocked')
  assert.deepEqual(blockersOf(t5, EMPTY_PROGRESS), [4])
  const p = { tasks: { 4: { s: 'done' as const, sub: [] } }, quests: {} }
  assert.equal(viewOf(t5, p), 'ready')
  assert.equal(viewOf(c.taskById.get(4)!, p), 'done')
  const s = summarize(c, p)
  assert.deepEqual([s.total, s.done, s.percent, s.epoch], [84, 1, 1, 1])
})
