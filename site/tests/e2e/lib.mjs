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

/**
 * Геометрия дерева на экране: куда смотрят стрелки, сидят ли концы связей на своих карточках
 * и помещается ли дерево в своё окно. Работает в любом масштабе.
 */
export const treeGeometry = (page) =>
  page.evaluate(() => {
    const out = { deps: 0, depsDown: [], depsOff: [], route: 0, routeDown: [], routeLeft: [] }
    const svg = document.querySelector('.board-svg')
    const ctm = svg.getScreenCTM()
    const onScreen = (x, y) => {
      const point = svg.createSVGPoint()
      point.x = x
      point.y = y
      return point.matrixTransform(ctm)
    }
    const rectOf = (id) => document.querySelector(`.tcard[data-task="${id}"]`).getBoundingClientRect()
    for (const path of svg.querySelectorAll('path.dep')) {
      out.deps++
      const numbers = path.getAttribute('d').match(/-?\d+(\.\d+)?/g).map(Number)
      const [x1, y1] = numbers
      const [x2, y2] = numbers.slice(-2)
      const link = path.dataset.link
      // Связь идёт от верхнего края условия к нижнему краю задания: конец должен быть выше начала.
      if (!(y2 < y1 - 1)) out.depsDown.push(link)
      const [from, to] = link.split('-').map(Number)
      const a = rectOf(from)
      const b = rectOf(to)
      const start = onScreen(x1, y1)
      const end = onScreen(x2, y2)
      const miss = Math.max(
        Math.abs(start.x - (a.left + a.width / 2)),
        Math.abs(start.y - a.top),
        Math.abs(end.x - (b.left + b.width / 2)),
        Math.abs(end.y - b.bottom),
      )
      if (miss > 1.5) out.depsOff.push(`${link}: мимо на ${miss.toFixed(1)}`)
    }
    for (const line of svg.querySelectorAll('.route line.route-flow')) {
      out.route++
      const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((k) => Number(line.getAttribute(k)))
      const link = line.parentElement.dataset.link
      if (y2 > y1 + 0.5) out.routeDown.push(link)
      if (Math.abs(y2 - y1) <= 0.5 && x2 < x1) out.routeLeft.push(link)
    }
    const view = document.querySelector('.board-scroll')
    out.overflowX = view.scrollWidth - view.clientWidth
    out.overflowY = view.scrollHeight - view.clientHeight
    out.height = view.scrollHeight
    out.zoom = document.querySelector('.zoom-value').textContent
    out.far = document.querySelector('.board').classList.contains('far')
    return out
  })

export const shot = (p, name, options = {}) => p.page.screenshot({ path: `${SHOTS}/${name}.png`, ...options })

export function check(condition, message) {
  if (!condition) throw new Error(`Проверка не прошла: ${message}`)
  console.log(`  ✓ ${message}`)
}
