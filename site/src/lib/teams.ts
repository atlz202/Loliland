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
} from 'firebase/firestore'
import { db } from './firebase'

export interface Team {
  id: string
  name: string
  server: string
  captainUid: string
  members: string[]
  memberNicks: Record<string, string>
  open: boolean
  createdAt: Timestamp | null
}

// Без похожих символов (0/O, 1/I), чтобы ID легко было продиктовать.
const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const TEAM_ID_RE = /^[A-HJ-NP-Z2-9]{6}$/

function randomTeamId() {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('')
}

export const normalizeTeamId = (raw: string) => raw.trim().toUpperCase()

function toTeam(id: string, d: Record<string, unknown>): Team {
  return {
    id,
    name: d.name as string,
    server: d.server as string,
    captainUid: d.captainUid as string,
    members: (d.members as string[]) ?? [],
    memberNicks: (d.memberNicks as Record<string, string>) ?? {},
    open: Boolean(d.open),
    createdAt: (d.createdAt as Timestamp) ?? null,
  }
}

export function watchMyTeams(uid: string, cb: (teams: Team[]) => void, onError: (e: Error) => void) {
  const q = query(collection(db, 'teams'), where('members', 'array-contains', uid))
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => toTeam(d.id, d.data()))), onError)
}

export function watchTeam(id: string, cb: (team: Team | null) => void, onError: (e: Error) => void) {
  return onSnapshot(doc(db, 'teams', id), (snap) => cb(snap.exists() ? toTeam(snap.id, snap.data()) : null), onError)
}

export async function createTeam(uid: string, nickname: string, server: string, name: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = randomTeamId()
    const ref = doc(db, 'teams', id)
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
      })
      return true
    })
    if (created) return id
  }
  throw new Error('id-collision')
}

export type JoinError = 'not-found' | 'closed' | 'wrong-server' | 'already-member'

export async function joinTeam(uid: string, nickname: string, server: string, rawId: string): Promise<string> {
  const id = normalizeTeamId(rawId)
  if (!TEAM_ID_RE.test(id)) throw new Error('not-found' satisfies JoinError)
  const ref = doc(db, 'teams', id)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('not-found' satisfies JoinError)
    const t = toTeam(id, snap.data())
    if (t.members.includes(uid)) throw new Error('already-member' satisfies JoinError)
    if (t.server !== server) throw new Error('wrong-server' satisfies JoinError)
    if (!t.open) throw new Error('closed' satisfies JoinError)
    tx.update(ref, { members: arrayUnion(uid), [`memberNicks.${uid}`]: nickname })
  })
  return id
}

export async function leaveTeam(uid: string, id: string) {
  await updateDoc(doc(db, 'teams', id), { members: arrayRemove(uid), [`memberNicks.${uid}`]: deleteField() })
}

export async function setTeamOpen(id: string, open: boolean) {
  await updateDoc(doc(db, 'teams', id), { open })
}

export async function renameTeam(id: string, name: string) {
  await updateDoc(doc(db, 'teams', id), { name: name.trim() })
}
