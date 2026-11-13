// Проверка каталога заданий. Запуск: npm run test:unit
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HITECH } from '../src/data/hitech/index.ts'
import { GROUP_OF, SUBTASKS } from '../src/data/hitech/extras.ts'
import { isRoleId } from '../src/data/roles.ts'

const c = HITECH

test('84 задания, у каждого есть колонка, подпункты и исполнитель', () => {
  assert.equal(c.tasks.length, 84)
  for (const t of c.tasks) {
    assert.ok(c.groups.some((g) => g.id === t.group), `задание ${t.id}: колонка`)
    assert.ok(t.subtasks.length >= 1 && t.subtasks.length <= 12, `задание ${t.id}: подпункты`)
    assert.ok(t.slots.length >= 1, `задание ${t.id}: исполнитель`)
    for (const s of t.slots) assert.ok(s === 'all' || s === 'any' || isRoleId(s), `задание ${t.id}: роль ${s}`)
    assert.ok(c.epochs.some((e) => e.id === t.epoch), `задание ${t.id}: эпоха`)
    assert.ok(t.title && t.text, `задание ${t.id}: текст`)
  }
})

test('в подпунктах и колонках нет лишних номеров', () => {
  const ids = new Set(c.tasks.map((t) => t.id))
  for (const id of Object.keys(SUBTASKS)) assert.ok(ids.has(Number(id)), `подпункты для несуществующего задания ${id}`)
  for (const id of Object.keys(GROUP_OF)) assert.ok(ids.has(Number(id)), `колонка для несуществующего задания ${id}`)
  assert.equal(Object.keys(GROUP_OF).length, 84)
})

test('связи: 70 штук, зависимость всегда раньше по порядку и не из более поздней эпохи', () => {
  let links = 0
  for (const t of c.tasks) {
    for (const d of t.deps) {
      links++
      const dep = c.taskById.get(d)!
      assert.ok(dep, `задание ${t.id}: нет зависимости ${d}`)
      assert.ok(dep.epoch <= t.epoch, `задание ${t.id}: зависимость ${d} из более поздней эпохи`)
      assert.ok(dep.order < t.order, `задание ${t.id}: зависимость ${d} стоит позже по порядку`)
      assert.ok(dep.opens.includes(t.id))
    }
  }
  assert.equal(links, 70)
})

test('порядок идёт по эпохам без пропусков', () => {
  c.tasks.forEach((t, i) => {
    assert.equal(t.order, i)
    if (i) assert.ok(c.tasks[i - 1].epoch <= t.epoch)
  })
})

test('главная цепочка до вех: 2, 79, 80, 48, 51, 53, 60, 65, 67', () => {
  const chain = [2, 79, 80, 48, 51, 53, 60, 65, 67]
  for (let i = 1; i < chain.length; i++) assert.ok(c.taskById.get(chain[i])!.deps.includes(chain[i - 1]), `${chain[i - 1]} → ${chain[i]}`)
  for (const m of [68, 69, 70, 71, 72]) assert.ok(c.taskById.get(m)!.deps.includes(67))
})

test('квесты: 27 штук, условия либо квест вкладки, либо внешнее; вехи привязаны к заданиям', () => {
  assert.equal(c.quests.length, 27)
  assert.equal(new Set(c.quests.map((q) => q.id)).size, 27)
  for (const q of c.quests) if (q.taskId) assert.ok(c.taskById.has(q.taskId), `квест ${q.name}: задание ${q.taskId}`)
  assert.equal(c.quests.filter((q) => q.milestone).length, 7)
  for (const q of c.quests.filter((x) => x.milestone)) assert.ok(q.taskId, `веха ${q.name} без задания`)
})
