// Приглашения в команду: ссылки (на 1–5 входов или без ограничений) и личные приглашения по нику.
import {
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore'
import { db } from './firebase'
import { MAX_MEMBERS, teamRef, toTeam, type Team } from './teams'

// ---------- Ссылки ----------

export interface InviteLink {
  token: string
  /** 0 — без ограничений. */
  maxUses: number
  uses: number
  revoked: boolean
  at: Timestamp | null
}

/** Сколько входов можно дать ссылке. 0 значит «без ограничений». */
export const LINK_USES = [1, 2, 3, 4, 5, 0] as const

const TOKEN_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
export const TOKEN_RE = /^[A-Za-z0-9]{20}$/

function randomToken() {
  let out = ''
  while (out.length < 20) {
    // Байты от 248 и выше отбрасываем, чтобы все символы были равновероятны.
    for (const b of crypto.getRandomValues(new Uint8Array(32))) if (b < 248 && out.length < 20) out += TOKEN_CHARS[b % 62]
  }
  return out
}

const linkRef = (teamId: string, token: string) => doc(db, 'teams', teamId, 'invites', token)

const toLink = (token: string, d: DocumentData): InviteLink => ({
  token,
  maxUses: Number(d.maxUses) || 0,
  uses: Number(d.uses) || 0,
  revoked: Boolean(d.revoked),
  at: (d.at as Timestamp) ?? null,
})

export const linkUrl = (teamId: string, token: string) => `${location.origin}/join/${teamId}/${token}`
export const linkUsedUp = (l: InviteLink) => l.maxUses > 0 && l.uses >= l.maxUses
export const linkWorks = (l: InviteLink) => !l.revoked && !linkUsedUp(l)

/** Все ссылки команды, новые сверху. Видит только капитан. */
export function watchLinks(teamId: string, cb: (links: InviteLink[]) => void, onError: (e: Error) => void) {
  return onSnapshot(
    collection(db, 'teams', teamId, 'invites'),
    (snap) =>
      cb(
        snap.docs
          .map((d) => toLink(d.id, d.data({ serverTimestamps: 'estimate' })))
          .sort((a, b) => (b.at?.toMillis() ?? 0) - (a.at?.toMillis() ?? 0)),
      ),
    onError,
  )
}

export async function createLink(teamId: string, uid: string, maxUses: number): Promise<string> {
  const token = randomToken()
  await setDoc(linkRef(teamId, token), { maxUses, uses: 0, revoked: false, by: uid, at: serverTimestamp() })
  return token
}

export const revokeLink = (teamId: string, token: string) => updateDoc(linkRef(teamId, token), { revoked: true })
export const deleteLink = (teamId: string, token: string) => deleteDoc(linkRef(teamId, token))

export interface LinkPreview {
  team: Team | null
  link: InviteLink | null
}

/** Что показать человеку, который открыл ссылку: команду и саму ссылку. */
export async function loadLink(teamId: string, token: string): Promise<LinkPreview> {
  if (!TOKEN_RE.test(token)) return { team: null, link: null }
  const [team, link] = await Promise.all([getDoc(teamRef(teamId)), getDoc(linkRef(teamId, token))])
  return {
    team: team.exists() ? toTeam(team.id, team.data()) : null,
    link: link.exists() ? toLink(link.id, link.data()) : null,
  }
}

export type LinkError = 'link-not-found' | 'link-revoked' | 'link-used' | 'already-member' | 'team-full'

/** Вход по ссылке: одной пачкой добавляет в команду, увеличивает счётчик ссылки и оставляет отметку о входе. */
export async function joinByLink(uid: string, nickname: string, teamId: string, token: string) {
  if (!TOKEN_RE.test(token)) throw new Error('link-not-found' satisfies LinkError)
  await runTransaction(db, async (tx) => {
    const teamSnap = await tx.get(teamRef(teamId))
    const linkSnap = await tx.get(linkRef(teamId, token))
    if (!teamSnap.exists() || !linkSnap.exists()) throw new Error('link-not-found' satisfies LinkError)
    const team = toTeam(teamId, teamSnap.data())
    const link = toLink(token, linkSnap.data())
    if (team.members.includes(uid)) throw new Error('already-member' satisfies LinkError)
    if (team.members.length >= MAX_MEMBERS) throw new Error('team-full' satisfies LinkError)
    if (uid in team.invited) {
      // У игрока есть ещё и личное приглашение: входим по нему, ссылка не тратится.
      tx.update(teamRef(teamId), { members: arrayUnion(uid), [`memberNicks.${uid}`]: nickname, [`invited.${uid}`]: deleteField() })
      tx.delete(invitationRef(teamId, uid))
      return
    }
    if (link.revoked) throw new Error('link-revoked' satisfies LinkError)
    if (linkUsedUp(link)) throw new Error('link-used' satisfies LinkError)
    tx.update(teamRef(teamId), { members: arrayUnion(uid), [`memberNicks.${uid}`]: nickname })
    tx.update(linkRef(teamId, token), { uses: link.uses + 1 })
    tx.set(doc(db, 'teams', teamId, 'joins', uid), { token, at: serverTimestamp() })
  })
}

// ---------- Личные приглашения ----------

export interface Invitation {
  id: string
  teamId: string
  teamName: string
  server: string
  toUid: string
  toNick: string
  fromUid: string
  fromNick: string
  at: Timestamp | null
}

export interface FoundUser {
  uid: string
  nickname: string
}

const invitationRef = (teamId: string, toUid: string) => doc(db, 'invitations', `${teamId}_${toUid}`)

/** Игроки, чей ник начинается с этих букв. Не больше восьми. */
export async function searchUsers(prefix: string): Promise<FoundUser[]> {
  const p = prefix.trim().toLowerCase()
  if (p.length < 2) return []
  const q = query(collection(db, 'users'), where('nicknameLower', '>=', p), where('nicknameLower', '<=', `${p}`), limit(8))
  return (await getDocs(q)).docs.map((d) => ({ uid: d.id, nickname: d.data().nickname as string }))
}

/** Приглашения, которые пришли мне. */
export function watchMyInvitations(uid: string, cb: (list: Invitation[]) => void, onError: (e: Error) => void) {
  const q = query(collection(db, 'invitations'), where('toUid', '==', uid))
  return onSnapshot(
    q,
    (snap) =>
      cb(
        snap.docs.map((d) => {
          const v = d.data({ serverTimestamps: 'estimate' })
          return {
            id: d.id,
            teamId: v.teamId,
            teamName: v.teamName,
            server: v.server,
            toUid: v.toUid,
            toNick: v.toNick,
            fromUid: v.fromUid,
            fromNick: v.fromNick,
            at: v.at ?? null,
          }
        }),
      ),
    onError,
  )
}

/** Капитан зовёт игрока: запись в команде даёт право войти, отдельный документ показывает приглашение в кабинете. */
export async function invitePlayer(team: Team, fromNick: string, to: FoundUser) {
  const batch = writeBatch(db)
  batch.update(teamRef(team.id), { [`invited.${to.uid}`]: to.nickname })
  batch.set(invitationRef(team.id, to.uid), {
    teamId: team.id,
    teamName: team.name,
    server: team.server,
    toUid: to.uid,
    toNick: to.nickname,
    fromUid: team.captainUid,
    fromNick,
    at: serverTimestamp(),
  })
  await batch.commit()
}

/** Капитан передумал. */
export async function revokeInvitation(teamId: string, toUid: string) {
  const batch = writeBatch(db)
  batch.update(teamRef(teamId), { [`invited.${toUid}`]: deleteField() })
  batch.delete(invitationRef(teamId, toUid))
  await batch.commit()
}

export type InvitationError = 'not-invited' | 'team-full' | 'not-found'

/** Принять личное приглашение. Работает и в закрытой команде. */
export async function acceptInvitation(inv: Invitation, uid: string, nickname: string) {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(teamRef(inv.teamId))
    if (!snap.exists()) throw new Error('not-found' satisfies InvitationError)
    const d = snap.data()
    const members = (d.members as string[]) ?? []
    if (!members.includes(uid)) {
      if (!(d.invited && uid in d.invited)) throw new Error('not-invited' satisfies InvitationError)
      if (members.length >= MAX_MEMBERS) throw new Error('team-full' satisfies InvitationError)
      tx.update(teamRef(inv.teamId), { members: arrayUnion(uid), [`memberNicks.${uid}`]: nickname, [`invited.${uid}`]: deleteField() })
    }
    tx.delete(invitationRef(inv.teamId, uid))
  })
}

export async function declineInvitation(inv: Invitation, uid: string) {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(teamRef(inv.teamId))
    const d = snap.data()
    const isMember = ((d?.members as string[]) ?? []).includes(uid)
    if (d?.invited && uid in d.invited && !isMember) tx.update(teamRef(inv.teamId), { [`invited.${uid}`]: deleteField() })
    tx.delete(invitationRef(inv.teamId, uid))
  })
}

// ---------- Роспуск команды ----------

/**
 * Капитан распускает команду, в которой остался один: удаляет её вместе с планом, статусами,
 * ссылками и неотвеченными приглашениями.
 */
export async function disbandTeam(team: Team, links: InviteLink[]) {
  const batch = writeBatch(db)
  for (const l of links) batch.delete(linkRef(team.id, l.token))
  for (const toUid of Object.keys(team.invited)) batch.delete(invitationRef(team.id, toUid))
  batch.delete(doc(db, 'teams', team.id, 'state', 'plan'))
  batch.delete(doc(db, 'teams', team.id, 'state', 'progress'))
  batch.delete(teamRef(team.id))
  await batch.commit()
}
