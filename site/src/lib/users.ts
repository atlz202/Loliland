import { createUserWithEmailAndPassword, deleteUser } from 'firebase/auth'
import { doc, getDoc, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore'
import { auth, db } from './firebase'

export interface Profile {
  uid: string
  nickname: string
  createdAt: Timestamp | null
}

export const NICK_RE = /^[A-Za-z0-9_]{3,16}$/

export async function isNicknameFree(nickname: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'nicknames', nickname.toLowerCase()))
  return !snap.exists()
}

export async function loadProfile(uid: string): Promise<Profile | null> {
  const snap = await getDoc(doc(db, 'users', uid))
  if (!snap.exists()) return null
  const d = snap.data()
  return { uid, nickname: d.nickname, createdAt: d.createdAt ?? null }
}

/** Создаёт аккаунт и сразу занимает ник. Если ник успели занять, аккаунт удаляется. */
export async function register(email: string, password: string, nickname: string) {
  if (!(await isNicknameFree(nickname))) throw new Error('nickname-taken')
  const cred = await createUserWithEmailAndPassword(auth, email, password)
  try {
    await claimNickname(cred.user.uid, nickname)
  } catch (e) {
    await deleteUser(cred.user).catch(() => {})
    console.error(e)
    throw new Error('nickname-taken')
  }
}

/** Занимает ник для уже вошедшего пользователя без профиля. */
export async function claimNickname(uid: string, nickname: string) {
  const batch = writeBatch(db)
  batch.set(doc(db, 'nicknames', nickname.toLowerCase()), { uid })
  batch.set(doc(db, 'users', uid), {
    nickname,
    nicknameLower: nickname.toLowerCase(),
    createdAt: serverTimestamp(),
  })
  await batch.commit()
}
