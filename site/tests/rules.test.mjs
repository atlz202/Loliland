// Проверка правил базы. Запуск: npm run test:rules (поднимает эмулятор Firestore сам).
import { after, before, beforeEach, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { arrayRemove, arrayUnion, deleteField, doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch, collection, query, where, getDocs } from 'firebase/firestore'

let env
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-loliland-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
after(() => env.cleanup())
beforeEach(() => env.clearFirestore())

const as = (uid) => env.authenticatedContext(uid).firestore()

async function registerUser(uid, nick) {
  const db = as(uid)
  const b = writeBatch(db)
  b.set(doc(db, 'nicknames', nick.toLowerCase()), { uid })
  b.set(doc(db, 'users', uid), { nickname: nick, nicknameLower: nick.toLowerCase(), createdAt: serverTimestamp() })
  return b.commit()
}

const team = (uid, nick, extra = {}) => ({
  name: 'Пчёлки', server: 'hitech', captainUid: uid, members: [uid], memberNicks: { [uid]: nick },
  open: true, createdAt: serverTimestamp(), ...extra,
})

test('регистрация: ник занимается вместе с профилем', async () => {
  await assertSucceeds(registerUser('alice', 'Alice_1'))
})

test('регистрация: чужой ник занять нельзя (регистр не важен)', async () => {
  await registerUser('alice', 'Alice_1')
  await assertFails(registerUser('bob', 'alice_1'))
})

test('регистрация: второй ник тому же человеку нельзя', async () => {
  await registerUser('alice', 'Alice_1')
  const db = as('alice')
  await assertFails(setDoc(doc(db, 'nicknames', 'other'), { uid: 'alice' }))
})

test('регистрация: кривой ник и профиль за другого запрещены', async () => {
  await assertFails(registerUser('carol', 'ab'))
  await assertFails(registerUser('carol', 'плохой_ник'))
  const db = as('carol')
  const b = writeBatch(db)
  b.set(doc(db, 'nicknames', 'carol'), { uid: 'dave' })
  b.set(doc(db, 'users', 'dave'), { nickname: 'Carol', nicknameLower: 'carol', createdAt: serverTimestamp() })
  await assertFails(b.commit())
})

test('ник можно проверить без входа, профиль нельзя', async () => {
  await registerUser('alice', 'Alice_1')
  const anon = env.unauthenticatedContext().firestore()
  await assertSucceeds(getDoc(doc(anon, 'nicknames', 'alice_1')))
  await assertFails(getDoc(doc(anon, 'users', 'alice')))
})

test('команда: создатель становится капитаном', async () => {
  await registerUser('alice', 'Alice')
  await assertSucceeds(setDoc(doc(as('alice'), 'teams', 'ABCDEF'), team('alice', 'Alice')))
})

test('команда: нельзя создать с чужим ником, лишним участником, плохим ID или сервером', async () => {
  await registerUser('alice', 'Alice')
  const db = as('alice')
  await assertFails(setDoc(doc(db, 'teams', 'ABCDEF'), team('alice', 'Fake')))
  await assertFails(setDoc(doc(db, 'teams', 'ABCDEF'), team('alice', 'Alice', { members: ['alice', 'bob'] })))
  await assertFails(setDoc(doc(db, 'teams', 'ABCDE0'), team('alice', 'Alice')))
  await assertFails(setDoc(doc(db, 'teams', 'ABCDEF'), team('alice', 'Alice', { server: 'nope' })))
  await assertFails(setDoc(doc(db, 'teams', 'ABCDEF'), team('alice', 'Alice', { open: false })))
})

async function withTeam() {
  await registerUser('alice', 'Alice')
  await registerUser('bob', 'Bob')
  await registerUser('eve', 'Eve')
  await setDoc(doc(as('alice'), 'teams', 'ABCDEF'), team('alice', 'Alice'))
}

test('вход по ID в открытую команду', async () => {
  await withTeam()
  await assertSucceeds(updateDoc(doc(as('bob'), 'teams', 'ABCDEF'), { members: arrayUnion('bob'), 'memberNicks.bob': 'Bob' }))
})

test('в закрытую команду по ID не войти', async () => {
  await withTeam()
  await updateDoc(doc(as('alice'), 'teams', 'ABCDEF'), { open: false })
  await assertFails(updateDoc(doc(as('bob'), 'teams', 'ABCDEF'), { members: arrayUnion('bob'), 'memberNicks.bob': 'Bob' }))
})

test('при входе нельзя добавить другого или подменить ник', async () => {
  await withTeam()
  const db = as('bob')
  await assertFails(updateDoc(doc(db, 'teams', 'ABCDEF'), { members: arrayUnion('eve'), 'memberNicks.eve': 'Eve' }))
  await assertFails(updateDoc(doc(db, 'teams', 'ABCDEF'), { members: arrayUnion('bob'), 'memberNicks.bob': 'Alice' }))
  await assertFails(updateDoc(doc(db, 'teams', 'ABCDEF'), { members: arrayUnion('bob'), 'memberNicks.bob': 'Bob', open: false }))
})

test('закрывать и переименовывать может только капитан', async () => {
  await withTeam()
  await updateDoc(doc(as('bob'), 'teams', 'ABCDEF'), { members: arrayUnion('bob'), 'memberNicks.bob': 'Bob' })
  await assertFails(updateDoc(doc(as('bob'), 'teams', 'ABCDEF'), { open: false }))
  await assertFails(updateDoc(doc(as('bob'), 'teams', 'ABCDEF'), { name: 'Мои' }))
  await assertSucceeds(updateDoc(doc(as('alice'), 'teams', 'ABCDEF'), { name: 'Новое имя', open: false }))
  await assertFails(updateDoc(doc(as('alice'), 'teams', 'ABCDEF'), { captainUid: 'bob' }))
})

test('выйти может участник, но не капитан, и только сам', async () => {
  await withTeam()
  await updateDoc(doc(as('bob'), 'teams', 'ABCDEF'), { members: arrayUnion('bob'), 'memberNicks.bob': 'Bob' })
  await updateDoc(doc(as('eve'), 'teams', 'ABCDEF'), { members: arrayUnion('eve'), 'memberNicks.eve': 'Eve' })
  await assertFails(updateDoc(doc(as('eve'), 'teams', 'ABCDEF'), { members: arrayRemove('bob'), 'memberNicks.bob': deleteField() }))
  await assertFails(updateDoc(doc(as('alice'), 'teams', 'ABCDEF'), { members: arrayRemove('alice'), 'memberNicks.alice': deleteField() }))
  await assertSucceeds(updateDoc(doc(as('bob'), 'teams', 'ABCDEF'), { members: arrayRemove('bob'), 'memberNicks.bob': deleteField() }))
})

test('список команд: только свои', async () => {
  await withTeam()
  const mine = query(collection(as('alice'), 'teams'), where('members', 'array-contains', 'alice'))
  await assertSucceeds(getDocs(mine))
  await assertFails(getDocs(collection(as('bob'), 'teams')))
  const spy = query(collection(as('bob'), 'teams'), where('members', 'array-contains', 'alice'))
  await assertFails(getDocs(spy))
})
