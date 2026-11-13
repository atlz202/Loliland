// Проверка правил базы. Запуск: npm run test:rules (поднимает эмулятор Firestore сам).
import { after, before, beforeEach, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'

let env
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-loliland-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
after(() => env.cleanup())
beforeEach(() => env.clearFirestore())

const T = 'ABCDEF'
const TOKEN = 'abcdefghij0123456789'
const as = (uid) => env.authenticatedContext(uid).firestore()
const teamRef = (uid, id = T) => doc(as(uid), 'teams', id)
/** Запись в обход правил: чтобы подготовить состояние, которое обычным путём не получить. */
const admin = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()))

async function registerUser(uid, nick) {
  const db = as(uid)
  const b = writeBatch(db)
  b.set(doc(db, 'nicknames', nick.toLowerCase()), { uid })
  b.set(doc(db, 'users', uid), { nickname: nick, nicknameLower: nick.toLowerCase(), createdAt: serverTimestamp() })
  return b.commit()
}

const team = (uid, nick, extra = {}) => ({
  name: 'Пчёлки',
  server: 'hitech',
  captainUid: uid,
  members: [uid],
  memberNicks: { [uid]: nick },
  open: true,
  createdAt: serverTimestamp(),
  openedAt: serverTimestamp(),
  autoCloseHours: 24,
  phase: 'gathering',
  roles: {},
  questRunner: null,
  invited: {},
  planVersion: 0,
  ...extra,
})

const joinById = (uid, nick, id = T) =>
  updateDoc(teamRef(uid, id), { members: arrayUnion(uid), [`memberNicks.${uid}`]: nick, openedAt: serverTimestamp() })

function joinByLink(uid, nick, token = TOKEN, id = T) {
  const db = as(uid)
  const b = writeBatch(db)
  b.update(doc(db, 'teams', id), { members: arrayUnion(uid), [`memberNicks.${uid}`]: nick })
  b.update(doc(db, 'teams', id, 'invites', token), { uses: increment(1) })
  b.set(doc(db, 'teams', id, 'joins', uid), { token, at: serverTimestamp() })
  return b.commit()
}

const makeLink = (uid, maxUses, token = TOKEN, id = T) =>
  setDoc(doc(as(uid), 'teams', id, 'invites', token), { maxUses, uses: 0, revoked: false, by: uid, at: serverTimestamp() })

const invitation = (toUid, toNick, extra = {}) => ({
  teamId: T,
  toUid,
  toNick,
  teamName: 'Пчёлки',
  server: 'hitech',
  fromUid: 'alice',
  fromNick: 'Alice',
  at: serverTimestamp(),
  ...extra,
})

function invite(byUid, toUid, toNick) {
  const db = as(byUid)
  const b = writeBatch(db)
  b.update(doc(db, 'teams', T), { [`invited.${toUid}`]: toNick })
  b.set(doc(db, 'invitations', `${T}_${toUid}`), invitation(toUid, toNick, { fromUid: byUid }))
  return b.commit()
}

/** Алиса капитан, Боб и Ева зарегистрированы, но не в команде. */
async function withTeam() {
  await registerUser('alice', 'Alice')
  await registerUser('bob', 'Bob')
  await registerUser('eve', 'Eve')
  await setDoc(teamRef('alice'), team('alice', 'Alice'))
}

/** Алиса капитан, Боб и Ева в команде. */
async function withMembers() {
  await withTeam()
  await joinById('bob', 'Bob')
  await joinById('eve', 'Eve')
}

// ---------- Регистрация ----------

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

test('поиск игрока по началу ника: только вошедшим и не больше 10 за раз', async () => {
  await registerUser('alice', 'Alice_1')
  await registerUser('bob', 'Bob')
  const byPrefix = (db, n) => {
    const base = [where('nicknameLower', '>=', 'al'), where('nicknameLower', '<=', 'al')]
    return query(collection(db, 'users'), ...base, ...(n ? [limit(n)] : []))
  }
  const found = await assertSucceeds(getDocs(byPrefix(as('bob'), 8)))
  if (found.size !== 1 || found.docs[0].id !== 'alice') throw new Error('поиск вернул не то')
  await assertFails(getDocs(byPrefix(as('bob'), 0)))
  await assertFails(getDocs(byPrefix(as('bob'), 50)))
  await assertFails(getDocs(byPrefix(env.unauthenticatedContext().firestore(), 8)))
})

// ---------- Создание команды ----------

test('команда: создатель становится капитаном', async () => {
  await registerUser('alice', 'Alice')
  await assertSucceeds(setDoc(teamRef('alice'), team('alice', 'Alice')))
})

test('команда: нельзя создать с чужим ником, лишним участником, плохим ID или сервером', async () => {
  await registerUser('alice', 'Alice')
  const make = (extra, id = T) => setDoc(teamRef('alice', id), team('alice', 'Alice', extra))
  await assertFails(setDoc(teamRef('alice'), team('alice', 'Fake')))
  await assertFails(make({ members: ['alice', 'bob'] }))
  await assertFails(make({}, 'ABCDE0'))
  await assertFails(make({ server: 'nope' }))
  await assertFails(make({ open: false }))
})

test('команда: при создании нельзя подсунуть готовые роли, этап или план', async () => {
  await registerUser('alice', 'Alice')
  const make = (extra) => setDoc(teamRef('alice'), team('alice', 'Alice', extra))
  await assertFails(make({ phase: 'running' }))
  await assertFails(make({ roles: { alice: ['ae'] } }))
  await assertFails(make({ questRunner: 'alice' }))
  await assertFails(make({ invited: { bob: 'Bob' } }))
  await assertFails(make({ autoCloseHours: 100 }))
  await assertFails(make({ planVersion: 5 }))
  await assertFails(make({ openedAt: Timestamp.fromMillis(Date.now() + 1e9) }))
  await assertFails(make({ secret: 1 }))
  // Старый вид команды, без новых полей.
  const { openedAt, autoCloseHours, phase, roles, questRunner, invited, planVersion, ...old } = team('alice', 'Alice')
  void [openedAt, autoCloseHours, phase, roles, questRunner, invited, planVersion]
  await assertFails(setDoc(teamRef('alice'), old))
})

// ---------- Вход по ID ----------

test('вход по ID в открытую команду', async () => {
  await withTeam()
  await assertSucceeds(joinById('bob', 'Bob'))
})

test('в закрытую команду по ID не войти', async () => {
  await withTeam()
  await updateDoc(teamRef('alice'), { open: false })
  await assertFails(joinById('bob', 'Bob'))
})

test('команда закрывается сама, если долго никто не входил, и капитан может открыть её снова', async () => {
  await withTeam()
  const hoursAgo = (h) => Timestamp.fromMillis(Date.now() - h * 3600e3)
  await admin((db) => updateDoc(doc(db, 'teams', T), { openedAt: hoursAgo(25) }))
  await assertFails(joinById('bob', 'Bob'))
  // Срок считается по настройке команды.
  await assertSucceeds(updateDoc(teamRef('alice'), { autoCloseHours: 48 }))
  await assertSucceeds(joinById('bob', 'Bob'))
  await admin((db) => updateDoc(doc(db, 'teams', T), { openedAt: hoursAgo(49) }))
  await assertFails(joinById('eve', 'Eve'))
  await assertSucceeds(updateDoc(teamRef('alice'), { open: true, openedAt: serverTimestamp() }))
  await assertSucceeds(joinById('eve', 'Eve'))
})

test('при входе нельзя добавить другого, подменить ник или тронуть чужие поля', async () => {
  await withTeam()
  const ref = teamRef('bob')
  const at = { openedAt: serverTimestamp() }
  await assertFails(updateDoc(ref, { members: arrayUnion('eve'), 'memberNicks.eve': 'Eve', ...at }))
  await assertFails(updateDoc(ref, { members: arrayUnion('bob'), 'memberNicks.bob': 'Alice', ...at }))
  await assertFails(updateDoc(ref, { members: arrayUnion('bob'), 'memberNicks.bob': 'Bob', open: false, ...at }))
  await assertFails(updateDoc(ref, { members: arrayUnion('bob'), 'memberNicks.bob': 'Bob', 'roles.bob': ['ae'], ...at }))
  await assertFails(updateDoc(ref, { members: arrayUnion('bob'), 'memberNicks.bob': 'Bob', captainUid: 'bob', ...at }))
  // Без отметки времени это не вход по ID, а без ссылки и не вход по ссылке.
  await assertFails(updateDoc(ref, { members: arrayUnion('bob'), 'memberNicks.bob': 'Bob' }))
})

test('команда старого вида (без новых полей): вход по ID и роли работают', async () => {
  await registerUser('alice', 'Alice')
  await registerUser('bob', 'Bob')
  const old = { name: 'Старая', server: 'hitech', captainUid: 'alice', members: ['alice'], memberNicks: { alice: 'Alice' }, open: true }
  await admin((db) => setDoc(doc(db, 'teams', T), { ...old, createdAt: Timestamp.fromMillis(Date.now() - 3600e3) }))
  await assertSucceeds(joinById('bob', 'Bob'))
  await assertFails(updateDoc(teamRef('bob'), { 'roles.bob': ['ae'] }))
  await assertSucceeds(updateDoc(teamRef('alice'), { phase: 'roles' }))
  await assertSucceeds(updateDoc(teamRef('bob'), { 'roles.bob': ['ae'] }))
  await assertSucceeds(updateDoc(teamRef('bob'), { questRunner: 'bob' }))
  // Старой команде больше суток: по ID уже не войти.
  await registerUser('eve', 'Eve')
  await admin((db) => setDoc(doc(db, 'teams', 'ZZZZZZ'), { ...old, createdAt: Timestamp.fromMillis(Date.now() - 30 * 3600e3) }))
  await assertFails(joinById('eve', 'Eve', 'ZZZZZZ'))
})

// ---------- Вход по ссылке ----------

test('ссылку создаёт только капитан, с числом входов от 1 до 5 или без ограничений', async () => {
  await withMembers()
  await assertSucceeds(makeLink('alice', 1))
  await assertSucceeds(makeLink('alice', 5, 'B'.repeat(20)))
  await assertSucceeds(makeLink('alice', 0, 'C'.repeat(20)))
  await assertFails(makeLink('alice', 6, 'D'.repeat(20)))
  await assertFails(makeLink('alice', -1, 'E'.repeat(20)))
  await assertFails(makeLink('alice', 1, 'short'))
  await assertFails(makeLink('bob', 1, 'F'.repeat(20)))
  const ref = doc(as('alice'), 'teams', T, 'invites', 'G'.repeat(20))
  await assertFails(setDoc(ref, { maxUses: 1, uses: 1, revoked: false, by: 'alice', at: serverTimestamp() }))
  await assertFails(setDoc(ref, { maxUses: 1, uses: 0, revoked: false, by: 'bob', at: serverTimestamp() }))
  // Список ссылок видит только капитан.
  await assertSucceeds(getDocs(collection(as('alice'), 'teams', T, 'invites')))
  await assertFails(getDocs(collection(as('bob'), 'teams', T, 'invites')))
})

test('одноразовая ссылка: первый входит даже в закрытую команду, второй уже нет', async () => {
  await withTeam()
  await updateDoc(teamRef('alice'), { open: false })
  await makeLink('alice', 1)
  await assertSucceeds(joinByLink('bob', 'Bob'))
  await assertFails(joinByLink('eve', 'Eve'))
  const t = (await getDoc(teamRef('alice'))).data()
  if (t.members.join() !== 'alice,bob') throw new Error(`участники: ${t.members}`)
})

test('ссылка на несколько входов и без ограничений', async () => {
  await withTeam()
  await registerUser('dan', 'Dan')
  await makeLink('alice', 2)
  await assertSucceeds(joinByLink('bob', 'Bob'))
  await assertSucceeds(joinByLink('eve', 'Eve'))
  await assertFails(joinByLink('dan', 'Dan'))
  await makeLink('alice', 0, 'U'.repeat(20))
  await assertSucceeds(joinByLink('dan', 'Dan', 'U'.repeat(20)))
})

test('отозванная ссылка не работает, вернуть её может только капитан', async () => {
  await withTeam()
  await makeLink('alice', 0)
  const link = (uid) => doc(as(uid), 'teams', T, 'invites', TOKEN)
  await assertSucceeds(updateDoc(link('alice'), { revoked: true }))
  await assertFails(joinByLink('bob', 'Bob'))
  await assertFails(updateDoc(link('bob'), { revoked: false }))
  await assertFails(updateDoc(link('alice'), { maxUses: 5 }))
  await assertSucceeds(updateDoc(link('alice'), { revoked: false }))
  await assertSucceeds(joinByLink('bob', 'Bob'))
})

test('ссылку нельзя обойти: без счётчика, без отметки, с чужой ссылкой, накруткой', async () => {
  await withTeam()
  await registerUser('dan', 'Dan')
  await setDoc(teamRef('dan', 'QQQQQQ'), team('dan', 'Dan', { name: 'Чужие' }))
  await makeLink('dan', 0, TOKEN, 'QQQQQQ')
  await makeLink('alice', 2)
  const db = as('bob')
  const teamUpdate = { members: arrayUnion('bob'), 'memberNicks.bob': 'Bob' }
  const mark = { token: TOKEN, at: serverTimestamp() }

  // Только счётчик: накрутить входы, не вступая.
  await assertFails(updateDoc(doc(db, 'teams', T, 'invites', TOKEN), { uses: increment(1) }))
  // Вход и отметка без счётчика.
  let b = writeBatch(db)
  b.update(doc(db, 'teams', T), teamUpdate)
  b.set(doc(db, 'teams', T, 'joins', 'bob'), mark)
  await assertFails(b.commit())
  // Вход и счётчик без отметки.
  b = writeBatch(db)
  b.update(doc(db, 'teams', T), teamUpdate)
  b.update(doc(db, 'teams', T, 'invites', TOKEN), { uses: increment(1) })
  await assertFails(b.commit())
  // Счётчик сразу на два.
  b = writeBatch(db)
  b.update(doc(db, 'teams', T), teamUpdate)
  b.update(doc(db, 'teams', T, 'invites', TOKEN), { uses: increment(2) })
  b.set(doc(db, 'teams', T, 'joins', 'bob'), mark)
  await assertFails(b.commit())
  // Ссылка другой команды: счётчик там, вход здесь.
  await updateDoc(teamRef('alice'), { open: false })
  b = writeBatch(db)
  b.update(doc(db, 'teams', T), teamUpdate)
  b.update(doc(db, 'teams', 'QQQQQQ', 'invites', TOKEN), { uses: increment(1) })
  b.set(doc(db, 'teams', T, 'joins', 'bob'), mark)
  await assertFails(b.commit())
  // Отметка за другого.
  b = writeBatch(db)
  b.update(doc(db, 'teams', T), teamUpdate)
  b.update(doc(db, 'teams', T, 'invites', TOKEN), { uses: increment(1) })
  b.set(doc(db, 'teams', T, 'joins', 'eve'), mark)
  await assertFails(b.commit())
  // А честный вход проходит. После выхода можно войти по ссылке ещё раз.
  await assertSucceeds(joinByLink('bob', 'Bob'))
  await updateDoc(teamRef('bob'), { members: arrayRemove('bob'), 'memberNicks.bob': deleteField() })
  await assertSucceeds(joinByLink('bob', 'Bob'))
  await assertFails(joinByLink('eve', 'Eve'))
})

// ---------- Личные приглашения ----------

test('личное приглашение: капитан зовёт, игрок видит его у себя и принимает даже в закрытую команду', async () => {
  await withTeam()
  await updateDoc(teamRef('alice'), { open: false })
  await assertSucceeds(invite('alice', 'bob', 'Bob'))

  const mine = await assertSucceeds(getDocs(query(collection(as('bob'), 'invitations'), where('toUid', '==', 'bob'))))
  if (mine.size !== 1) throw new Error('приглашение не видно')
  await assertFails(getDoc(doc(as('eve'), 'invitations', `${T}_bob`)))
  await assertFails(getDocs(query(collection(as('eve'), 'invitations'), where('toUid', '==', 'bob'))))

  // Не приглашённый так войти не может.
  await assertFails(updateDoc(teamRef('eve'), { members: arrayUnion('eve'), 'memberNicks.eve': 'Eve', 'invited.eve': deleteField() }))

  const db = as('bob')
  const b = writeBatch(db)
  b.update(doc(db, 'teams', T), { members: arrayUnion('bob'), 'memberNicks.bob': 'Bob', 'invited.bob': deleteField() })
  b.delete(doc(db, 'invitations', `${T}_bob`))
  await assertSucceeds(b.commit())
  const t = (await getDoc(teamRef('alice'))).data()
  if (!t.members.includes('bob') || 'bob' in t.invited) throw new Error('приглашение не сработало')
})

test('личное приглашение: звать может только капитан, и только вместе с записью в команде', async () => {
  await withMembers()
  await registerUser('dan', 'Dan')
  // Участник не капитан.
  await assertFails(invite('bob', 'dan', 'Dan'))
  // Документ приглашения без записи в invited.
  await assertFails(setDoc(doc(as('alice'), 'invitations', `${T}_dan`), invitation('dan', 'Dan')))
  // Запись в invited без права: участник не может.
  await assertFails(updateDoc(teamRef('bob'), { 'invited.dan': 'Dan' }))
  // Уже участника не зовут.
  await assertFails(invite('alice', 'bob', 'Bob'))
  // От чужого имени.
  const db = as('alice')
  const b = writeBatch(db)
  b.update(doc(db, 'teams', T), { 'invited.dan': 'Dan' })
  b.set(doc(db, 'invitations', `${T}_dan`), invitation('dan', 'Dan', { fromUid: 'bob' }))
  await assertFails(b.commit())
  await assertSucceeds(invite('alice', 'dan', 'Dan'))
  // Приглашение нельзя переписать.
  await assertFails(updateDoc(doc(as('dan'), 'invitations', `${T}_dan`), { teamName: 'Другая' }))
})

test('личное приглашение: игрок может отказаться, капитан может отозвать', async () => {
  await withTeam()
  await invite('alice', 'bob', 'Bob')
  await invite('alice', 'eve', 'Eve')

  // Чужое приглашение трогать нельзя.
  await assertFails(updateDoc(teamRef('eve'), { 'invited.bob': deleteField() }))
  await assertFails(deleteDocAs('eve', 'bob'))

  let db = as('bob')
  let b = writeBatch(db)
  b.update(doc(db, 'teams', T), { 'invited.bob': deleteField() })
  b.delete(doc(db, 'invitations', `${T}_bob`))
  await assertSucceeds(b.commit())

  db = as('alice')
  b = writeBatch(db)
  b.update(doc(db, 'teams', T), { 'invited.eve': deleteField() })
  b.delete(doc(db, 'invitations', `${T}_eve`))
  await assertSucceeds(b.commit())

  // Отозванное приглашение войти уже не даёт.
  await updateDoc(teamRef('alice'), { open: false })
  await assertFails(updateDoc(teamRef('eve'), { members: arrayUnion('eve'), 'memberNicks.eve': 'Eve', 'invited.eve': deleteField() }))
})

function deleteDocAs(uid, toUid) {
  const db = as(uid)
  const b = writeBatch(db)
  b.delete(doc(db, 'invitations', `${T}_${toUid}`))
  return b.commit()
}

// ---------- Выход ----------

test('выйти может участник, но не капитан, и только сам', async () => {
  await withMembers()
  await assertFails(updateDoc(teamRef('eve'), { members: arrayRemove('bob'), 'memberNicks.bob': deleteField() }))
  await assertFails(updateDoc(teamRef('alice'), { members: arrayRemove('alice'), 'memberNicks.alice': deleteField() }))
  await assertSucceeds(updateDoc(teamRef('bob'), { members: arrayRemove('bob'), 'memberNicks.bob': deleteField() }))
})

test('при выходе роли и квестовик освобождаются, чужие не трогаются', async () => {
  await withMembers()
  await updateDoc(teamRef('alice'), { phase: 'roles' })
  await updateDoc(teamRef('bob'), { 'roles.bob': ['dragon'], questRunner: 'bob' })
  await updateDoc(teamRef('eve'), { 'roles.eve': ['ae'] })
  const out = { members: arrayRemove('bob'), 'memberNicks.bob': deleteField() }
  // Оставить за собой роли или квестовика нельзя.
  await assertFails(updateDoc(teamRef('bob'), { ...out, questRunner: null }))
  await assertFails(updateDoc(teamRef('bob'), { ...out, 'roles.bob': deleteField() }))
  // Заодно снять чужие роли тоже нельзя.
  await assertFails(updateDoc(teamRef('bob'), { ...out, 'roles.bob': deleteField(), 'roles.eve': deleteField(), questRunner: null }))
  await assertSucceeds(updateDoc(teamRef('bob'), { ...out, 'roles.bob': deleteField(), questRunner: null }))
  // Ева выходит: чужого квестовика при этом снять нельзя.
  await updateDoc(teamRef('alice'), { questRunner: 'alice' })
  await assertFails(updateDoc(teamRef('eve'), { members: arrayRemove('eve'), 'memberNicks.eve': deleteField(), 'roles.eve': deleteField(), questRunner: null }))
  await assertSucceeds(updateDoc(teamRef('eve'), { members: arrayRemove('eve'), 'memberNicks.eve': deleteField(), 'roles.eve': deleteField() }))
})

// ---------- Роли ----------

test('роли: до старта распределения брать нельзя, этап меняет только капитан', async () => {
  await withMembers()
  await assertFails(updateDoc(teamRef('bob'), { 'roles.bob': ['dragon'] }))
  await assertFails(updateDoc(teamRef('bob'), { phase: 'roles' }))
  await assertSucceeds(updateDoc(teamRef('alice'), { phase: 'roles' }))
  await assertSucceeds(updateDoc(teamRef('bob'), { 'roles.bob': ['dragon', 'multi'] }))
  await assertFails(updateDoc(teamRef('alice'), { phase: 'finished' }))
})

test('роли: участник меняет только свои, только из списка и без повторов', async () => {
  await withMembers()
  await updateDoc(teamRef('alice'), { phase: 'roles' })
  await assertSucceeds(updateDoc(teamRef('bob'), { 'roles.bob': ['ae', 'coder', 'ind1', 'ind2', 'meka', 'beekeeper', 'beemech', 'ragu', 'misc', 'dragon', 'multi'] }))
  await assertFails(updateDoc(teamRef('bob'), { 'roles.bob': ['king'] }))
  await assertFails(updateDoc(teamRef('bob'), { 'roles.bob': ['quest'] }))
  await assertFails(updateDoc(teamRef('bob'), { 'roles.bob': ['ae', 'ae'] }))
  await assertFails(updateDoc(teamRef('bob'), { 'roles.bob': 'ae' }))
  await assertFails(updateDoc(teamRef('bob'), { 'roles.eve': ['ae'] }))
  await assertFails(updateDoc(teamRef('bob'), { 'roles.bob': ['ae'], name: 'Взлом' }))
  await assertSucceeds(updateDoc(teamRef('bob'), { 'roles.bob': [] }))
  await assertSucceeds(updateDoc(teamRef('bob'), { 'roles.bob': deleteField() }))
  // Посторонний роли не берёт.
  await registerUser('dan', 'Dan')
  await assertFails(updateDoc(teamRef('dan'), { 'roles.dan': ['ae'] }))
})

test('квестовик один: взять можно свободного, отдать только своего', async () => {
  await withMembers()
  await updateDoc(teamRef('alice'), { phase: 'roles' })
  await assertSucceeds(updateDoc(teamRef('bob'), { questRunner: 'bob' }))
  await assertFails(updateDoc(teamRef('eve'), { questRunner: 'eve' }))
  await assertFails(updateDoc(teamRef('eve'), { questRunner: null }))
  await assertSucceeds(updateDoc(teamRef('bob'), { questRunner: null }))
  await assertFails(updateDoc(teamRef('eve'), { questRunner: 'bob' }))
  await assertSucceeds(updateDoc(teamRef('eve'), { questRunner: 'eve', 'roles.eve': ['misc'] }))
})

test('капитан может раздать роли за других, но только участникам', async () => {
  await withMembers()
  await assertSucceeds(updateDoc(teamRef('alice'), { phase: 'roles', 'roles.bob': ['dragon'], questRunner: 'eve' }))
  await assertFails(updateDoc(teamRef('alice'), { 'roles.dan': ['ae'] }))
  await assertFails(updateDoc(teamRef('alice'), { questRunner: 'dan' }))
  await assertSucceeds(updateDoc(teamRef('alice'), { questRunner: null }))
})

// ---------- Капитан ----------

test('закрывать, переименовывать и менять срок может только капитан', async () => {
  await withMembers()
  await assertFails(updateDoc(teamRef('bob'), { open: false }))
  await assertFails(updateDoc(teamRef('bob'), { name: 'Мои' }))
  await assertFails(updateDoc(teamRef('bob'), { autoCloseHours: 1 }))
  await assertSucceeds(updateDoc(teamRef('alice'), { name: 'Новое имя', open: false }))
  await assertSucceeds(updateDoc(teamRef('alice'), { autoCloseHours: 720 }))
  await assertFails(updateDoc(teamRef('alice'), { autoCloseHours: 0 }))
  await assertFails(updateDoc(teamRef('alice'), { autoCloseHours: 721 }))
  await assertFails(updateDoc(teamRef('alice'), { autoCloseHours: 2.5 }))
  await assertFails(updateDoc(teamRef('alice'), { name: 'Я' }))
  await assertFails(updateDoc(teamRef('alice'), { open: 'да' }))
  await assertFails(updateDoc(teamRef('alice'), { openedAt: Timestamp.fromMillis(Date.now() + 1e10) }))
  await assertFails(updateDoc(teamRef('alice'), { createdAt: serverTimestamp() }))
  await assertFails(updateDoc(teamRef('alice'), { server: 'other' }))
})

test('капитан исключает участника, но добавить никого не может', async () => {
  await withMembers()
  await updateDoc(teamRef('alice'), { phase: 'roles', 'roles.bob': ['dragon'], questRunner: 'bob' })
  // Исключить и оставить его роли или квестовика нельзя.
  await assertFails(updateDoc(teamRef('alice'), { members: arrayRemove('bob'), 'memberNicks.bob': deleteField() }))
  await assertFails(updateDoc(teamRef('alice'), { members: arrayRemove('bob'), 'memberNicks.bob': deleteField(), 'roles.bob': deleteField() }))
  await assertSucceeds(updateDoc(teamRef('alice'), { members: arrayRemove('bob'), 'memberNicks.bob': deleteField(), 'roles.bob': deleteField(), questRunner: null }))
  await registerUser('dan', 'Dan')
  await assertFails(updateDoc(teamRef('alice'), { members: arrayUnion('dan'), 'memberNicks.dan': 'Dan' }))
  await assertFails(updateDoc(teamRef('alice'), { 'memberNicks.eve': 'Hacked' }))
  await assertFails(updateDoc(teamRef('alice'), { members: arrayRemove('eve') }))
  await assertFails(updateDoc(teamRef('alice'), { members: arrayRemove('alice'), 'memberNicks.alice': deleteField() }))
})

test('капитана можно передать участнику, после этого прежний капитан теряет права', async () => {
  await withMembers()
  await assertFails(updateDoc(teamRef('alice'), { captainUid: 'dan' }))
  await assertFails(updateDoc(teamRef('bob'), { captainUid: 'bob' }))
  await assertSucceeds(updateDoc(teamRef('alice'), { captainUid: 'bob' }))
  await assertFails(updateDoc(teamRef('alice'), { name: 'Верни' }))
  await assertSucceeds(updateDoc(teamRef('bob'), { name: 'Теперь моя' }))
  // Бывший капитан теперь обычный участник и может выйти.
  await assertSucceeds(updateDoc(teamRef('alice'), { members: arrayRemove('alice'), 'memberNicks.alice': deleteField() }))
})

test('распустить команду может только капитан, и только когда остался один', async () => {
  await withMembers()
  await updateDoc(teamRef('alice'), { phase: 'roles' })
  await finish()
  const disband = (uid) => {
    const db = as(uid)
    const b = writeBatch(db)
    b.delete(doc(db, 'teams', T, 'state', 'plan'))
    b.delete(doc(db, 'teams', T, 'state', 'progress'))
    b.delete(doc(db, 'teams', T))
    return b.commit()
  }
  await assertFails(disband('alice'))
  await assertFails(disband('bob'))
  // Стереть статусы отдельно от команды тоже нельзя, пока в ней есть люди.
  await assertFails(deleteDoc(doc(as('alice'), 'teams', T, 'state', 'progress')))
  for (const m of ['bob', 'eve']) await updateDoc(teamRef('alice'), { members: arrayRemove(m), [`memberNicks.${m}`]: deleteField() })
  await assertFails(disband('bob'))
  await assertSucceeds(disband('alice'))
  if ((await getDoc(teamRef('alice'))).exists()) throw new Error('команда осталась')
})

test('роспуск свежей команды одной пачкой: ссылки и приглашения уходят вместе с ней', async () => {
  await withTeam()
  await makeLink('alice', 3)
  await invite('alice', 'bob', 'Bob')
  await invite('alice', 'eve', 'Eve')
  // Ева убрала своё приглашение в обход сайта: запись о нём в команде осталась, документа уже нет.
  await assertSucceeds(deleteDoc(doc(as('eve'), 'invitations', `${T}_eve`)))
  const db = as('alice')
  const b = writeBatch(db)
  b.delete(doc(db, 'teams', T, 'invites', TOKEN))
  b.delete(doc(db, 'invitations', `${T}_bob`))
  b.delete(doc(db, 'invitations', `${T}_eve`))
  // Плана и статусов у такой команды ещё нет, удаление пустого места не мешает.
  b.delete(doc(db, 'teams', T, 'state', 'plan'))
  b.delete(doc(db, 'teams', T, 'state', 'progress'))
  b.delete(doc(db, 'teams', T))
  await assertSucceeds(b.commit())
  const left = await getDocs(query(collection(as('bob'), 'invitations'), where('toUid', '==', 'bob')))
  if (left.size !== 0) throw new Error('приглашение осталось у приглашённого')
})

test('приглашённый входит по ID или ссылке через своё приглашение: лишней записи не остаётся', async () => {
  await withTeam()
  await invite('alice', 'bob', 'Bob')
  const db = as('bob')
  const b = writeBatch(db)
  b.update(doc(db, 'teams', T), { members: arrayUnion('bob'), 'memberNicks.bob': 'Bob', 'invited.bob': deleteField() })
  b.delete(doc(db, 'invitations', `${T}_bob`))
  await assertSucceeds(b.commit())
  const t = (await getDoc(teamRef('alice'))).data()
  if ('bob' in t.invited || !t.members.includes('bob')) throw new Error('приглашение не погасилось')
  // Чужое приглашение по-прежнему не удалить.
  await invite('alice', 'eve', 'Eve')
  await assertFails(deleteDoc(doc(as('bob'), 'invitations', `${T}_eve`)))
})

test('список команд: только свои', async () => {
  await withTeam()
  const mine = query(collection(as('alice'), 'teams'), where('members', 'array-contains', 'alice'))
  await assertSucceeds(getDocs(mine))
  await assertFails(getDocs(collection(as('bob'), 'teams')))
  const spy = query(collection(as('bob'), 'teams'), where('members', 'array-contains', 'alice'))
  await assertFails(getDocs(spy))
})

// ---------- План и статусы ----------

const planDoc = (by, extra = {}) => ({
  version: 1,
  catalog: '2026-11-13',
  tasks: { 1: { a: ['alice', 'bob', 'eve'] }, 4: { a: ['bob'] }, 14: { a: ['eve'] }, 68: { a: ['eve'], q: 'bob' }, 72: { a: [], q: 'bob' } },
  uncovered: ['ragu'],
  questFallback: null,
  by,
  at: serverTimestamp(),
  ...extra,
})

/** Капитан нажал «Распределение завершено»: план, пустые статусы и этап одной пачкой. */
function finish(uid = 'alice', plan = planDoc(uid), withProgress = true) {
  const db = as(uid)
  const b = writeBatch(db)
  b.set(doc(db, 'teams', T, 'state', 'plan'), plan)
  if (withProgress) b.set(doc(db, 'teams', T, 'state', 'progress'), { tasks: {}, quests: {} })
  b.update(doc(db, 'teams', T), { phase: 'running', open: false, planVersion: plan.version })
  return b.commit()
}

const progressRef = (uid) => doc(as(uid), 'teams', T, 'state', 'progress')
const setTask = (uid, id, s = 'doing', sub = [], extra = {}) =>
  updateDoc(progressRef(uid), {
    [`tasks.${id}`]: { s, sub, by: uid, at: serverTimestamp() },
    last: { kind: 'task', id: String(id), by: uid, at: serverTimestamp() },
    ...extra,
  })
const setQuest = (uid, id, st, extra = {}) =>
  updateDoc(progressRef(uid), {
    [`quests.${id}`]: { st, by: uid, at: serverTimestamp() },
    last: { kind: 'quest', id: String(id), by: uid, at: serverTimestamp() },
    ...extra,
  })

async function withPlan() {
  await withMembers()
  await updateDoc(teamRef('alice'), { phase: 'roles', questRunner: 'bob' })
  await finish()
}

test('план: «Распределение завершено» нажимает только капитан', async () => {
  await withMembers()
  await updateDoc(teamRef('alice'), { phase: 'roles' })
  await assertFails(finish('bob', planDoc('bob')))
  await assertFails(setDoc(doc(as('bob'), 'teams', T, 'state', 'plan'), planDoc('bob')))
  await assertFails(finish('alice', planDoc('bob')))
  await assertFails(finish('alice', planDoc('alice', { extra: 1 })))
  await assertFails(finish('alice', planDoc('alice', { at: Timestamp.fromMillis(1) })))
  await assertSucceeds(finish())
  // Перераспределение: план переписывается, статусы остаются.
  await setTask('bob', 4, 'done')
  await assertSucceeds(updateDoc(teamRef('alice'), { phase: 'roles', open: true, openedAt: serverTimestamp() }))
  await assertSucceeds(finish('alice', planDoc('alice', { version: 2 }), false))
  const p = (await getDoc(progressRef('alice'))).data()
  if (p.tasks['4'].s !== 'done') throw new Error('статус потерялся')
  // Статусы нельзя обнулить, записав документ заново.
  await assertFails(setDoc(progressRef('alice'), { tasks: {}, quests: {} }))
  await assertFails(setDoc(progressRef('bob'), { tasks: {}, quests: {} }))
})

test('план и статусы видят только участники', async () => {
  await withPlan()
  await registerUser('dan', 'Dan')
  await assertSucceeds(getDoc(doc(as('bob'), 'teams', T, 'state', 'plan')))
  await assertSucceeds(getDoc(progressRef('eve')))
  await assertFails(getDoc(doc(as('dan'), 'teams', T, 'state', 'plan')))
  await assertFails(getDoc(progressRef('dan')))
  await assertFails(getDocs(collection(as('bob'), 'teams', T, 'state')))
})

test('статус задания меняет исполнитель, квестовик этого задания или капитан', async () => {
  await withPlan()
  await registerUser('dan', 'Dan')
  await assertSucceeds(setTask('bob', 4, 'doing', [0]))
  await assertSucceeds(setTask('bob', 4, 'done', [0, 1, 2]))
  await assertSucceeds(setTask('bob', 4, 'todo', []))
  // Чужое задание.
  await assertFails(setTask('eve', 4))
  await assertFails(setTask('bob', 14))
  // Общее задание могут все.
  await assertSucceeds(setTask('eve', 1, 'done'))
  await assertSucceeds(setTask('bob', 1, 'doing'))
  // Квестовик на задании и задание только для квестовика.
  await assertSucceeds(setTask('bob', 68))
  await assertSucceeds(setTask('bob', 72, 'done'))
  await assertFails(setTask('eve', 72))
  // Капитан может любое, даже которого нет в плане.
  await assertSucceeds(setTask('alice', 14, 'done'))
  await assertSucceeds(setTask('alice', 50))
  await assertFails(setTask('bob', 50))
  // Посторонний не может ничего.
  await assertFails(setTask('dan', 1))
})

test('подпункт отмечается отдельно, не затирая остальную запись задания', async () => {
  await withPlan()
  const tick = (uid, id, change, s = 'doing', by = uid) =>
    updateDoc(progressRef(uid), {
      [`tasks.${id}.sub`]: change,
      [`tasks.${id}.s`]: s,
      [`tasks.${id}.by`]: by,
      [`tasks.${id}.at`]: serverTimestamp(),
      last: { kind: 'task', id: String(id), by: uid, at: serverTimestamp() },
    })
  await setTask('bob', 4, 'doing', [0])
  await assertSucceeds(tick('bob', 4, arrayUnion(2)))
  await assertSucceeds(tick('bob', 4, arrayRemove(0)))
  const entry = (await getDoc(progressRef('bob'))).data().tasks['4']
  if (entry.sub.join() !== '2' || entry.s !== 'doing') throw new Error(`запись: ${JSON.stringify(entry)}`)
  // Общее задание: двое отмечают разные подпункты, обе отметки остаются.
  await setTask('alice', 1, 'doing', [])
  await assertSucceeds(tick('bob', 1, arrayUnion(0)))
  await assertSucceeds(tick('eve', 1, arrayUnion(1)))
  const shared = (await getDoc(progressRef('bob'))).data().tasks['1']
  if ([...shared.sub].sort().join() !== '0,1') throw new Error(`отметки: ${shared.sub}`)
  // Чужое задание и чужое имя так отметить тоже нельзя.
  await assertFails(tick('eve', 4, arrayUnion(1)))
  await assertFails(tick('bob', 4, arrayUnion(1), 'doing', 'eve'))
  await assertFails(tick('bob', 4, arrayUnion(1), 'ready'))
  // Подпункт задания, которого ещё нет в записях, одной отметкой не создать: нужна вся запись целиком.
  await assertFails(updateDoc(progressRef('bob'), { 'tasks.68.sub': arrayUnion(0), last: { kind: 'task', id: '68', by: 'bob', at: serverTimestamp() } }))
})

test('статус: за раз меняется одно задание, без подделки автора и мусора', async () => {
  await withPlan()
  const at = serverTimestamp()
  const entry = (uid, s = 'doing') => ({ s, sub: [], by: uid, at })
  const last = (uid, id, kind = 'task') => ({ kind, id: String(id), by: uid, at })
  const write = (uid, data) => updateDoc(progressRef(uid), data)
  // Два задания за раз, второе чужое.
  await assertFails(write('bob', { 'tasks.4': entry('bob'), 'tasks.14': entry('bob'), last: last('bob', 4) }))
  // last называет своё задание, а меняется чужое.
  await assertFails(write('bob', { 'tasks.14': entry('bob'), last: last('bob', 4) }))
  // Чужое имя.
  await assertFails(write('bob', { 'tasks.4': entry('eve'), last: last('bob', 4) }))
  await assertFails(write('bob', { 'tasks.4': entry('bob'), last: last('eve', 4) }))
  // Выдуманный статус, лишнее поле, слишком длинный список подпунктов.
  await assertFails(write('bob', { 'tasks.4': entry('bob', 'almost'), last: last('bob', 4) }))
  await assertFails(write('bob', { 'tasks.4': { ...entry('bob'), note: 'x' }, last: last('bob', 4) }))
  await assertFails(write('bob', { 'tasks.4': { ...entry('bob'), sub: Array.from({ length: 31 }, (_, i) => i) }, last: last('bob', 4) }))
  await assertFails(write('bob', { 'tasks.4': { ...entry('bob'), at: Timestamp.fromMillis(1) }, last: last('bob', 4) }))
  // Без last или с лишним полем в документе.
  await assertFails(write('bob', { 'tasks.4': entry('bob') }))
  await assertFails(write('bob', { 'tasks.4': entry('bob'), last: last('bob', 4), hack: true }))
  // Задание и квест одной записью.
  await assertFails(write('bob', { 'tasks.4': entry('bob'), 'quests.314': { st: 1, by: 'bob', at }, last: last('bob', 4) }))
  await assertSucceeds(write('bob', { 'tasks.4': entry('bob'), last: last('bob', 4) }))
  // Удалить запись о задании нельзя.
  await assertFails(write('bob', { 'tasks.4': deleteField(), last: last('bob', 4) }))
})

test('этапы квестов ведут квестовик и капитан', async () => {
  await withPlan()
  await assertSucceeds(setQuest('bob', 314, 1))
  await assertSucceeds(setQuest('bob', 314, 3))
  await assertSucceeds(setQuest('alice', 344, 2))
  await assertFails(setQuest('eve', 314, 0))
  await assertFails(setQuest('bob', 314, 4))
  await assertFails(setQuest('bob', 314, -1))
  await assertFails(setQuest('bob', 314, 1.5))
  await assertFails(setQuest('bob', 314, 2, { 'quests.344': { st: 0, by: 'bob', at: serverTimestamp() } }))
  // Квестовика сменили: прежний больше не может.
  await updateDoc(teamRef('alice'), { questRunner: 'eve' })
  await assertFails(setQuest('bob', 314, 2))
  await assertSucceeds(setQuest('eve', 314, 2))
})

test('квестовика не выбрали: квесты ведёт тот, кому они достались по плану', async () => {
  await withMembers()
  await updateDoc(teamRef('alice'), { phase: 'roles' })
  await finish('alice', planDoc('alice', { questFallback: 'eve', tasks: { 72: { a: [], q: 'eve' } } }))
  await assertSucceeds(setQuest('eve', 314, 1))
  await assertFails(setQuest('bob', 314, 1))
  await assertSucceeds(setTask('eve', 72, 'done'))
})
