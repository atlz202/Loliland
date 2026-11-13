// План (кому какое задание) и прогресс (что сделано) команды в базе.
//   teams/{id}/state/plan      пишет капитан одной пачкой, когда нажимает «Распределение завершено»
//   teams/{id}/state/progress  один документ на команду: статусы всех заданий и этапы квестов
import { arrayRemove, arrayUnion, doc, getDoc, onSnapshot, serverTimestamp, updateDoc, writeBatch, type DocumentData } from 'firebase/firestore'
import { isRoleId } from '../data/roles'
import type { Catalog, RoleId } from '../data/types'
import { db } from './firebase'
import { buildPlan, type Plan, type PlanTask } from './plan'
import { EMPTY_PROGRESS, QUEST_DONE, type Progress, type TaskProgress, type TaskState } from './status'
import { teamRef, type Team } from './teams'

export interface StoredPlan extends Plan {
  version: number
  /** Версия списка заданий, по которой построен план. */
  catalog: string
}

const planRef = (teamId: string) => doc(db, 'teams', teamId, 'state', 'plan')
const progressRef = (teamId: string) => doc(db, 'teams', teamId, 'state', 'progress')

function toPlan(d: DocumentData): StoredPlan {
  const tasks: Record<string, PlanTask> = {}
  for (const [id, raw] of Object.entries((d.tasks ?? {}) as Record<string, { a?: unknown; q?: unknown }>)) {
    const a = Array.isArray(raw?.a) ? raw.a.filter((x): x is string => typeof x === 'string') : []
    tasks[id] = typeof raw?.q === 'string' ? { a, q: raw.q } : { a }
  }
  return {
    version: Number(d.version) || 0,
    catalog: String(d.catalog ?? ''),
    tasks,
    uncovered: Array.isArray(d.uncovered) ? d.uncovered.filter((r): r is RoleId => typeof r === 'string' && isRoleId(r)) : [],
    questFallback: typeof d.questFallback === 'string' ? d.questFallback : null,
  }
}

function toProgress(d: DocumentData | undefined): Progress {
  if (!d) return EMPTY_PROGRESS
  const tasks: Record<string, TaskProgress> = {}
  for (const [id, raw] of Object.entries((d.tasks ?? {}) as Record<string, DocumentData>)) {
    const s: TaskState = raw?.s === 'doing' || raw?.s === 'done' ? raw.s : 'todo'
    const sub = Array.isArray(raw?.sub) ? raw.sub.filter((n: unknown): n is number => Number.isInteger(n)) : []
    tasks[id] = { s, sub, by: typeof raw?.by === 'string' ? raw.by : undefined }
  }
  const quests: Progress['quests'] = {}
  for (const [id, raw] of Object.entries((d.quests ?? {}) as Record<string, DocumentData>)) {
    const st = Number.isInteger(raw?.st) ? Math.min(Math.max(raw.st, 0), QUEST_DONE) : 0
    quests[id] = { st, by: typeof raw?.by === 'string' ? raw.by : undefined }
  }
  return { tasks, quests }
}

export function watchPlan(teamId: string, cb: (plan: StoredPlan | null) => void, onError: (e: Error) => void) {
  return onSnapshot(planRef(teamId), (snap) => cb(snap.exists() ? toPlan(snap.data()) : null), onError)
}

export function watchProgress(teamId: string, cb: (progress: Progress) => void, onError: (e: Error) => void) {
  return onSnapshot(progressRef(teamId), (snap) => cb(toProgress(snap.data())), onError)
}

/**
 * «Распределение завершено»: считает план по ролям и одной пачкой записывает план,
 * переводит команду в рабочий этап и закрывает вход по ID. Статусы заданий не трогает.
 */
export async function finishDistribution(team: Team, catalog: Catalog, uid: string) {
  const plan = buildPlan({ catalog, members: team.members, roles: team.roles, questRunner: team.questRunner })
  const version = team.planVersion + 1
  const hasProgress = (await getDoc(progressRef(team.id))).exists()
  const batch = writeBatch(db)
  batch.set(planRef(team.id), {
    version,
    catalog: catalog.version,
    tasks: plan.tasks,
    uncovered: plan.uncovered,
    questFallback: plan.questFallback,
    by: uid,
    at: serverTimestamp(),
  })
  if (!hasProgress) batch.set(progressRef(team.id), { tasks: {}, quests: {} })
  batch.update(teamRef(team.id), { phase: 'running', open: false, planVersion: version })
  await batch.commit()
}

// Статусы пишутся без транзакций: запись сразу видна у себя (страница не ждёт ответа сервера),
// а если сервер её не примет, она сама откатится. Правила базы разрешают менять за раз
// ровно одно задание или один квест, названные в поле last.

const lastChange = (kind: 'task' | 'quest', id: number, uid: string) => ({ kind, id: String(id), by: uid, at: serverTimestamp() })

/** «Взять в работу», «Готово», «Отложить». При «Готово» отмечаются все подпункты, при «Отложить» снимаются. */
export function setTaskState(teamId: string, uid: string, taskId: number, s: TaskState, subtaskCount: number, prev: TaskProgress | undefined) {
  const sub = s === 'done' ? Array.from({ length: subtaskCount }, (_, i) => i) : s === 'todo' ? [] : (prev?.sub ?? [])
  return updateDoc(progressRef(teamId), {
    [`tasks.${taskId}`]: { s, sub, by: uid, at: serverTimestamp() },
    last: lastChange('task', taskId, uid),
  })
}

/**
 * Отметить или снять подпункт. Первый отмеченный подпункт сам переводит задание «в работу».
 * Подпункт добавляется и убирается на сервере, поэтому отметки двух человек одновременно не затирают друг друга.
 */
export function toggleSubtask(teamId: string, uid: string, taskId: number, index: number, prev: TaskProgress | undefined) {
  const last = lastChange('task', taskId, uid)
  if (!prev) return updateDoc(progressRef(teamId), { [`tasks.${taskId}`]: { s: 'doing', sub: [index], by: uid, at: serverTimestamp() }, last })
  const ticked = prev.sub.includes(index)
  const s: TaskState = prev.s === 'done' || (prev.s === 'todo' && !ticked) ? 'doing' : prev.s
  return updateDoc(progressRef(teamId), {
    [`tasks.${taskId}.sub`]: ticked ? arrayRemove(index) : arrayUnion(index),
    [`tasks.${taskId}.s`]: s,
    [`tasks.${taskId}.by`]: uid,
    [`tasks.${taskId}.at`]: serverTimestamp(),
    last,
  })
}

export function setQuestStage(teamId: string, uid: string, questId: number, st: number) {
  return updateDoc(progressRef(teamId), {
    [`quests.${questId}`]: { st, by: uid, at: serverTimestamp() },
    last: lastChange('quest', questId, uid),
  })
}
