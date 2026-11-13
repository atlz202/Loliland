// Вкладка «Мои задачи»: очередь игрока по порядку и что с каждым заданием сейчас.
import { useState } from 'react'
import type { Task } from '../../data/types'
import { orderedRoles } from '../../lib/colors'
import { loadOf, pathOf, questTasksOf, responsible } from '../../lib/plan'
import { blockersOf, stateOf, subDone, viewOf, type TaskState, type TaskView } from '../../lib/status'
import { setTaskState } from '../../lib/teamState'
import { nickOf } from '../../lib/teams'
import { DiffChip, RoleChip, StatusBadge, Who } from './bits'
import type { TeamCtx } from './ctx'

const SECTIONS: { view: TaskView; title: string; hint: string }[] = [
  { view: 'doing', title: 'В работе', hint: 'То, что ты уже взял.' },
  { view: 'ready', title: 'Можно начинать', hint: 'Всё нужное для них готово. Бери по порядку номеров шагов.' },
  { view: 'blocked', title: 'Ждут других заданий', hint: 'Сначала должно быть готово то, от чего они зависят.' },
  { view: 'done', title: 'Сделано', hint: '' },
]

export default function MyTasks({ ctx }: { ctx: TeamCtx }) {
  const { catalog, plan, progress, team, colors, uid } = ctx
  const [busy, setBusy] = useState<number | null>(null)
  const [showDone, setShowDone] = useState(false)

  if (!plan)
    return (
      <section className="card placeholder">
        <h2>Мои задачи</h2>
        <p>Задания появятся, когда раздадите роли.</p>
        <p className="muted small">
          {ctx.isCaptain ? 'Собери команду и нажми «Начать распределение ролей» справа.' : 'Капитан запустит раздачу ролей, когда команда соберётся.'}
        </p>
      </section>
    )

  const path = pathOf(plan, catalog, uid)
  const quests = questTasksOf(plan, catalog, uid).filter((t) => !plan.tasks[t.id].a.includes(uid))
  const load = loadOf(plan, catalog, team.members)[uid]
  const myRoles = orderedRoles(team.roles[uid], team.questRunner === uid)
  const doneCount = path.filter((t) => stateOf(progress, t.id) === 'done').length
  const next = path.find((t) => stateOf(progress, t.id) !== 'done')

  const set = (task: Task, s: TaskState) => {
    setBusy(task.id)
    ctx.run(setTaskState(team.id, uid, task.id, s, task.subtasks.length, progress.tasks[task.id])).finally(() => setBusy(null))
  }

  // В списках, разбитых по состоянию, само состояние в строке не повторяем.
  const row = (task: Task, step: number | null, showStatus = false) => {
    const view = viewOf(task, progress)
    const state = stateOf(progress, task.id)
    const epoch = catalog.epochs.find((e) => e.id === task.epoch)
    const ticked = subDone(progress, task.id).length
    const blockers = blockersOf(task, progress).map((id) => catalog.taskById.get(id)!)
    return (
      <li key={task.id} className={`mytask v-${view}${next?.id === task.id ? ' next' : ''}`}>
        <span className="mytask-step" style={{ background: step ? colors[uid]?.css : undefined }}>
          {step ?? '∥'}
        </span>
        <button type="button" className="mytask-main" onClick={(e) => ctx.openTask(task.id, e.currentTarget.closest('.mytask'))}>
          <span className="mytask-title">
            <span className="tcard-num">№{task.id}</span> {task.title}
            {next?.id === task.id && ctx.running && <span className="badge gold">следующий шаг</span>}
          </span>
          <span className="mytask-meta">
            <DiffChip d={task.difficulty} />
            {task.knowledge && <span title="Нужны знания">🧠</span>}
            {epoch && (
              <span className="muted">
                эпоха {epoch.id}, {epoch.window}
              </span>
            )}
            {task.subtasks.length > 0 && (
              <span className="muted">
                подпункты {ticked}/{task.subtasks.length}
              </span>
            )}
            {ctx.running && showStatus && <StatusBadge view={view} />}
          </span>
          {view === 'blocked' && ctx.running && (
            <span className="mytask-wait">
              Ждёт:{' '}
              {blockers.map((b, i) => {
                const who = responsible(plan.tasks[b.id]).filter((m) => team.members.includes(m))
                return (
                  <span key={b.id}>
                    {i > 0 && ', '}№{b.id} «{b.title}»
                    {who.length > 0 && ` (${b.slots.includes('all') && who.length > 3 ? 'все' : who.map((m) => nickOf(team, m)).join(', ')})`}
                  </span>
                )
              })}
            </span>
          )}
        </button>
        {ctx.running && (
          <span className="mytask-act">
            {state === 'todo' && (
              <button className="btn small ghost" disabled={busy === task.id} onClick={() => set(task, 'doing')}>
                Взять
              </button>
            )}
            {state === 'doing' && (
              <button className="btn small" disabled={busy === task.id} onClick={() => set(task, 'done')}>
                Готово
              </button>
            )}
          </span>
        )}
      </li>
    )
  }

  return (
    <section className="mytasks">
      <div className="card mytasks-head">
        <Who nick={ctx.nickname} color={colors[uid]} size="lg" />
        <div>
          <div className="row tight">
            {myRoles.length ? myRoles.map((r) => <RoleChip key={r} id={r} />) : <span className="muted">Ролей нет: тебе достаются только общие задания и то, что некому взять.</span>}
          </div>
          <p className="muted small">
            В очереди {load?.count ?? 0} заданий, примерно {load?.hours ?? 0} ч работы
            {load && load.questCount > 0 && `. Квестовых заданий ${load.questCount}, они идут параллельно`}
            {ctx.running && `. Сделано ${doneCount} из ${path.length}`}
            {ctx.preview && '. Расклад предварительный: он меняется, пока раздаются роли'}
          </p>
        </div>
      </div>

      {path.length === 0 && quests.length === 0 && <p className="muted">Заданий для тебя нет.</p>}

      {ctx.running ? (
        SECTIONS.map(({ view, title, hint }) => {
          const list = path.filter((t) => viewOf(t, progress) === view)
          if (!list.length) return null
          const collapsed = view === 'done' && !showDone
          return (
            <div key={view} className="mytasks-section">
              <h3>
                {title} <span className="muted">{list.length}</span>
                {view === 'done' && (
                  <button className="link small" onClick={() => setShowDone((v) => !v)}>
                    {showDone ? 'скрыть' : 'показать'}
                  </button>
                )}
              </h3>
              {hint && !collapsed && <p className="muted small">{hint}</p>}
              {!collapsed && <ul className="mytask-list">{list.map((t) => row(t, path.indexOf(t) + 1))}</ul>}
            </div>
          )
        })
      ) : (
        <div className="mytasks-section">
          <h3>
            Твой путь по порядку <span className="muted">{path.length}</span>
          </h3>
          <ul className="mytask-list">{path.map((t, i) => row(t, i + 1))}</ul>
        </div>
      )}

      {quests.length > 0 && (
        <div className="mytasks-section">
          <h3>
            Квестовые задания <span className="muted">{quests.length}</span>
          </h3>
          <p className="muted small">Идут параллельно с остальными и очередь не занимают. Этапы самих квестов отмечаются на вкладке «Квесты».</p>
          <ul className="mytask-list">{quests.map((t) => row(t, null, true))}</ul>
        </div>
      )}
    </section>
  )
}
