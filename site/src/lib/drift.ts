// Что изменилось с тех пор, как капитан закрепил план: состав команды или сам список заданий.
import type { Catalog } from '../data/types.ts'
import type { Plan } from './plan.ts'

export interface Drift {
  /** В плане есть, а в команде уже нет. */
  gone: string[]
  /** В команде есть, а в плане нет: вошли после распределения. */
  newcomers: string[]
  /** Список заданий обновился после распределения. */
  catalogChanged: boolean
}

export function planDrift(plan: (Plan & { catalog?: string }) | null, members: string[], catalog: Catalog): Drift | null {
  if (!plan) return null
  const inPlan = new Set<string>()
  for (const t of Object.values(plan.tasks)) {
    for (const m of t.a) inPlan.add(m)
    if (t.q) inPlan.add(t.q)
  }
  const gone = [...inPlan].filter((m) => !members.includes(m))
  const newcomers = members.filter((m) => !inPlan.has(m))
  const catalogChanged = (plan.catalog !== undefined && plan.catalog !== catalog.version) || catalog.tasks.some((t) => !plan.tasks[t.id])
  return gone.length || newcomers.length || catalogChanged ? { gone, newcomers, catalogChanged } : null
}
