import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type FieldValue,
} from 'firebase/firestore'
import { WORK_ROLES } from '../data/roles'
import type { RoleId } from '../data/types'
import { db } from './firebase'

/** Сбор команды → раздача ролей → идёт сборка. */
export type Phase = 'gathering' | 'roles' | 'running'

export interface Team {
  id: string
  name: string
  server: string
  captainUid: string
  /** В порядке вступления. */
  members: string[]
  memberNicks: Record<string, string>
  /** Открыт ли вход по ID. */
  open: boolean
  createdAt: Timestamp | null
  phase: Phase
  /** Рабочие роли игроков, без квестовика. */
  roles: Record<string, RoleId[]>
  questRunner: string | null
  /** Когда вход по ID открыли или когда в команду последний раз вошли по ID. */
  openedAt: Timestamp | null
  /** Через сколько часов без новых входов команда закрывается сама. */
  autoCloseHours: number
  /** Лично приглашённые: uid → ник. */
  invited: Record<string, string>
  planVersion: number
}

export const MAX_MEMBERS = 20
export const DEFAULT_AUTO_CLOSE_HOURS = 24

// Без похожих символов (0/O, 1/I), чтобы ID легко было продиктовать.
const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const TEAM_ID_RE = /^[A-HJ-NP-Z2-9]{6}$/

function randomTeamId() {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('')
}

export const normalizeTeamId = (raw: string) => raw.trim().toUpperCase()

export const teamRef = (id: string) => doc(db, 'teams', id)

/** Команды, созданные до появления ролей, не имеют части полей: подставляем значения по умолчанию. */
export function toTeam(id: string, d: DocumentData): Team {
  const members = (d.members as string[]) ?? []
  const rawRoles = (d.roles ?? {}) as Record<string, unknown>
  const roles: Record<string, RoleId[]> = {}
  for (const m of members) {
    const list = rawRoles[m]
    if (Array.isArray(list)) roles[m] = WORK_ROLES.filter((r) => list.includes(r))
  }
  const invited: Record<string, string> = {}
  for (const [uid, nick] of Object.entries((d.invited ?? {}) as Record<string, unknown>))
    if (typeof nick === 'string' && !members.includes(uid)) invited[uid] = nick
  const phase: Phase = d.phase === 'roles' || d.phase === 'running' ? d.phase : 'gathering'
  const hours = Number(d.autoCloseHours)
  return {
    id,
    name: d.name as string,
    server: d.server as string,
    captainUid: d.captainUid as string,
    members,
    memberNicks: (d.memberNicks as Record<string, string>) ?? {},
    open: Boolean(d.open),
    createdAt: (d.createdAt as Timestamp) ?? null,
    phase,
    roles,
    questRunner: typeof d.questRunner === 'string' && members.includes(d.questRunner) ? d.questRunner : null,
    openedAt: ((d.openedAt ?? d.createdAt) as Timestamp) ?? null,
    autoCloseHours: Number.isInteger(hours) && hours >= 1 ? hours : DEFAULT_AUTO_CLOSE_HOURS,
    invited,
    planVersion: Number.isInteger(d.planVersion) ? (d.planVersion as number) : 0,
  }
}

// Пока запись летит на сервер, время сервера ещё неизвестно: берём оценку, чтобы поля не были пустыми.
const read = (snap: DocumentSnapshot) => toTeam(snap.id, snap.data({ serverTimestamps: 'estimate' })!)

/** Когда команда закроется сама, в миллисекундах. null, если время открытия неизвестно. */
export const closesAt = (t: Team): number | null => (t.openedAt ? t.openedAt.toMillis() + t.autoCloseHours * 3600e3 : null)

/** Вход по ID открыт, но срок вышел: давно никто не входил. */
export const autoClosed = (t: Team, now = Date.now()) => t.open && (closesAt(t) ?? Infinity) <= now

/** Можно ли сейчас войти по ID. */
export const joinableById = (t: Team, now = Date.now()) => t.open && !autoClosed(t, now)

export const nickOf = (t: Team, uid: string) => t.memberNicks[uid] ?? t.invited[uid] ?? 'Игрок'

export function watchMyTeams(uid: string, cb: (teams: Team[]) => void, onError: (e: Error) => void) {
  const q = query(collection(db, 'teams'), where('members', 'array-contains', uid))
  return onSnapshot(q, (snap) => cb(snap.docs.map(read)), onError)
}

export function watchTeam(id: string, cb: (team: Team | null) => void, onError: (e: Error) => void) {
  return onSnapshot(teamRef(id), (snap) => cb(snap.exists() ? read(snap) : null), onError)
}

/**
 * Свежее состояние команды прямо с сервера. null, если команды больше нет.
 * Читает через транзакцию, а не через слушатель: она идёт отдельным запросом и отвечает,
 * даже когда слушатели застряли (так бывает, когда команду распустили с другого устройства).
 */
export async function fetchTeam(id: string): Promise<Team | null> {
  const snap = await runTransaction(db, (tx) => tx.get(teamRef(id)))
  return snap.exists() ? read(snap) : null
}

export async function createTeam(uid: string, nickname: string, server: string, name: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = randomTeamId()
    const ref = teamRef(id)
    const created = await runTransaction(db, async (tx) => {
      if ((await tx.get(ref)).exists()) return false
      tx.set(ref, {
        name: name.trim(),
        server,
        captainUid: uid,
        members: [uid],
        memberNicks: { [uid]: nickname },
        open: true,
        createdAt: serverTimestamp(),
        openedAt: serverTimestamp(),
        autoCloseHours: DEFAULT_AUTO_CLOSE_HOURS,
        phase: 'gathering',
        roles: {},
        questRunner: null,
        invited: {},
        planVersion: 0,
      })
      return true
    })
    if (created) return id
  }
  throw new Error('id-collision')
}

export type JoinError = 'not-found' | 'closed' | 'auto-closed' | 'wrong-server' | 'already-member' | 'team-full'

/** Вход по ID. Каждый вход продлевает срок, после которого команда закрывается сама. */
export async function joinTeam(uid: string, nickname: string, server: string, rawId: string): Promise<string> {
  const id = normalizeTeamId(rawId)
  if (!TEAM_ID_RE.test(id)) throw new Error('not-found' satisfies JoinError)
  const ref = teamRef(id)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('not-found' satisfies JoinError)
    const t = toTeam(id, snap.data())
    if (t.members.includes(uid)) throw new Error('already-member' satisfies JoinError)
    if (t.server !== server) throw new Error('wrong-server' satisfies JoinError)
    if (t.members.length >= MAX_MEMBERS) throw new Error('team-full' satisfies JoinError)
    if (uid in t.invited) {
      // Капитан уже звал этого игрока лично: входим по приглашению. Оно работает и в закрытой команде,
      // а в кабинете не остаётся лишней записи.
      tx.update(ref, { members: arrayUnion(uid), [`memberNicks.${uid}`]: nickname, [`invited.${uid}`]: deleteField() })
      tx.delete(doc(db, 'invitations', `${id}_${uid}`))
      return
    }
    if (!t.open) throw new Error('closed' satisfies JoinError)
    if (autoClosed(t)) throw new Error('auto-closed' satisfies JoinError)
    tx.update(ref, { members: arrayUnion(uid), [`memberNicks.${uid}`]: nickname, openedAt: serverTimestamp() })
  })
  return id
}

/** Убирает человека из команды вместе с его ролями. Так выходит сам участник и так исключает капитан. */
async function removeMember(id: string, uid: string) {
  const ref = teamRef(id)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) return
    const d = snap.data()
    const update: Record<string, FieldValue | null> = { members: arrayRemove(uid), [`memberNicks.${uid}`]: deleteField() }
    if (d.roles && uid in d.roles) update[`roles.${uid}`] = deleteField()
    if (d.questRunner === uid) update.questRunner = null
    tx.update(ref, update)
  })
}

export const leaveTeam = (uid: string, id: string) => removeMember(id, uid)
export const kickMember = (id: string, uid: string) => removeMember(id, uid)

/** Закрыть вход по ID или открыть заново. Открытие заново отсчитывает срок сначала. */
export async function setTeamOpen(id: string, open: boolean) {
  await updateDoc(teamRef(id), open ? { open, openedAt: serverTimestamp() } : { open })
}

export async function setAutoCloseHours(id: string, hours: number) {
  await updateDoc(teamRef(id), { autoCloseHours: hours })
}

export async function renameTeam(id: string, name: string) {
  await updateDoc(teamRef(id), { name: name.trim() })
}

export async function transferCaptain(id: string, uid: string) {
  await updateDoc(teamRef(id), { captainUid: uid })
}

/** Капитан начинает раздачу ролей или возвращается к ней, чтобы перераспределить задания. */
export async function setPhase(id: string, phase: Phase) {
  await updateDoc(teamRef(id), { phase })
}

/** Рабочие роли игрока. Квестовик хранится отдельно, потому что он один на команду. */
export async function setRoles(id: string, uid: string, roles: RoleId[]) {
  await updateDoc(teamRef(id), { [`roles.${uid}`]: WORK_ROLES.filter((r) => roles.includes(r)) })
}

export async function setQuestRunner(id: string, uid: string | null) {
  await updateDoc(teamRef(id), { questRunner: uid })
}

/** Взять или снять роль. Для квестовика: занять место или освободить его. */
export async function toggleRole(team: Team, uid: string, role: RoleId) {
  if (role === 'quest') return setQuestRunner(team.id, team.questRunner === uid ? null : uid)
  const mine = team.roles[uid] ?? []
  return setRoles(team.id, uid, mine.includes(role) ? mine.filter((r) => r !== role) : [...mine, role])
}
