// Типы каталога заданий. Каталог статичный: один на сервер, лежит в коде сайта.

/** Рабочие роли и квестовик. Капитан — не роль, а права. */
export type RoleId =
  | 'ae'
  | 'coder'
  | 'ind1'
  | 'ind2'
  | 'meka'
  | 'beekeeper'
  | 'beemech'
  | 'ragu'
  | 'misc'
  | 'dragon'
  | 'multi'
  | 'quest'

/** Кто делает задание: роль, «все» или «любой свободный». */
export type Slot = RoleId | 'all' | 'any'

/** Л лёгкая, С средняя, Т сложная, СТ суперсложная. */
export type Difficulty = 'L' | 'M' | 'H' | 'X'

/** Что приходит из согласованного списка (tasks_list.txt и tasks_draft.md). */
export interface TaskBase {
  id: number
  epoch: number
  title: string
  text: string
  why: string
  slots: Slot[]
  slotNote?: string
  difficulty: Difficulty | null
  knowledge: boolean
  deps: number[]
  /** Уточнение к связи, например «ниобий» или «мёд». */
  depNotes?: Record<number, string>
  /** Роль и сложность ещё уточняются. */
  tbd?: boolean
}

export interface Task extends TaskBase {
  /** Колонка дерева. */
  group: string
  subtasks: string[]
  /** Оговорка, которую видно в карточке. */
  note?: string
  /** Задания, которые это открывает. */
  opens: number[]
  /** Место в общем порядке: по эпохам, внутри эпохи по связям и списку. */
  order: number
}

export interface Epoch {
  id: number
  title: string
  /** Окно времени словами: «0–30 минут», «дни 3–4». */
  window: string
  day: 1 | 2
}

export interface Group {
  id: string
  title: string
}

export interface Role {
  id: RoleId
  name: string
  short: string
  color: string
  about: string
}

export interface Quest {
  id: number
  name: string
  requires: string[]
  difficulty: 'лёгкая' | 'средняя' | 'сложная'
  note?: string
  goal?: string
  /** Ключевая веха вкладки. */
  milestone?: string
  /** Задание дерева, которое закрывает этот квест. */
  taskId?: number
}

export interface Catalog {
  server: string
  /** Меняется при каждом обновлении списка заданий. */
  version: string
  tasks: Task[]
  taskById: Map<number, Task>
  epochs: Epoch[]
  groups: Group[]
  days: { id: 1 | 2; title: string }[]
  quests: Quest[]
  questTab: string
}
