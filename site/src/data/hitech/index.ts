import type { Catalog, Task } from '../types.ts'
import { DAYS, EPOCHS, GROUP_OF, GROUPS, NOTES, SUBTASKS } from './extras.ts'
import { QUEST_TAB, QUESTS } from './quests.ts'
import { TASKS } from './tasks.ts'

/** Меняй при каждом обновлении списка заданий: по версии видно, на каком списке построен план команды. */
const VERSION = '2026-11-13'

function build(): Catalog {
  const byId = new Map(TASKS.map((t) => [t.id, t]))
  const position = new Map(TASKS.map((t, i) => [t.id, i]))

  // Общий порядок: эпоха за эпохой, внутри эпохи сначала то, от чего зависят другие, при равенстве как в списке.
  const ordered: number[] = []
  const placed = new Set<number>()
  for (const epoch of EPOCHS) {
    const pending = TASKS.filter((t) => t.epoch === epoch.id).map((t) => t.id)
    while (pending.length) {
      const i = pending.findIndex((id) => byId.get(id)!.deps.every((d) => placed.has(d) || byId.get(d)!.epoch > epoch.id))
      if (i < 0) throw new Error(`Круговая зависимость в эпохе ${epoch.id}: ${pending.join(', ')}`)
      const [id] = pending.splice(i, 1)
      placed.add(id)
      ordered.push(id)
    }
  }
  if (ordered.length !== TASKS.length) throw new Error('Не все задания попали в эпохи')
  const orderOf = new Map(ordered.map((id, i) => [id, i]))

  const tasks: Task[] = TASKS.map((t) => {
    const group = GROUP_OF[t.id]
    if (!group) throw new Error(`Задание ${t.id}: не указана колонка дерева`)
    for (const d of t.deps) if (!byId.has(d)) throw new Error(`Задание ${t.id}: нет задания ${d}`)
    return {
      ...t,
      group,
      subtasks: SUBTASKS[t.id] ?? [],
      note: NOTES[t.id],
      opens: TASKS.filter((o) => o.deps.includes(t.id))
        .map((o) => o.id)
        .sort((a, b) => position.get(a)! - position.get(b)!),
      order: orderOf.get(t.id)!,
    }
  }).sort((a, b) => a.order - b.order)

  return {
    server: 'hitech',
    version: VERSION,
    tasks,
    taskById: new Map(tasks.map((t) => [t.id, t])),
    epochs: EPOCHS,
    groups: GROUPS,
    days: DAYS,
    quests: QUESTS,
    questTab: QUEST_TAB,
  }
}

export const HITECH: Catalog = build()
