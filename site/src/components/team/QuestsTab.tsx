// Вкладка «Квесты»: на каком этапе команда по каждому квесту вкладки «Испытания».
import { useMemo, useState } from 'react'
import type { Quest } from '../../data/types'
import { QUEST_DONE, QUEST_STAGES, questStage } from '../../lib/status'
import { setQuestStage } from '../../lib/teamState'
import { nickOf } from '../../lib/teams'
import { Who } from './bits'
import type { TeamCtx } from './ctx'

type Filter = 'all' | 'key' | 'open'
const FILTERS: { id: Filter; title: string }[] = [
  { id: 'all', title: 'Все' },
  { id: 'key', title: 'Ключевые вехи' },
  { id: 'open', title: 'Не сданные' },
]
const DIFF_CLASS: Record<Quest['difficulty'], string> = { лёгкая: 'd-L', средняя: 'd-M', сложная: 'd-H' }

export default function QuestsTab({ ctx }: { ctx: TeamCtx }) {
  const { catalog, plan, progress, team, colors, uid } = ctx
  const [filter, setFilter] = useState<Filter>('all')
  const [busy, setBusy] = useState<number | null>(null)
  const byName = useMemo(() => new Map(catalog.quests.map((q) => [q.name, q])), [catalog])

  // Этапы ведёт квестовик. Если его не выбрали, тот, кому квесты достались по плану. И капитан.
  const runner = team.questRunner ?? (ctx.running ? plan?.questFallback ?? null : null)
  const canEdit = ctx.running && (ctx.isCaptain || runner === uid)
  const done = catalog.quests.filter((q) => questStage(progress, q.id) === QUEST_DONE).length
  const list = catalog.quests.filter((q) => (filter === 'key' ? q.milestone : filter === 'open' ? questStage(progress, q.id) !== QUEST_DONE : true))

  const set = (q: Quest, st: number) => {
    setBusy(q.id)
    ctx.run(setQuestStage(team.id, uid, q.id, st)).finally(() => setBusy(null))
  }

  return (
    <section className="quests">
      <div className="card quests-head">
        <div className="tree-progress">
          <div className="bar">
            <i style={{ width: `${Math.round((done / catalog.quests.length) * 100)}%` }} />
          </div>
          <span>
            Сдано <b>{done}</b> из {catalog.quests.length}
          </span>
          <span className="muted">вкладка «{catalog.questTab}»</span>
        </div>
        <p className="muted small">
          {runner ? (
            <>
              <Who nick={nickOf(team, runner)} color={colors[runner]} size="sm" /> Квесты ведёт {nickOf(team, runner)}
              {runner === uid && ' (ты)'}
              {!team.questRunner && ': квестовика не выбрали, квесты достались ему по плану'}. Квест засчитывается, когда предмет крафтит квестовик,
              сам предмет при этом не забирают.
            </>
          ) : (
            'Квестовика пока нет. Его выбирают при раздаче ролей, это может быть только один человек.'
          )}
        </p>
        {!canEdit && ctx.running && <p className="muted small">Этапы отмечают квестовик и капитан.</p>}
        {!ctx.running && <p className="muted small">Отмечать этапы можно будет после распределения ролей.</p>}
      </div>

      <div className="tabs quests-filter">
        {FILTERS.map((f) => (
          <button key={f.id} className={filter === f.id ? 'active' : ''} onClick={() => setFilter(f.id)}>
            {f.title}
          </button>
        ))}
      </div>

      <ul className="quest-list">
        {list.map((q) => {
          const stage = questStage(progress, q.id)
          const inner = q.requires.map((name) => byName.get(name)).filter((x): x is Quest => Boolean(x))
          const waiting = inner.filter((r) => questStage(progress, r.id) !== QUEST_DONE)
          const task = q.taskId ? catalog.taskById.get(q.taskId) : undefined
          return (
            <li key={q.id} id={`quest-${q.id}`} className={`card quest st-${stage}${q.milestone ? ' key' : ''}`}>
              <div className="quest-top">
                <h3>
                  {q.milestone && (
                    <span className="star" title="Ключевая веха">
                      ★
                    </span>
                  )}
                  {q.name}
                </h3>
                <span className={`diff ${DIFF_CLASS[q.difficulty]}`}>{q.difficulty}</span>
              </div>
              {q.milestone && <p className="quest-key">{q.milestone}</p>}
              {q.goal && <p>{q.goal}</p>}
              {q.note && <p className="muted small">{q.note}</p>}

              <div className="quest-req">
                <span className="muted small">Нужно:</span>
                {q.requires.map((name) => {
                  const r = byName.get(name)
                  if (!r)
                    return (
                      <span key={name} className="req ext" title="Условие не из этой вкладки">
                        {name}
                      </span>
                    )
                  const st = questStage(progress, r.id)
                  return (
                    <a key={name} className={`req st-${st}`} href={`#quest-${r.id}`} title={QUEST_STAGES[st]} onClick={() => setFilter('all')}>
                      {st === QUEST_DONE ? '✓ ' : ''}
                      {name}
                    </a>
                  )
                })}
              </div>
              {stage !== QUEST_DONE && inner.length > 0 && (
                <p className="muted small">{waiting.length ? `Из этой вкладки ещё не сданы: ${waiting.map((w) => w.name).join(', ')}.` : 'Все условия из этой вкладки сданы.'}</p>
              )}
              {task && (
                <p className="small">
                  В дереве заданий:{' '}
                  <button className="link" onClick={(e) => ctx.openTask(task.id, e.currentTarget.closest('.quest'))}>
                    №{task.id} «{task.title}»
                  </button>
                </p>
              )}

              <div className="stages" role="group" aria-label={`Этап квеста ${q.name}`}>
                {QUEST_STAGES.map((title, st) => (
                  <button
                    key={st}
                    type="button"
                    className={`${stage === st ? 'active' : ''}${st < stage ? ' passed' : ''}`}
                    disabled={!canEdit || busy === q.id}
                    aria-pressed={stage === st}
                    onClick={() => stage !== st && set(q, st)}
                  >
                    {title}
                  </button>
                ))}
              </div>
            </li>
          )
        })}
      </ul>
      {list.length === 0 && <p className="muted center">Здесь пусто: все квесты сданы.</p>}
    </section>
  )
}
