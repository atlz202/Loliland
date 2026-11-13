// Выкладывает firestore.rules в проект Firebase. Запускается на GitHub при выкладке сайта.
//
//   FIREBASE_PROJECT=loliland-team GOOGLE_APPLICATION_CREDENTIALS=ключ.json node scripts/deploy-rules.mjs
//
// Нужен пакет firebase-admin (в package.json его нет, на GitHub он ставится отдельным шагом).
// Если правила на сервере уже такие же, ничего не делает.
import { readFileSync } from 'node:fs'
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getSecurityRules } from 'firebase-admin/security-rules'

const projectId = process.env.FIREBASE_PROJECT
if (!projectId) {
  console.error('Не задан FIREBASE_PROJECT')
  process.exit(1)
}

initializeApp({ credential: applicationDefault(), projectId })
const rules = getSecurityRules()
const source = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')

let live = null
try {
  live = await rules.getFirestoreRuleset()
} catch (e) {
  // Правил ещё нет или их нельзя прочитать: тогда просто выкладываем.
  console.log(`Не удалось прочитать текущие правила (${e.code ?? e.message}), выкладываю заново`)
}

if (live?.source?.[0]?.content === source) {
  console.log(`Правила базы не менялись (${live.name})`)
} else {
  const released = await rules.releaseFirestoreRulesetFromSource(source)
  console.log(`Правила базы выложены: ${released.name}`)
}
