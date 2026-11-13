// Готовит настройки Firebase для сборки на GitHub: пишет .env.production.local.
//
//   FIREBASE_PROJECT=loliland-team node scripts/ci-env.mjs
//
// Настройки веб-приложения не секретные, но ключ в репозитории не лежит: GitHub принимает его
// за утёкший секрет. Поэтому они берутся с самого сайта: Firebase Hosting отдаёт их по служебному
// адресу /__/firebase/init.json. Если заданы переменные VITE_FIREBASE_* (Settings → Variables), берутся они.
import { writeFileSync } from 'node:fs'

const project = process.env.FIREBASE_PROJECT
if (!project) {
  console.error('Не задан FIREBASE_PROJECT')
  process.exit(1)
}

let config
if (process.env.VITE_FIREBASE_API_KEY) {
  config = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || `${project}.firebaseapp.com`,
    appId: process.env.VITE_FIREBASE_APP_ID || '',
  }
  console.log('Настройки взяты из переменных репозитория')
} else {
  const url = `https://${project}.web.app/__/firebase/init.json`
  const response = await fetch(url)
  if (!response.ok) {
    console.error(`${url} ответил ${response.status}. Задай переменные VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN и VITE_FIREBASE_APP_ID в настройках репозитория.`)
    process.exit(1)
  }
  config = await response.json()
  if (config.projectId !== project) {
    console.error(`${url} отдал настройки другого проекта`)
    process.exit(1)
  }
  console.log(`Настройки взяты с ${url}`)
}

if (!config.apiKey) {
  console.error('В настройках нет apiKey')
  process.exit(1)
}

const lines = [
  `VITE_FIREBASE_API_KEY=${config.apiKey}`,
  `VITE_FIREBASE_AUTH_DOMAIN=${config.authDomain || `${project}.firebaseapp.com`}`,
  `VITE_FIREBASE_PROJECT_ID=${project}`,
  `VITE_FIREBASE_APP_ID=${config.appId || ''}`,
  'VITE_USE_EMULATORS=false',
]
writeFileSync(new URL('../.env.production.local', import.meta.url), `${lines.join('\n')}\n`)
console.log(`Готово: ключ есть, appId ${config.appId ? 'есть' : 'не указан (для входа и базы он не нужен)'}`)
