// Общие помощники для прогона сайта в браузере на локальных эмуляторах Firebase.
// Playwright берётся из окружения (в package.json его нет, чтобы не тянуть на сервер лишнего).
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'

export const { chromium } = createRequire(import.meta.url)('playwright')

export const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
export const SHOTS = process.env.SHOTS ?? 'tests/e2e/shots'
const PROJECT = 'demo-loliland'
mkdirSync(SHOTS, { recursive: true })

export const problems = []

/** Чистит базу и аккаунты в эмуляторах. */
export async function resetEmulators() {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' })
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' })
}

/** Отдельный браузер на игрока: у каждого свой вход. */
export async function newPlayer(browser, nick, viewport = { width: 1680, height: 980 }) {
  const context = await browser.newContext({ viewport, locale: 'ru-RU' })
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {})
  const page = await context.newPage()
  page.on('pageerror', (e) => problems.push(`${nick}: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`${nick}: ${m.text()}`)
  })
  return { nick, page, context }
}

export async function fillRegistration(p) {
  const { page, nick } = p
  await page.getByLabel('Ник на Loliland').fill(nick)
  await page.getByLabel('Почта').fill(`${nick.toLowerCase()}@example.com`)
  await page.getByLabel('Пароль', { exact: true }).fill('secret123')
  await page.getByLabel('Пароль ещё раз').fill('secret123')
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click()
}

export async function register(p) {
  await p.page.goto(`${BASE}/register`)
  await fillRegistration(p)
  await p.page.waitForURL('**/cabinet')
  await p.page.getByRole('heading', { name: p.nick }).waitFor()
}

/** Вход уже зарегистрированного игрока (в новом окне браузера). */
export async function login(p) {
  await p.page.goto(`${BASE}/login`)
  await p.page.getByLabel('Почта').fill(`${p.nick.toLowerCase()}@example.com`)
  await p.page.getByLabel('Пароль').fill('secret123')
  await p.page.getByRole('button', { name: 'Войти' }).click()
  await p.page.waitForURL('**/cabinet')
}

export const shot = (p, name, options = {}) => p.page.screenshot({ path: `${SHOTS}/${name}.png`, ...options })

export function check(condition, message) {
  if (!condition) throw new Error(`Проверка не прошла: ${message}`)
  console.log(`  ✓ ${message}`)
}
