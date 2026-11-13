// Состояние заданий и квестов команды и всё, что из него выводится.
import type { Catalog, Task } from '../data/types.ts'

export type TaskState = 'todo' | 'doing' | 'done'
/** Как задание показывается: ждёт других, можно начинать, в работе, готово. */
export type TaskView = 'blocked' | 'ready' | 'doing' | 'done'

export interface TaskProgress {
  s: TaskState
  /** Номера отмеченных подпунктов. */
  sub: number[]
  by?: string
}

/** Этапы квеста по порядку. */
export const QUEST_STAGES = ['Не начат', 'Собираем ресурсы', 'Готов к сдаче', 'Сдан'] as const
export const QUEST_DONE = QUEST_STAGES.length - 1

export interface Progress {
  tasks: Record<string, TaskProgress>
  quests: Record<string, { st: number; by?: string }>
}

export const EMPTY_PROGRESS: Progress = { tasks: {}, quests: {} }

export const stateOf = (p: Progress, id: number): TaskState => p.tasks[id]?.s ?? 'todo'
export const subDone = (p: Progress, id: number): number[] => p.tasks[id]?.sub ?? []
export const questStage = (p: Progress, id: number): number => p.quests[id]?.st ?? 0

/** Зависимости, которые ещё не готовы. */
export const blockersOf = (task: Task, p: Progress): number[] => task.deps.filter((d) => stateOf(p, d) !== 'done')

export function viewOf(task: Task, p: Progress): TaskView {
  const s = stateOf(p, task.id)
  if (s !== 'todo') return s
  return blockersOf(task, p).length ? 'blocked' : 'ready'
}

export const VIEW_LABEL: Record<TaskView, string> = {
  blocked: 'Ждёт других заданий',
  ready: 'Можно начинать',
  doing: 'В работе',
  done: 'Готово',
}

export interface Summary {
  total: number
  done: number
  doing: number
  percent: number
  /** Первая эпоха, где ещё есть незакрытые задания. null, если закрыто всё. */
  epoch: number | null
}

export function summarize(catalog: Catalog, p: Progress): Summary {
  let done = 0
  let doing = 0
  let epoch: number | null = null
  for (const t of catalog.tasks) {
    const s = stateOf(p, t.id)
    if (s === 'done') done++
    else {
      if (s === 'doing') doing++
      if (epoch === null || t.epoch < epoch) epoch = t.epoch
    }
  }
  const total = catalog.tasks.length
  return { total, done, doing, percent: total ? Math.round((done / total) * 100) : 0, epoch }
}
