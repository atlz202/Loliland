// Вкладка «Общий прогресс»: дерево всех заданий сборки.
// Время идёт снизу вверх (эпохи), слева направо идут направления. Рамка карточки — цвет того, кто делает.
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { roleOf, SLOT_LABEL } from '../../data/roles'
import type { Slot, Task } from '../../data/types'
import { frameCss } from '../../lib/colors'
import { pathOf, responsible } from '../../lib/plan'
import { stateOf, summarize, VIEW_LABEL, viewOf } from '../../lib/status'
import { nickOf } from '../../lib/teams'
import { DiffChip, Who } from './bits'
import type { TeamCtx } from './ctx'

interface Box {
  x: number
  y: number
  w: number
  h: number
}

const sameBoxes = (a: Record<number, Box>, b: Record<number, Box>) => {
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  return ka.every((k) => {
    const p = a[+k]
    const q = b[+k]
    return q && p.x === q.x && p.y === q.y && p.w === q.w && p.h === q.h
  })
}

/** Линия связи: от задания-условия к заданию, которое оно открывает. */
function depPath(a: Box, b: Box): string {
  const ax = a.x + a.w / 2
  const bx = b.x + b.w / 2
  if (a.y - (b.y + b.h) >= 2) {
    // Обычный случай: следующее задание выше. Идём от верха нижней карточки к низу верхней.
    const y1 = a.y
    const y2 = b.y + b.h
    const k = Math.max(12, (y1 - y2) / 2)
    return `M${ax},${y1} C${ax},${y1 - k} ${bx},${y2 + k} ${bx},${y2}`
  }
  // Задания на одной высоте: идём сбоку.
  const right = bx >= ax
  const x1 = right ? a.x + a.w : a.x
  const x2 = right ? b.x : b.x + b.w
  const y1 = a.y + a.h / 2
  const y2 = b.y + b.h / 2
  const k = Math.max(12, Math.abs(x2 - x1) / 2) * (right ? 1 : -1)
  return `M${x1},${y1} C${x1 + k},${y1} ${x2 - k},${y2} ${x2},${y2}`
}

/** Отрезок пути игрока между двумя карточками: от края одной до края другой. */
function pathSegment(a: Box, b: Box): [number, number, number, number] | null {
  const ax = a.x + a.w / 2
  const ay = a.y + a.h / 2
  const dx = b.x + b.w / 2 - ax
  const dy = b.y + b.h / 2 - ay
  const len = Math.hypot(dx, dy)
  if (!len) return null
  const edge = (box: Box) => Math.min(dx ? box.w / 2 / Math.abs(dx) : Infinity, dy ? box.h / 2 / Math.abs(dy) : Infinity)
  const gap = 3 / len
  const ta = edge(a) + gap
  const tb = edge(b) + gap
  if (ta + tb >= 1) return null
  return [ax + dx * ta, ay + dy * ta, ax + dx * (1 - tb), ay + dy * (1 - tb)]
}

const slotShort = (s: Slot) => (s === 'all' || s === 'any' ? SLOT_LABEL[s] : roleOf(s).short)
const slotColor = (s: Slot) => (s === 'all' || s === 'any' ? 'var(--muted)' : roleOf(s).color)

export default function TreeBoard({ ctx }: { ctx: TeamCtx }) {
  const { catalog, plan, progress, team, colors, uid } = ctx
  const boardRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const cards = useRef(new Map<number, HTMLElement>())
  const epochRows = useRef(new Map<number, HTMLElement>())
  const scrolled = useRef(false)
  const [boxes, setBoxes] = useState<Record<number, Box>>({})
  const [choice, setChoice] = useState<string>('auto')
  const [hover, setHover] = useState<number | null>(null)
  // На обычном экране дерево целиком не помещается по ширине, поэтому там сразу включён компактный вид.
  const [dense, setDense] = useState(() => window.innerWidth < 2100)
  const [links, setLinks] = useState(true)
  const [maxHeight, setMaxHeight] = useState<number | null>(null)

  // Чей путь показан. Пока человек не выбрал сам, показываем его собственный, если у него есть задания.
  const focus = useMemo(() => {
    if (!plan || choice === 'all') return null
    const who = choice === 'auto' ? uid : choice
    return team.members.includes(who) && catalog.tasks.some((t) => responsible(plan.tasks[t.id]).includes(who)) ? who : null
  }, [plan, choice, uid, team.members, catalog])

  const sum = useMemo(() => summarize(catalog, progress), [catalog, progress])
  const rows = useMemo(() => [...catalog.epochs].reverse(), [catalog])
  const cells = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of catalog.tasks) {
      const key = `${t.epoch}|${t.group}`
      map.set(key, [...(map.get(key) ?? []), t])
    }
    return map
  }, [catalog])

  /** Номер шага в очереди выбранного игрока. */
  const steps = useMemo(() => {
    const map = new Map<number, number>()
    if (plan && focus) pathOf(plan, catalog, focus).forEach((t, i) => map.set(t.id, i + 1))
    return map
  }, [plan, focus, catalog])

  const counts = useMemo(() => {
    const out: Record<string, number> = {}
    if (plan) for (const m of team.members) out[m] = catalog.tasks.filter((t) => responsible(plan.tasks[t.id]).includes(m)).length
    return out
  }, [plan, team.members, catalog])

  const measure = useCallback(() => {
    const next: Record<number, Box> = {}
    for (const [id, el] of cards.current) next[id] = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }
    setBoxes((prev) => (sameBoxes(prev, next) ? prev : next))
    // Дерево занимает всё место до низа окна, чтобы страница не прокручивалась вместе с ним.
    const view = scrollRef.current
    if (view) {
      const top = view.getBoundingClientRect().top + window.scrollY
      const fit = Math.max(420, Math.round(window.innerHeight - top - 76))
      setMaxHeight((prev) => (prev === fit ? prev : fit))
    }
  }, [])

  // Положение карточек нужно для линий. Меряем после каждой отрисовки: состояние меняется, только если что-то сдвинулось.
  useLayoutEffect(measure)
  useEffect(() => {
    const board = boardRef.current
    if (!board) return
    const observer = new ResizeObserver(measure)
    observer.observe(board)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure])

  // При первом показе прокручиваем к текущей эпохе: начало сборки внизу.
  useEffect(() => {
    if (scrolled.current || maxHeight === null || !Object.keys(boxes).length) return
    const view = scrollRef.current
    const row = epochRows.current.get(sum.epoch ?? 1)
    if (!view || !row) return
    scrolled.current = true
    view.scrollTop = row.offsetTop + row.offsetHeight - view.clientHeight + 14
  }, [boxes, sum.epoch, maxHeight])

  const width = Math.max(0, ...Object.values(boxes).map((b) => b.x + b.w))
  const height = Math.max(0, ...Object.values(boxes).map((b) => b.y + b.h))

  const deps = useMemo(() => {
    const out: { key: string; d: string; from: number; to: number }[] = []
    for (const t of catalog.tasks)
      for (const dep of t.deps) {
        const a = boxes[dep]
        const b = boxes[t.id]
        if (a && b) out.push({ key: `${dep}-${t.id}`, d: depPath(a, b), from: dep, to: t.id })
      }
    return out
  }, [catalog, boxes])

  const route = useMemo(() => {
    if (!plan || !focus) return []
    const path = pathOf(plan, catalog, focus)
    const out: { key: string; seg: [number, number, number, number] }[] = []
    for (let i = 1; i < path.length; i++) {
      const a = boxes[path[i - 1].id]
      const b = boxes[path[i].id]
      const seg = a && b ? pathSegment(a, b) : null
      if (seg) out.push({ key: `${path[i - 1].id}-${path[i].id}`, seg })
    }
    return out
  }, [plan, focus, catalog, boxes])

  const current = sum.epoch ? catalog.epochs.find((e) => e.id === sum.epoch) : null
  const focusStops = focus ? colors[focus]?.stops ?? [] : []

  return (
    <section className="tree">
      <div className="tree-bar">
        <div className="tree-progress">
          <div className="bar" role="progressbar" aria-valuenow={sum.percent} aria-valuemin={0} aria-valuemax={100}>
            <i style={{ width: `${sum.percent}%` }} />
          </div>
          <span>
            <b>{sum.done}</b> из {sum.total} · {sum.percent}%
          </span>
          {ctx.running && sum.doing > 0 && <span className="muted">в работе {sum.doing}</span>}
          {ctx.running &&
            (current ? (
              <span className="muted">
                сейчас: эпоха {current.id} «{current.title}»
              </span>
            ) : (
              <span className="badge green">сборка закрыта</span>
            ))}
        </div>
        <div className="tree-tools">
          <label className="check">
            <input type="checkbox" checked={links} onChange={(e) => setLinks(e.target.checked)} /> Связи
          </label>
          <label className="check">
            <input type="checkbox" checked={dense} onChange={(e) => setDense(e.target.checked)} /> Компактно
          </label>
        </div>
      </div>

      {plan && (
        <div className="tree-people" role="group" aria-label="Чей путь показать">
          <span className="muted small">Чей путь:</span>
          <button type="button" className={focus ? '' : 'active'} onClick={() => setChoice('all')}>
            Все
          </button>
          {team.members.map((m) => (
            <button
              type="button"
              key={m}
              className={focus === m ? 'active' : ''}
              style={{ '--c': colors[m]?.css } as CSSProperties}
              onClick={() => setChoice(focus === m ? 'all' : m)}
              disabled={!counts[m]}
            >
              <Who nick={nickOf(team, m)} color={colors[m]} size="sm" />
              {nickOf(team, m)}
              {m === uid && <span className="muted"> (ты)</span>}
              <span className="count">{counts[m] ?? 0}</span>
            </button>
          ))}
        </div>
      )}
      {ctx.preview && (
        <p className="tree-note">
          Предварительно: так задания раздадутся при нынешних ролях. Расклад меняется, пока капитан не нажмёт «Распределение
          завершено».
        </p>
      )}
      {!plan && team.phase === 'gathering' && (
        <p className="tree-note">Это весь путь сборки. Кто что делает, станет видно, когда капитан запустит раздачу ролей.</p>
      )}

      <div className="board-scroll" ref={scrollRef} style={{ maxHeight: maxHeight ?? undefined }}>
        <div
          className={`board${dense ? ' dense' : ''}${hover !== null ? ' hovering' : ''}`}
          ref={boardRef}
          style={{
            gridTemplateColumns: `var(--label-w) repeat(${catalog.groups.length}, minmax(var(--col-min), 1fr))`,
            minWidth: `calc(var(--label-w) + ${catalog.groups.length} * var(--col-min))`,
          }}
        >
          <svg className="board-svg" width={width} height={height} aria-hidden>
            <defs>
              <marker id="dep-end" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M1,1 L9,5 L1,9" fill="none" stroke="context-stroke" strokeWidth="1.6" />
              </marker>
              <marker id="path-end" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill="#f4f7fa" />
              </marker>
              {focusStops.length > 0 && (
                <linearGradient id="path-grad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="220" y2="220" spreadMethod="repeat">
                  {[...focusStops, focusStops[0]].map((c, i, all) => (
                    <stop key={i} offset={all.length > 1 ? i / (all.length - 1) : 0} stopColor={c} />
                  ))}
                </linearGradient>
              )}
            </defs>
            {links &&
              deps.map((e) => (
                <path
                  key={e.key}
                  d={e.d}
                  className={`dep${hover === e.to ? ' in' : hover === e.from ? ' out' : ''}`}
                  markerEnd="url(#dep-end)"
                />
              ))}
            {route.map(({ key, seg }) => (
              <g key={key} className="route">
                <line x1={seg[0]} y1={seg[1]} x2={seg[2]} y2={seg[3]} className="route-base" />
                <line x1={seg[0]} y1={seg[1]} x2={seg[2]} y2={seg[3]} className="route-flow" markerEnd="url(#path-end)" />
              </g>
            ))}
          </svg>

          <div className="board-corner">
            <span>время ↑</span>
            <span>направления →</span>
          </div>
          {catalog.groups.map((g) => (
            <div key={g.id} className="board-colhead">
              {g.title}
            </div>
          ))}

          {rows.map((epoch, i) => {
            const inEpoch = catalog.tasks.filter((t) => t.epoch === epoch.id)
            const done = inEpoch.filter((t) => stateOf(progress, t.id) === 'done').length
            const day = catalog.days.find((d) => d.id === epoch.day)
            return (
              <Fragment key={epoch.id}>
                {(i === 0 || rows[i - 1].day !== epoch.day) && day && (
                  <div className="board-day">
                    <span>{day.title}</span>
                  </div>
                )}
                <div
                  className={`board-epoch${sum.epoch === epoch.id && ctx.running ? ' now' : ''}`}
                  ref={(el) => {
                    if (el) epochRows.current.set(epoch.id, el)
                    else epochRows.current.delete(epoch.id)
                  }}
                >
                  <div className="board-epoch-in">
                    <b>Эпоха {epoch.id}</b>
                    <span>{epoch.title}</span>
                    <span className="muted">{epoch.window}</span>
                    <span className={`epoch-count${done === inEpoch.length ? ' full' : ''}`}>
                      готово {done} из {inEpoch.length}
                    </span>
                  </div>
                </div>
                {catalog.groups.map((g) => (
                  <div key={g.id} className="board-cell">
                    {(cells.get(`${epoch.id}|${g.id}`) ?? []).map((task) => {
                      const people = responsible(plan?.tasks[task.id]).filter((m) => team.members.includes(m))
                      const view = viewOf(task, progress)
                      const mine = focus ? people.includes(focus) : false
                      const frame = frameCss(people.map((m) => colors[m]).filter(Boolean))
                      const step = steps.get(task.id)
                      const everyone = task.slots.includes('all')
                      const cls = ['tcard', `v-${ctx.running ? view : 'plain'}`, frame ? 'framed' : '', mine ? 'lit' : '', focus && !mine ? 'dim' : '', step ? 'stepped' : '']
                      if (hover !== null && (hover === task.id || task.deps.includes(hover) || task.opens.includes(hover))) cls.push('near')
                      return (
                        <button
                          type="button"
                          key={task.id}
                          data-task={task.id}
                          className={cls.filter(Boolean).join(' ')}
                          style={{ '--frame': frame ?? undefined, '--glow': focus ? colors[focus]?.solid : undefined } as CSSProperties}
                          ref={(el) => {
                            if (el) cards.current.set(task.id, el)
                            else cards.current.delete(task.id)
                          }}
                          onClick={(e) => ctx.openTask(task.id, e.currentTarget)}
                          onMouseEnter={() => setHover(task.id)}
                          onMouseLeave={() => setHover((h) => (h === task.id ? null : h))}
                          title={ctx.running ? `№${task.id}. ${task.title}. ${VIEW_LABEL[view]}` : `№${task.id}. ${task.title}`}
                        >
                          <span className="tcard-top">
                            <span className="tcard-num">№{task.id}</span>
                            <DiffChip d={task.difficulty} />
                            {task.knowledge && (
                              <span className="brain" title="Нужны знания">
                                🧠
                              </span>
                            )}
                            {ctx.running && view !== 'blocked' && (
                              <span className={`tcard-state s-${view}`}>
                                {view === 'done' ? (
                                  '✓'
                                ) : (
                                  <>
                                    <i aria-hidden />
                                    <span className="st-text">{view === 'doing' ? 'в работе' : 'можно'}</span>
                                  </>
                                )}
                              </span>
                            )}
                            {step !== undefined && (
                              <span className="tcard-step" style={{ background: focus ? colors[focus]?.css : undefined }}>
                                {step}
                              </span>
                            )}
                          </span>
                          <span className="tcard-title">{task.title}</span>
                          <span className="tcard-foot">
                            <span className="tcard-slots">
                              {task.slots.map((s) => (
                                <span key={s} className="slot" style={{ '--c': slotColor(s) } as CSSProperties}>
                                  {slotShort(s)}
                                </span>
                              ))}
                            </span>
                            {people.length > 0 && (
                              <span className="tcard-who">
                                {everyone && people.length > 3 ? (
                                  <span className="muted">все</span>
                                ) : (
                                  <>
                                    {people.slice(0, 3).map((m) => (
                                      <Who key={m} nick={nickOf(team, m)} color={colors[m]} size="sm" />
                                    ))}
                                    {people.length > 3 && <span className="muted">+{people.length - 3}</span>}
                                  </>
                                )}
                              </span>
                            )}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ))}
              </Fragment>
            )
          })}
        </div>
      </div>

      <div className="tree-legend muted small">
        <span>
          Сложность: <DiffChip d="L" /> лёгкая <DiffChip d="M" /> средняя <DiffChip d="H" /> сложная <DiffChip d="X" /> суперсложная
        </span>
        <span>🧠 нужны знания</span>
        <span>Рамка карточки: цвет того, кто делает</span>
        <span>Тонкие линии: что после чего. Наведи на карточку, чтобы увидеть её связи</span>
        {focus && <span>Пунктир со стрелками и цифры: путь игрока по порядку</span>}
        {ctx.running && (
          <span>
            <span className="tcard-state s-ready">
              <i /> можно начинать
            </span>{' '}
            <span className="tcard-state s-doing">
              <i /> в работе
            </span>{' '}
            <span className="tcard-state s-done">✓</span> готово
          </span>
        )}
      </div>
    </section>
  )
}
