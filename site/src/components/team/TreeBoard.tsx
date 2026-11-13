// Вкладка «Общий прогресс»: дерево всех заданий сборки.
// Время идёт снизу вверх: эпохи, а внутри эпохи ряды. Слева направо идут направления.
// Задание всегда стоит выше тех, от которых зависит, поэтому и связи, и путь игрока смотрят только вверх.
// Рамка карточки — цвет того, кто делает.
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { roleOf, SLOT_LABEL } from '../../data/roles'
import type { Epoch, Slot, Task } from '../../data/types'
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
  // Запасной случай, если задание почему-то не выше своего условия (ошибка в списке заданий): идём сбоку.
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
  // Доля отрезка, которая остаётся между краями карточек.
  const free = 1 - edge(a) - edge(b)
  if (free <= 0) return null
  // Отступ от краёв: три пикселя, но не больше четверти просвета, чтобы стрелка осталась и между соседними карточками.
  const gap = Math.min(3 / len, free / 4)
  const ta = edge(a) + gap
  const tb = edge(b) + gap
  return [ax + dx * ta, ay + dy * ta, ax + dx * (1 - tb), ay + dy * (1 - tb)]
}

const ZOOM_MIN = 0.15
const ZOOM_MAX = 1.5
/** Ступени кнопок «−» и «+». */
const ZOOM_STEPS = [0.15, 0.2, 0.25, 0.3, 0.37, 0.45, 0.55, 0.7, 0.85, 1, 1.2, 1.5]
/** Мельче этого текст карточки не прочитать, поэтому карточка сжимается в строку: номер и начало названия. */
const FAR_BELOW = 0.66
/** Сколько шагов даётся на подбор масштаба «Целиком». Последние три шага масштаб только уменьшают. */
const FIT_STEPS = 8
/** Длина линейки в пикселях доски, см. toLocal. */
const RULER = 200
const ZOOM_KEY = 'treeZoom'

/** Старые браузеры не знают свойства zoom: там дерево остаётся обычного размера, а кнопки масштаба не показываются. */
const CAN_ZOOM = typeof CSS !== 'undefined' && CSS.supports('zoom', '0.5')

const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 10000) / 10000))

function savedZoom(): number {
  if (!CAN_ZOOM) return 1
  try {
    const z = Number(localStorage.getItem(ZOOM_KEY))
    return z >= ZOOM_MIN && z <= ZOOM_MAX ? z : 1
  } catch {
    return 1
  }
}

function stepZoom(z: number, dir: 1 | -1): number {
  const next = dir > 0 ? ZOOM_STEPS.find((s) => s > z + 0.004) : [...ZOOM_STEPS].reverse().find((s) => s < z - 0.004)
  return next ?? z
}

/** Точка дерева, которая при смене масштаба должна остаться на своём месте экрана. */
interface Anchor {
  /** Ближайшая карточка. */
  id: number
  /** Точка внутри карточки, в долях её ширины и высоты. */
  u: number
  v: number
  /** Отступ от карточки, если точка мимо неё, в пикселях доски. */
  dx: number
  dy: number
  /** Где эта точка в окне дерева. */
  px: number
  py: number
}

const slotShort = (s: Slot) => (s === 'all' || s === 'any' ? SLOT_LABEL[s] : roleOf(s).short)
const slotColor = (s: Slot) => (s === 'all' || s === 'any' ? 'var(--muted)' : roleOf(s).color)

export default function TreeBoard({ ctx }: { ctx: TeamCtx }) {
  const { catalog, plan, progress, team, colors, uid } = ctx
  const boardRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const rulerRef = useRef<HTMLElement>(null)
  const cards = useRef(new Map<number, HTMLElement>())
  const epochCells = useRef(new Map<number, HTMLElement>())
  const scrolled = useRef(false)
  const [boxes, setBoxes] = useState<Record<number, Box>>({})
  const [choice, setChoice] = useState<string>('auto')
  const [hover, setHover] = useState<number | null>(null)
  // На обычном экране дерево целиком не помещается по ширине, поэтому там сразу включён компактный вид.
  const [dense, setDense] = useState(() => window.innerWidth < 2100)
  const [links, setLinks] = useState(true)
  const [maxHeight, setMaxHeight] = useState<number | null>(null)
  const [zoom, setZoom] = useState(savedZoom)
  /** Сколько шагов подбора масштаба «Целиком» ещё осталось. */
  const [fitting, setFitting] = useState(0)
  /** Масштаб, который сейчас на экране, и масштаб, о котором уже попросили (он ещё может быть не отрисован). */
  const shownZoom = useRef(zoom)
  const askedZoom = useRef(zoom)
  const anchor = useRef<Anchor | null>(null)
  const far = zoom < FAR_BELOW

  // Чей путь показан. Пока человек не выбрал сам, показываем его собственный, если у него есть задания.
  const focus = useMemo(() => {
    if (!plan || choice === 'all') return null
    const who = choice === 'auto' ? uid : choice
    return team.members.includes(who) && catalog.tasks.some((t) => responsible(plan.tasks[t.id]).includes(who)) ? who : null
  }, [plan, choice, uid, team.members, catalog])

  const sum = useMemo(() => summarize(catalog, progress), [catalog, progress])

  // Сетка доски: сверху шапка, под ней эпохи от поздней к ранней. Эпоха занимает столько строк, сколько в ней рядов,
  // первый ряд внизу. У каждой карточки своя клетка: строка по ряду, столбец по направлению.
  const grid = useMemo(() => {
    const rowOf = new Map<number, number>()
    const top = new Set<number>()
    const colOf = new Map(catalog.groups.map((g, i) => [g.id, i + 2]))
    const bands: { epoch: Epoch; tasks: Task[]; start: number; span: number; day?: string; dayRow?: number }[] = []
    const epochs = [...catalog.epochs].reverse()
    let row = 2
    epochs.forEach((epoch, i) => {
      const day = i === 0 || epochs[i - 1].day !== epoch.day ? catalog.days.find((d) => d.id === epoch.day)?.title : undefined
      const dayRow = day ? row++ : undefined
      const tasks = catalog.tasks.filter((t) => t.epoch === epoch.id)
      const span = Math.max(1, ...tasks.map((t) => t.level))
      for (const t of tasks) {
        rowOf.set(t.id, row + span - t.level)
        if (t.level === span) top.add(t.id)
      }
      bands.push({ epoch, tasks, start: row, span, day, dayRow })
      row += span
    })
    return { rowOf, colOf, top, bands }
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

  /**
   * Перевод прямоугольников браузера в пиксели самой доски, какими они были бы без масштаба.
   * Браузеры по-разному считают размеры внутри zoom, поэтому меряем линейку известной длины:
   * она показывает, сколько единиц браузера приходится на пиксель доски.
   */
  const toLocal = useCallback(() => {
    const board = boardRef.current
    const ruler = rulerRef.current
    if (!board || !ruler) return null
    const origin = board.getBoundingClientRect()
    const unit = ruler.getBoundingClientRect().width / RULER || 1
    return (el: Element): Box => {
      const r = el.getBoundingClientRect()
      return { x: (r.left - origin.left) / unit, y: (r.top - origin.top) / unit, w: r.width / unit, h: r.height / unit }
    }
  }, [])

  const measure = useCallback(() => {
    const local = toLocal()
    if (!local) return
    const half = (v: number) => Math.round(v * 2) / 2
    const next: Record<number, Box> = {}
    for (const [id, el] of cards.current) {
      const b = local(el)
      next[id] = { x: half(b.x), y: half(b.y), w: half(b.w), h: half(b.h) }
    }
    setBoxes((prev) => (sameBoxes(prev, next) ? prev : next))
    // Дерево занимает всё место до низа окна, чтобы страница не прокручивалась вместе с ним.
    const view = scrollRef.current
    if (view) {
      const top = view.getBoundingClientRect().top + window.scrollY
      const fit = Math.max(420, Math.round(window.innerHeight - top - 76))
      setMaxHeight((prev) => (prev === fit ? prev : fit))
    }
  }, [toLocal])

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
    const cell = epochCells.current.get(sum.epoch ?? 1)
    const local = toLocal()
    if (!view || !cell || !local) return
    scrolled.current = true
    const b = local(cell)
    view.scrollTop = (b.y + b.h) * shownZoom.current - view.clientHeight + 14
  }, [boxes, sum.epoch, maxHeight, toLocal])

  /** Сменить масштаб. Точка под курсором (или середина окна дерева) остаётся на месте. */
  const zoomTo = useCallback(
    (next: number, at?: { x: number; y: number }) => {
      const z = clampZoom(next)
      setFitting(0)
      if (z === askedZoom.current) return
      const view = scrollRef.current
      const local = toLocal()
      // Запоминаем точку относительно ближайшей карточки: при смене масштаба ряды меняют высоту неравномерно.
      // Если прошлый масштаб ещё не отрисован, точка уже запомнена по тому, что сейчас на экране.
      if (view && local && askedZoom.current === shownZoom.current) {
        const px = at ? at.x : view.clientWidth / 2
        const py = at ? at.y : view.clientHeight / 2
        const x = (view.scrollLeft + px) / shownZoom.current
        const y = (view.scrollTop + py) / shownZoom.current
        let best: Anchor | null = null
        let bestDist = Infinity
        for (const [id, el] of cards.current) {
          const b = local(el)
          if (!b.w || !b.h) continue
          const cx = Math.min(Math.max(x, b.x), b.x + b.w)
          const cy = Math.min(Math.max(y, b.y), b.y + b.h)
          const dist = (x - cx) ** 2 + (y - cy) ** 2
          if (dist < bestDist) {
            bestDist = dist
            best = { id, u: (cx - b.x) / b.w, v: (cy - b.y) / b.h, dx: x - cx, dy: y - cy, px, py }
          }
        }
        anchor.current = best
      }
      askedZoom.current = z
      // Вернулись к масштабу, который и так на экране: перерисовки не будет, точка не понадобится.
      if (z === shownZoom.current) anchor.current = null
      setZoom(z)
    },
    [toLocal],
  )

  // После смены масштаба возвращаем запомненную точку на её место в окне.
  useLayoutEffect(() => {
    shownZoom.current = zoom
    const a = anchor.current
    anchor.current = null
    const view = scrollRef.current
    const el = a ? cards.current.get(a.id) : undefined
    const local = toLocal()
    if (!a || !view || !el || !local) return
    const b = local(el)
    view.scrollLeft = (b.x + a.u * b.w + a.dx) * zoom - a.px
    view.scrollTop = (b.y + a.v * b.h + a.dy) * zoom - a.py
  }, [zoom, toLocal])

  // «Целиком»: подбираем масштаб, при котором дерево помещается в окно без прокрутки.
  // Каждый шаг меряет, что получилось на прошлом. Сначала масштаб можно и увеличивать, под конец только уменьшать.
  useLayoutEffect(() => {
    if (!fitting) return
    const view = scrollRef.current
    if (!view || maxHeight === null) return
    const room = maxHeight - 2 * view.clientTop
    // Во сколько раз дерево можно увеличить (больше единицы) или нужно уменьшить (меньше). Ширина учитывается, только если она не помещается.
    const tooWide = view.scrollWidth > view.clientWidth + 1
    const k = Math.min(room / view.scrollHeight, tooWide ? view.clientWidth / view.scrollWidth : Infinity)
    let next = zoom
    let left = 0
    if (k >= 1) {
      const grown = clampZoom(Math.min(1, zoom * k))
      if (fitting > 3 && grown - zoom >= 0.004) {
        next = grown
        left = fitting - 1
      }
    } else {
      next = clampZoom(zoom * k * 0.995)
      left = next === zoom ? 0 : Math.max(1, fitting - 1)
    }
    askedZoom.current = next
    setFitting(left)
    setZoom(next)
  }, [fitting, zoom, maxHeight])

  useEffect(() => {
    try {
      localStorage.setItem(ZOOM_KEY, String(zoom))
    } catch {
      // Без памяти браузера масштаб просто не запомнится.
    }
  }, [zoom])

  // Ctrl и колесо мыши (или щипок на тачпаде) меняют масштаб дерева, а не всей страницы.
  useEffect(() => {
    const view = scrollRef.current
    if (!view) return
    const onWheel = (e: WheelEvent) => {
      if (!CAN_ZOOM || (!e.ctrlKey && !e.metaKey)) return
      e.preventDefault()
      const rect = view.getBoundingClientRect()
      const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 600 : e.deltaY
      if (!delta) return
      // Щелчок колеса мыши переходит на соседнюю ступень, как кнопки. Щипок на тачпаде шлёт мелкие сдвиги и меняет масштаб плавно.
      const next = Math.abs(delta) >= 50 ? stepZoom(askedZoom.current, delta < 0 ? 1 : -1) : askedZoom.current * Math.exp(-delta * 0.006)
      zoomTo(next, { x: e.clientX - rect.left - view.clientLeft, y: e.clientY - rect.top - view.clientTop })
    }
    view.addEventListener('wheel', onWheel, { passive: false })
    return () => view.removeEventListener('wheel', onWheel)
  }, [zoomTo])

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
          {CAN_ZOOM && (
            <div className="zoom" role="group" aria-label="Масштаб дерева">
              <button
                type="button"
                onClick={() => zoomTo(stepZoom(zoom, -1))}
                disabled={zoom <= ZOOM_MIN}
                title="Отдалить. Ещё можно крутить колесо мыши с зажатым Ctrl"
                aria-label="Отдалить"
              >
                −
              </button>
              <button type="button" className="zoom-value" onClick={() => zoomTo(1)} title="Вернуть обычный размер" aria-label={`Масштаб ${Math.round(zoom * 100)}%, вернуть обычный размер`}>
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() => zoomTo(stepZoom(zoom, 1))}
                disabled={zoom >= ZOOM_MAX}
                title="Приблизить. Ещё можно крутить колесо мыши с зажатым Ctrl"
                aria-label="Приблизить"
              >
                +
              </button>
              <button
                type="button"
                className="zoom-fit"
                onClick={() => {
                  anchor.current = null
                  setFitting(FIT_STEPS)
                }}
                title="Подобрать масштаб, чтобы всё дерево поместилось в окно"
              >
                Целиком
              </button>
            </div>
          )}
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
          className={`board${dense ? ' dense' : ''}${far ? ' far' : ''}${hover !== null ? ' hovering' : ''}`}
          ref={boardRef}
          style={
            {
              zoom,
              // Шапка и подписи эпох получают обратный масштаб и остаются обычного размера.
              '--iz': 1 / zoom,
              // В мелком масштабе линии толще, иначе их не видно.
              '--lw': Math.max(1, 0.6 / zoom),
              gridTemplateColumns: `calc(var(--label-w) * var(--iz)) repeat(${catalog.groups.length}, minmax(var(--col-min), 1fr))`,
              minWidth: `calc(var(--label-w) * var(--iz) + ${catalog.groups.length} * var(--col-min))`,
            } as CSSProperties
          }
        >
          <i className="board-ruler" ref={rulerRef} style={{ width: RULER }} aria-hidden />
          <svg className="board-svg" aria-hidden>
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
                  data-link={e.key}
                  d={e.d}
                  className={`dep${hover === e.to ? ' in' : hover === e.from ? ' out' : ''}`}
                  markerEnd="url(#dep-end)"
                />
              ))}
            {route.map(({ key, seg }) => (
              <g key={key} data-link={key} className="route">
                <line x1={seg[0]} y1={seg[1]} x2={seg[2]} y2={seg[3]} className="route-base" />
                <line x1={seg[0]} y1={seg[1]} x2={seg[2]} y2={seg[3]} className="route-flow" markerEnd="url(#path-end)" />
              </g>
            ))}
          </svg>

          <div className="board-corner" style={{ gridRow: 1, gridColumn: 1 }}>
            <span>время ↑</span>
            <span>направления →</span>
          </div>
          {catalog.groups.map((g, i) => (
            <div key={g.id} className="board-colhead" style={{ gridRow: 1, gridColumn: i + 2 }} title={g.title}>
              <span className="colhead-full">{g.title}</span>
              <span className="colhead-icon" aria-hidden>
                {g.icon}
              </span>
            </div>
          ))}

          {grid.bands.map(({ epoch, tasks, start, span, day, dayRow }) => {
            const done = tasks.filter((t) => stateOf(progress, t.id) === 'done').length
            const area = `${start} / span ${span}`
            return (
              <Fragment key={epoch.id}>
                {day && (
                  <div className="board-day" style={{ gridRow: dayRow }}>
                    <span>{day}</span>
                  </div>
                )}
                <div
                  className={`board-epoch${sum.epoch === epoch.id && ctx.running ? ' now' : ''}`}
                  style={{ gridRow: area, gridColumn: 1 }}
                  title={`Эпоха ${epoch.id} «${epoch.title}», ${epoch.window}. Готово ${done} из ${tasks.length}`}
                >
                  <div className="board-epoch-in">
                    <b>Эпоха {epoch.id}</b>
                    {!far && <span>{epoch.title}</span>}
                    {!far && <span className="muted">{epoch.window}</span>}
                    <span className={`epoch-count${done === tasks.length ? ' full' : ''}`}>
                      {far ? `${done}/${tasks.length}` : `готово ${done} из ${tasks.length}`}
                    </span>
                  </div>
                </div>
                {catalog.groups.map((g, i) => (
                  <div
                    key={g.id}
                    className="board-cell"
                    style={{ gridRow: area, gridColumn: i + 2 }}
                    ref={
                      i === 0
                        ? (el) => {
                            if (el) epochCells.current.set(epoch.id, el)
                            else epochCells.current.delete(epoch.id)
                          }
                        : undefined
                    }
                  />
                ))}
              </Fragment>
            )
          })}

          {catalog.tasks.map((task) => {
            const people = responsible(plan?.tasks[task.id]).filter((m) => team.members.includes(m))
            const view = viewOf(task, progress)
            const mine = focus ? people.includes(focus) : false
            const frame = frameCss(people.map((m) => colors[m]).filter(Boolean))
            const step = steps.get(task.id)
            const everyone = task.slots.includes('all')
            const cls = ['tcard', `v-${ctx.running ? view : 'plain'}`, frame ? 'framed' : '', mine ? 'lit' : '', focus && !mine ? 'dim' : '', step ? 'stepped' : '']
            if (hover !== null && (hover === task.id || task.deps.includes(hover) || task.opens.includes(hover))) cls.push('near')
            return (
              <div
                key={task.id}
                className={`board-slot${task.level === 1 ? ' low' : ''}${grid.top.has(task.id) ? ' high' : ''}`}
                style={{ gridRow: grid.rowOf.get(task.id), gridColumn: grid.colOf.get(task.group) }}
              >
                <button
                  type="button"
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
                    <span className="tcard-num">
                      <span className="no">№</span>
                      {task.id}
                    </span>
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
              </div>
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
        <span>Тонкие линии: что после чего, всегда снизу вверх. Наведи на карточку, чтобы увидеть её связи</span>
        {focus && <span>Пунктир со стрелками и цифры: путь игрока по порядку</span>}
        {CAN_ZOOM && <span>Масштаб: кнопки «−» и «+» или колесо мыши с зажатым Ctrl</span>}
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
