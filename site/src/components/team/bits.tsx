// Мелкие кирпичики страницы команды: кружок игрока, плашки роли, сложности и статуса.
import type { CSSProperties } from 'react'
import { DIFFICULTY, roleOf, SLOT_LABEL } from '../../data/roles'
import type { Difficulty, RoleId, Slot } from '../../data/types'
import type { MemberColor } from '../../lib/colors'
import { VIEW_LABEL, type TaskView } from '../../lib/status'

/** Кружок с первой буквой ника в цвете игрока. */
export function Who({ nick, color, size = 'md' }: { nick: string; color?: MemberColor; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`who who-${size}`} style={{ background: color?.css }} title={nick} aria-label={nick}>
      {nick.slice(0, 1).toUpperCase()}
    </span>
  )
}

export function RoleChip({ id, onRemove }: { id: RoleId; onRemove?: () => void }) {
  const role = roleOf(id)
  return (
    <span className="role-chip" style={{ '--c': role.color } as CSSProperties} title={`${role.name}. ${role.about}`}>
      {role.short}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Снять роль ${role.short}`}>
          ×
        </button>
      )}
    </span>
  )
}

/** Кто делает задание по списку: роль, «все» или «любой свободный». */
export function SlotChip({ slot }: { slot: Slot }) {
  if (slot === 'all' || slot === 'any')
    return (
      <span className="role-chip plain" title={slot === 'all' ? 'Делают все' : 'Берёт тот, кто свободнее'}>
        {SLOT_LABEL[slot]}
      </span>
    )
  return <RoleChip id={slot} />
}

export function DiffChip({ d, full }: { d: Difficulty | null; full?: boolean }) {
  if (!d)
    return (
      <span className="diff d-none" title="Сложность ещё уточняется">
        ?
      </span>
    )
  const info = DIFFICULTY[d]
  return (
    <span className={`diff d-${d}`} title={`Сложность: ${info.name}`}>
      {full ? `${info.short} · ${info.name}` : info.short}
    </span>
  )
}

const VIEW_ICON: Record<TaskView, string> = { blocked: '◌', ready: '○', doing: '◐', done: '✓' }

export function StatusBadge({ view, short }: { view: TaskView; short?: boolean }) {
  return (
    <span className={`status s-${view}`} title={VIEW_LABEL[view]}>
      <span aria-hidden>{VIEW_ICON[view]}</span>
      {!short && VIEW_LABEL[view]}
    </span>
  )
}
