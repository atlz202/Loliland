import type { Difficulty, Role, RoleId } from './types.ts'

// Порядок ролей фиксированный: в этом порядке цвета идут в градиенте игрока.
export const ROLES: Role[] = [
  { id: 'ae', name: 'Applied Energistics', short: 'AE', color: '#a06cff', about: 'МЭ-система, сборщики, кодирование всех МЭ-шаблонов. Нужен раньше всех.' },
  { id: 'coder', name: 'Кодировщик Industrial', short: 'Кодировщик', color: '#56c7ff', about: 'Кодирует шаблоны крафтов IC2 в мехи, которые ставит Industrial-1.' },
  { id: 'ind1', name: 'Industrial-1: мехи', short: 'Ind-1', color: '#3d7dff', about: 'Все мехи из китов, подключение к МЭ, потом апгрейд в промышленные.' },
  { id: 'ind2', name: 'Industrial-2: материя', short: 'Ind-2', color: '#1fc7b6', about: 'Жидкая и твёрдая материя, репликаторы, молекулярные преобразователи.' },
  { id: 'meka', name: 'Мека', short: 'Мека', color: '#9aa9bd', about: 'Поставить все мехи Mekanism из китов и закодировать автокрафты.' },
  { id: 'beekeeper', name: 'Пчеловод', short: 'Пчеловод', color: '#ffd23f', about: 'Выведение всех видов с топ-геном, фрукты для рагу, 32 совершенные пасеки.' },
  { id: 'beemech', name: 'Механик пчёл', short: 'Механик', color: '#b6e33c', about: 'Пчелиные мехи, Genetics, ферма трутней, электроламповый завод.' },
  { id: 'ragu', name: 'Рагу', short: 'Рагу', color: '#ff7eb6', about: 'Фермы на все фрукты и автокрафт Ультимативного рагу.' },
  { id: 'misc', name: 'Прочее', short: 'Прочее', color: '#3fcf6e', about: 'Буры, ферма мобов, TechGuns, QED, удача, нейтроний, изначальная мана.' },
  { id: 'dragon', name: 'Драконик', short: 'Драконик', color: '#ff4d4d', about: 'Спавнеры и души, преобразователь душ, катализатор хаоса, все драконы.' },
  { id: 'multi', name: 'Многоблочник', short: 'Многоблочник', color: '#ff9838', about: 'Лоликовские многоблочки, энергон, четыре звезды, нефть.' },
  { id: 'quest', name: 'Квестовик', short: 'Квестовик', color: '#e052d6', about: 'Квесты «Испытаний» и финальные крафты вех. Идёт параллельно, только один человек.' },
]

/** Роли, которые можно брать нескольким людям и в любом количестве. Квестовик отдельно. */
export const WORK_ROLES: RoleId[] = ROLES.filter((r) => r.id !== 'quest').map((r) => r.id)

const BY_ID = new Map(ROLES.map((r) => [r.id, r]))
export const roleOf = (id: RoleId): Role => BY_ID.get(id)!
export const isRoleId = (s: string): s is RoleId => BY_ID.has(s as RoleId)
export const roleIndex = (id: RoleId) => ROLES.findIndex((r) => r.id === id)

export const DIFFICULTY: Record<Difficulty, { short: string; name: string; hours: number }> = {
  L: { short: 'Л', name: 'лёгкая', hours: 0.5 },
  M: { short: 'С', name: 'средняя', hours: 2 },
  H: { short: 'Т', name: 'сложная', hours: 6 },
  X: { short: 'СТ', name: 'суперсложная', hours: 12 },
}

/** Условная нагрузка задания в часах. Если сложность ещё не решена, считаем как среднюю. */
export const taskHours = (d: Difficulty | null) => DIFFICULTY[d ?? 'M'].hours

export const SLOT_LABEL: Record<'all' | 'any', string> = { all: 'Все', any: 'Любой свободный' }
