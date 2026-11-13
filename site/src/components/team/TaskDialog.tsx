// Карточка задания крупно: описание, подпункты, кто делает, что до и после.
import { useState } from 'react'
import type { Task } from '../../data/types'
import { pathOf, responsible } from '../../lib/plan'
import { blockersOf, stateOf, subDone, viewOf } from '../../lib/status'
import { setTaskState, toggleSubtask } from '../../lib/teamState'
import { nickOf } from '../../lib/teams'
import Dialog from '../Dialog'
import { DiffChip, SlotChip, StatusBadge, Who } from './bits'
import type { TeamCtx } from './ctx'

interface Props {
  ctx: TeamCtx
  taskId: number
  from: DOMRect | null
  onClose: () => void
}

export default function TaskDialog({ ctx, taskId, from, onClose }: Props) {
  const { catalog, plan, progress, team, colors, uid } = ctx
  const [busy, setBusy] = useState(false)
  const task = catalog.taskById.get(taskId)
  if (!task) return null

  const epoch = catalog.epochs.find((e) => e.id === task.epoch)
  const group = catalog.groups.find((g) => g.id === task.group)
  const entry = plan?.tasks[task.id]
  const people = responsible(entry).filter((m) => team.members.includes(m))
  const state = stateOf(progress, task.id)
  const view = viewOf(task, progress)
  const ticked = subDone(progress, task.id)
  const blockers = blockersOf(task, progress)
  const mine = people.includes(uid)
  const canEdit = ctx.running && (ctx.isCaptain || mine)

  const act = (p: Promise<unknown>) => {
    setBusy(true)
    return ctx.run(p).finally(() => setBusy(false))
  }
  const set = (s: 'todo' | 'doing' | 'done') => act(setTaskState(team.id, uid, task.id, s, task.subtasks.length, progress.tasks[task.id]))

  /** Место задания в очереди исполнителя: «шаг 5 из 23». */
  const stepOf = (m: string) => {
    if (!plan) return null
    const path = pathOf(plan, catalog, m)
    const i = path.findIndex((t) => t.id === task.id)
    return i < 0 ? null : `шаг ${i + 1} из ${path.length}`
  }

  const related = (t: Task, note?: string) => {
    const who = responsible(plan?.tasks[t.id]).filter((m) => team.members.includes(m))
    return (
      <li key={t.id}>
        <button type="button" className="rel-task" onClick={() => ctx.openTask(t.id)}>
          <StatusBadge view={viewOf(t, progress)} short />
          <span className="rel-num">№{t.id}</span>
          <span className="rel-title">
            {t.title}
            {note && <span className="muted"> · {note}</span>}
          </span>
          <span className="rel-who">
            {t.slots.includes('all') && who.length > 3 ? <span className="muted small">все</span> : who.slice(0, 4).map((m) => <Who key={m} nick={nickOf(team, m)} color={colors[m]} size="sm" />)}
          </span>
        </button>
      </li>
    )
  }

  const footer = !ctx.running ? (
    <p className="muted small">Отмечать задания можно будет после того, как капитан завершит распределение ролей.</p>
  ) : !canEdit ? (
    <p className="muted small">Это задание отмечают его исполнители и капитан.</p>
  ) : (
    <>
      {state === 'todo' && blockers.length > 0 && (
        <p className="muted small grow">
          Сначала должны быть готовы: {blockers.map((b) => `№${b}`).join(', ')}. Взять можно и сейчас, если есть чем заняться.
        </p>
      )}
      {state === 'todo' && (
        <button className="btn" disabled={busy} onClick={() => set('doing')}>
          Взять в работу
        </button>
      )}
      {state === 'doing' && (
        <>
          <button className="btn ghost" disabled={busy} onClick={() => set('todo')}>
            Отложить
          </button>
          <button className="btn" disabled={busy} onClick={() => set('done')}>
            Готово
          </button>
        </>
      )}
      {state === 'done' && (
        <button className="btn ghost" disabled={busy} onClick={() => set('doing')}>
          Вернуть в работу
        </button>
      )}
    </>
  )

  return (
    <Dialog
      wide
      from={from}
      resetKey={task.id}
      onClose={onClose}
      className={`task-dialog v-${view}`}
      footer={footer}
      title={
        <>
          <div className="task-meta">
            <span className="tcard-num">№{task.id}</span>
            {epoch && (
              <span className="badge">
                Эпоха {epoch.id} · {epoch.window}
              </span>
            )}
            {group && <span className="badge">{group.title}</span>}
            <DiffChip d={task.difficulty} full />
            {task.knowledge && <span className="badge gold">🧠 нужны знания</span>}
            {ctx.running && <StatusBadge view={view} />}
          </div>
          <h2>{task.title}</h2>
        </>
      }
    >
      <p className="task-text">{task.text}</p>
      {task.why && (
        <p className="task-why">
          <b>Зачем:</b> {task.why}
        </p>
      )}
      {task.note && <p className="task-note">⚠ {task.note}</p>}

      <div className="task-grid">
        <div>
          <h4>Чья работа</h4>
          <div className="row tight">
            {task.slots.map((s) => (
              <SlotChip key={s} slot={s} />
            ))}
          </div>
          {task.slotNote && <p className="muted small">{task.slotNote}</p>}
        </div>
        <div>
          <h4>{ctx.preview ? 'Кто будет делать (предварительно)' : 'Кто делает'}</h4>
          {people.length === 0 ? (
            <p className="muted small">{plan ? 'Никому не досталось: исполнитель вышел из команды. Капитану нужно перераспределить.' : 'Станет известно после раздачи ролей.'}</p>
          ) : (
            <ul className="task-people">
              {people.map((m) => (
                <li key={m}>
                  <Who nick={nickOf(team, m)} color={colors[m]} />
                  <span>
                    {nickOf(team, m)}
                    {m === uid && <span className="muted"> (ты)</span>}
                  </span>
                  <span className="muted small">{entry?.q === m && !entry.a.includes(m) ? 'квестовик, параллельно' : stepOf(m)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {task.subtasks.length > 0 && (
        <>
          <h4>
            Подпункты{' '}
            <span className="muted">
              {ticked.length} из {task.subtasks.length}
            </span>
          </h4>
          <ul className="subtasks">
            {task.subtasks.map((text, i) => (
              <li key={i}>
                <label className={ticked.includes(i) ? 'ticked' : ''}>
                  <input
                    type="checkbox"
                    checked={ticked.includes(i)}
                    disabled={!canEdit}
                    onChange={() => ctx.run(toggleSubtask(team.id, uid, task.id, i, progress.tasks[task.id]))}
                  />
                  <span>{text}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}

      {task.deps.length > 0 && (
        <>
          <h4>Нужно до него</h4>
          <ul className="rel-list">{task.deps.map((d) => related(catalog.taskById.get(d)!, task.depNotes?.[d]))}</ul>
        </>
      )}
      {task.opens.length > 0 && (
        <>
          <h4>Открывает</h4>
          <ul className="rel-list">{task.opens.map((d) => related(catalog.taskById.get(d)!, catalog.taskById.get(d)!.depNotes?.[task.id]))}</ul>
        </>
      )}

      <h4>Мини-гайд</h4>
      <p className="guide-stub">Короткое видео или картинка появятся здесь позже.</p>
    </Dialog>
  )
}
