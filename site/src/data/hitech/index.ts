import type { Catalog, Task } from '../types.ts'
import { DAYS, EPOCHS, GROUP_OF, GROUPS, NOTES, SUBTASKS } from './extras.ts'
import { QUEST_TAB, QUESTS } from './quests.ts'
import { TASKS } from './tasks.ts'

/** Меняй при каждом обновлении списка заданий: по версии видно, на каком списке построен план команды. */
const VERSION = '2026-11-13'

function build(): Catalog {
  const byId = new Map(TASKS.map((t) => [t.id, t]))
  const position = new Map(TASKS.map((t, i) => [t.id, i]))
  const column = new Map(GROUPS.map((g, i) => [g.id, i]))
  const epochIndex = new Map(EPOCHS.map((e, i) => [e.id, i]))

  for (const t of TASKS) {
    const group = GROUP_OF[t.id]
    if (!group) throw new Error(`Задание ${t.id}: не указана колонка дерева`)
    if (!column.has(group)) throw new Error(`Задание ${t.id}: нет колонки ${group}`)
    for (const d of t.deps) if (!byId.has(d)) throw new Error(`Задание ${t.id}: нет задания ${d}`)
  }

  // Ряд задания внутри эпохи, считая снизу. Идём по списку: задание встаёт в самый нижний свободный ряд
  // своей колонки, но строго выше заданий этой же эпохи, от которых зависит. Эпохи на дереве тоже идут
  // снизу вверх, поэтому любая связь смотрит вверх.
  const level = new Map<number, number>()
  for (const epoch of EPOCHS) {
    const pending = TASKS.filter((t) => t.epoch === epoch.id)
    const taken = new Set<string>()
    while (pending.length) {
      const i = pending.findIndex((t) => t.deps.every((d) => level.has(d) || epochIndex.get(byId.get(d)!.epoch)! > epochIndex.get(epoch.id)!))
      if (i < 0) throw new Error(`Круговая зависимость в эпохе ${epoch.id}: ${pending.map((t) => t.id).join(', ')}`)
      const [t] = pending.splice(i, 1)
      const below = t.deps.filter((d) => byId.get(d)!.epoch === epoch.id).map((d) => level.get(d)!)
      let row = 1 + Math.max(0, ...below)
      while (taken.has(`${GROUP_OF[t.id]}|${row}`)) row++
      taken.add(`${GROUP_OF[t.id]}|${row}`)
      level.set(t.id, row)
    }
  }
  if (level.size !== TASKS.length) throw new Error('Не все задания попали в эпохи')

  // Общий порядок: эпоха за эпохой, внутри эпохи ряд за рядом снизу вверх, в ряду слева направо.
  // Путь игрока идёт в этом же порядке, поэтому на дереве он не возвращается вниз.
  const ordered = [...TASKS].sort(
    (a, b) =>
      epochIndex.get(a.epoch)! - epochIndex.get(b.epoch)! ||
      level.get(a.id)! - level.get(b.id)! ||
      column.get(GROUP_OF[a.id])! - column.get(GROUP_OF[b.id])!,
  )
  const orderOf = new Map(ordered.map((t, i) => [t.id, i]))

  const tasks: Task[] = TASKS.map((t) => ({
    ...t,
    group: GROUP_OF[t.id],
    subtasks: SUBTASKS[t.id] ?? [],
    note: NOTES[t.id],
    opens: TASKS.filter((o) => o.deps.includes(t.id))
      .map((o) => o.id)
      .sort((a, b) => position.get(a)! - position.get(b)!),
    level: level.get(t.id)!,
    order: orderOf.get(t.id)!,
  })).sort((a, b) => a.order - b.order)

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
