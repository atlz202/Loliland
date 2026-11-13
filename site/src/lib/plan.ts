// Распределение заданий по игрокам. Чистая функция: одни и те же роли дают один и тот же план.
//
// Правила:
// 1. Задание роли достаётся тому, у кого эта роль. Если роль у нескольких, её задания делятся
//    между ними поровну по нагрузке этой роли. Значит, у человека с двумя ролями нагрузка вдвое больше.
// 2. Задания «любой свободный» и задания ролей, которые никто не взял, достаются самому свободному.
// 3. Задания «все» достаются всем.
// 4. Квестовик идёт параллельно: его задания не занимают место в очереди и считаются отдельно.
// 5. Порядок у каждого свой и один: задания идут по общему порядку каталога (эпохи, внутри эпохи ряды дерева
//    снизу вверх, в ряду слева направо), поэтому двух заданий в один момент у человека нет, а путь на дереве
//    не возвращается вниз.
import { taskHours, WORK_ROLES } from '../data/roles.ts'
import type { Catalog, RoleId, Task } from '../data/types.ts'

export interface PlanInput {
  catalog: Catalog
  /** Игроки в порядке вступления в команду. При равной нагрузке задание получает тот, кто раньше в списке. */
  members: string[]
  /** Рабочие роли игроков, без квестовика. */
  roles: Record<string, RoleId[]>
  questRunner: string | null
}

export interface PlanTask {
  /** Исполнители. Задание стоит в их очереди. */
  a: string[]
  /** Квестовик на этом задании. Идёт параллельно, очередь не занимает. */
  q?: string
}

export interface Plan {
  tasks: Record<string, PlanTask>
  /** Роли, которые никто не взял. Их задания розданы самым свободным. */
  uncovered: RoleId[]
  /** Квестовика не выбрали, квесты достались этому игроку. */
  questFallback: string | null
}

export const EMPTY_PLAN: Plan = { tasks: {}, uncovered: [], questFallback: null }

const workRoles = (roles: RoleId[] | undefined) => WORK_ROLES.filter((r) => roles?.includes(r))

/** Роли из каталога, которые никто в команде не взял. */
export function uncoveredRoles(catalog: Catalog, members: string[], roles: Record<string, RoleId[]>): RoleId[] {
  const taken = new Set(members.flatMap((m) => workRoles(roles[m])))
  const needed = new Set(catalog.tasks.flatMap((t) => t.slots))
  return WORK_ROLES.filter((r) => needed.has(r) && !taken.has(r))
}

export function buildPlan({ catalog, members, roles, questRunner }: PlanInput): Plan {
  if (!members.length) return EMPTY_PLAN

  const index = new Map(members.map((m, i) => [m, i]))
  const holders = new Map<RoleId, string[]>(WORK_ROLES.map((r) => [r, members.filter((m) => workRoles(roles[m]).includes(r))]))
  const total = new Map(members.map((m) => [m, 0]))
  const inEpoch = new Map<string, number>()
  const inRole = new Map<string, number>()
  const get = (map: Map<string, number>, key: string) => map.get(key) ?? 0

  let quest = questRunner && index.has(questRunner) ? questRunner : null
  let questFallback: string | null = null
  if (!quest) {
    // Квестовика нет: квесты берёт тот, у кого меньше всего ролей.
    quest = [...members].sort((x, y) => workRoles(roles[x]).length - workRoles(roles[y]).length || index.get(x)! - index.get(y)!)[0]
    questFallback = quest
  }

  const tasks: Record<string, PlanTask> = {}
  for (const task of catalog.tasks) {
    const hours = taskHours(task.difficulty)
    const assignees: string[] = []
    const add = (m: string) => {
      if (!assignees.includes(m)) assignees.push(m)
    }
    let q: string | undefined

    for (const slot of task.slots) {
      if (slot === 'quest') {
        q = quest
        continue
      }
      if (slot === 'all') {
        members.forEach(add)
        continue
      }
      const own = slot === 'any' ? [] : holders.get(slot)!
      const pool = own.length ? own : members
      const free = pool.filter((m) => !assignees.includes(m))
      const candidates = free.length ? free : pool
      // Свой держатель роли: балансируем нагрузку этой роли. Иначе берёт самый свободный в целом.
      const primary = (m: string) => (own.length ? get(inRole, `${m}|${slot}`) : total.get(m)!)
      // При равенстве оставляем цепочку у того, кто делал предыдущее звено.
      const continues = (m: string) => (task.deps.some((d) => tasks[d]?.a.includes(m)) ? 0 : 1)
      const pick = [...candidates].sort(
        (x, y) =>
          primary(x) - primary(y) ||
          get(inEpoch, `${x}|${task.epoch}`) - get(inEpoch, `${y}|${task.epoch}`) ||
          continues(x) - continues(y) ||
          index.get(x)! - index.get(y)!,
      )[0]
      add(pick)
      if (own.length) inRole.set(`${pick}|${slot}`, get(inRole, `${pick}|${slot}`) + hours)
    }

    for (const m of assignees) {
      total.set(m, total.get(m)! + hours)
      inEpoch.set(`${m}|${task.epoch}`, get(inEpoch, `${m}|${task.epoch}`) + hours)
    }
    tasks[task.id] = q ? { a: assignees, q } : { a: assignees }
  }

  return { tasks, uncovered: uncoveredRoles(catalog, members, roles), questFallback }
}

/** Все, кто отвечает за задание: исполнители и квестовик. */
export const responsible = (p: PlanTask | undefined): string[] => (p ? (p.q && !p.a.includes(p.q) ? [...p.a, p.q] : p.a) : [])

/** Очередь игрока: его задания по порядку, без квестовых. */
export const pathOf = (plan: Plan, catalog: Catalog, uid: string): Task[] => catalog.tasks.filter((t) => plan.tasks[t.id]?.a.includes(uid))

/** Задания, где игрок квестовик. */
export const questTasksOf = (plan: Plan, catalog: Catalog, uid: string): Task[] => catalog.tasks.filter((t) => plan.tasks[t.id]?.q === uid)

export interface Load {
  /** Заданий в очереди. */
  count: number
  /** Условные часы в очереди. */
  hours: number
  /** Условные часы квестов, идут параллельно. */
  questHours: number
  questCount: number
}

export function loadOf(plan: Plan, catalog: Catalog, members: string[]): Record<string, Load> {
  const out: Record<string, Load> = Object.fromEntries(members.map((m) => [m, { count: 0, hours: 0, questHours: 0, questCount: 0 }]))
  for (const task of catalog.tasks) {
    const p = plan.tasks[task.id]
    if (!p) continue
    const hours = taskHours(task.difficulty)
    for (const m of p.a) {
      if (!out[m]) continue
      out[m].count++
      out[m].hours += hours
    }
    if (p.q && out[p.q]) {
      out[p.q].questCount++
      out[p.q].questHours += hours
    }
  }
  return out
}

/** Сколько заданий и условных часов приходится на каждую роль в каталоге. */
export function roleLoads(catalog: Catalog): Record<string, { count: number; hours: number }> {
  const out: Record<string, { count: number; hours: number }> = {}
  for (const task of catalog.tasks)
    for (const slot of task.slots) {
      out[slot] ??= { count: 0, hours: 0 }
      out[slot].count++
      out[slot].hours += taskHours(task.difficulty)
    }
  return out
}
