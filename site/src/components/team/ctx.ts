import type { Catalog } from '../../data/types'
import type { MemberColor } from '../../lib/colors'
import type { Plan } from '../../lib/plan'
import type { Progress } from '../../lib/status'
import type { Team } from '../../lib/teams'

/** Всё, что нужно вкладкам и панели команды. Собирается один раз на странице команды. */
export interface TeamCtx {
  team: Team
  catalog: Catalog
  /** Кому какое задание. null, пока роли не раздают. */
  plan: Plan | null
  /** План ещё не утверждён капитаном: это расчёт по текущим ролям, он меняется на глазах. */
  preview: boolean
  progress: Progress
  colors: Record<string, MemberColor>
  uid: string
  nickname: string
  isCaptain: boolean
  /** Распределение завершено, задания можно отмечать. */
  running: boolean
  /** Выполнить действие и показать ошибку, если она случится. */
  run: (action: Promise<unknown>) => Promise<unknown>
  /** Открыть карточку задания. from — элемент, из которого она «вырастает». */
  openTask: (id: number, from?: Element | null) => void
}
