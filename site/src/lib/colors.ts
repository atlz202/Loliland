// Цвет игрока собирается из его ролей: одна роль даёт её цвет, несколько дают градиент.
import { ROLES } from '../data/roles.ts'
import type { RoleId } from '../data/types.ts'

export interface MemberColor {
  /** Цвета градиента по порядку ролей. */
  stops: string[]
  /** Готовое значение для CSS background. */
  css: string
  /** Один цвет для мелких отметок. */
  solid: string
}

const NO_ROLES = '#6b7888'

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const to = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`
}

/** Сдвигает оттенок, чтобы двух игроков с одинаковыми ролями можно было различить. */
export function shiftHue(hex: string, degrees: number): string {
  const [h, s, l] = hexToHsl(hex)
  return hslToHex((h + degrees + 360) % 360, s, l)
}

export function gradientCss(stops: string[], angle = 135): string {
  return stops.length > 1 ? `linear-gradient(${angle}deg, ${stops.join(', ')})` : stops[0]
}

/** Осветляет цвет: 0 не меняет, 1 даёт белый. */
export function tint(hex: string, amount: number): string {
  const [h, s, l] = hexToHsl(hex)
  return hslToHex(h, s, l + (1 - l) * amount)
}

/**
 * Рамка карточки задания: цвета всех, кто за него отвечает, по кругу.
 * Последний цвет повторяет первый, чтобы рамка могла переливаться без шва.
 */
export function frameCss(people: MemberColor[]): string | null {
  const stops: string[] = []
  for (const p of people) for (const c of p.stops) if (stops[stops.length - 1] !== c) stops.push(c)
  if (!stops.length) return null
  if (stops.length === 1) stops.push(tint(stops[0], 0.45))
  return `linear-gradient(120deg, ${[...stops, stops[0]].join(', ')})`
}

/** Роли игрока в едином порядке, квестовик последним. */
export function orderedRoles(roles: RoleId[] | undefined, isQuestRunner: boolean): RoleId[] {
  return ROLES.filter((r) => (r.id === 'quest' ? isQuestRunner : roles?.includes(r.id))).map((r) => r.id)
}

export function memberColors(members: string[], roles: Record<string, RoleId[]>, questRunner: string | null): Record<string, MemberColor> {
  const seen = new Map<string, number>()
  const out: Record<string, MemberColor> = {}
  for (const uid of members) {
    const mine = orderedRoles(roles[uid], questRunner === uid)
    let stops = mine.length ? mine.map((id) => ROLES.find((r) => r.id === id)!.color) : [NO_ROLES]
    const key = mine.join('+')
    const repeat = seen.get(key) ?? 0
    seen.set(key, repeat + 1)
    if (repeat && mine.length) stops = stops.map((c) => shiftHue(c, repeat * 28))
    out[uid] = { stops, css: gradientCss(stops), solid: stops[0] }
  }
  return out
}
