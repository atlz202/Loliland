import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import ManageDialog from '../components/team/ManageDialog'
import MyTasks from '../components/team/MyTasks'
import QuestsTab from '../components/team/QuestsTab'
import TaskDialog from '../components/team/TaskDialog'
import TeamPanel from '../components/team/TeamPanel'
import TreeBoard from '../components/team/TreeBoard'
import type { TeamCtx } from '../components/team/ctx'
import { catalogOf } from '../data/catalogs'
import { memberColors } from '../lib/colors'
import { planDrift } from '../lib/drift'
import { errorText } from '../lib/errors'
import { buildPlan, pathOf } from '../lib/plan'
import { serverName } from '../lib/servers'
import { EMPTY_PROGRESS, QUEST_DONE, questStage, stateOf, type Progress } from '../lib/status'
import { watchPlan, watchProgress, type StoredPlan } from '../lib/teamState'
import { fetchTeam, leaveTeam, nickOf, renameTeam, watchTeam, type Team } from '../lib/teams'

const TABS = [
  { id: 'progress', title: 'Общий прогресс' },
  { id: 'quests', title: 'Квесты' },
  { id: 'mine', title: 'Мои задачи' },
] as const
type TabId = (typeof TABS)[number]['id']

export default function TeamPage() {
  const { id = '' } = useParams()
  const { user, profile } = useAuth()
  const [team, setTeam] = useState<Team | null | undefined>(undefined)
  const [error, setError] = useState('')
  const [lost, setLost] = useState(0)

  useEffect(() => {
    setTeam(undefined)
    setError('')
    return watchTeam(id, setTeam, (e) => setError(errorText(e)))
  }, [id])

  // План и отметки перестали читаться: скорее всего, команду распустили или меня из неё убрали.
  // Слушатель самой команды в такой момент может промолчать, поэтому спрашиваем сервер напрямую.
  useEffect(() => {
    if (lost === 0) return
    let stale = false
    fetchTeam(id)
      .then((fresh) => !stale && setTeam(fresh))
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [id, lost])
  const onLostAccess = useCallback(() => setLost((n) => n + 1), [])

  if (error) return <section className="card narrow error">{error}</section>
  if (team === undefined) return <div className="center muted">Загрузка…</div>
  if (team === null || !user || !profile)
    return (
      <section className="card narrow">
        <h1>Команда не найдена</h1>
        <Link to="/cabinet">В личный кабинет</Link>
      </section>
    )
  if (!team.members.includes(user.uid))
    return (
      <section className="card narrow">
        <h1>{team.name}</h1>
        <p className="muted">Ты не в этой команде. Войти можно по ID через «Найти команду» в личном кабинете, по ссылке или по приглашению капитана.</p>
        <Link to="/cabinet">В личный кабинет</Link>
      </section>
    )
  return <TeamView team={team} uid={user.uid} nickname={profile.nickname} onLostAccess={onLostAccess} />
}

function TeamView({ team, uid, nickname, onLostAccess }: { team: Team; uid: string; nickname: string; onLostAccess: () => void }) {
  const navigate = useNavigate()
  const catalog = catalogOf(team.server)
  const [stored, setStored] = useState<StoredPlan | null>(null)
  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS)
  const [tab, setTab] = useState<TabId>('progress')
  const [task, setTask] = useState<{ id: number; from: DOMRect | null; key: number } | null>(null)
  const [manage, setManage] = useState(false)
  const [error, setError] = useState('')
  const [editingName, setEditingName] = useState<string | null>(null)
  const [sideHidden, setSideHidden] = useState(() => {
    try {
      const saved = localStorage.getItem('teamSide')
      // На узком экране панель занимает весь первый экран, поэтому там она свёрнута, пока её не откроют.
      return saved ? saved === 'hidden' : window.matchMedia('(max-width: 1000px)').matches
    } catch {
      return false
    }
  })
  const isCaptain = team.captainUid === uid
  // Панель можно убрать, только когда роли уже розданы: до этого вся работа идёт в ней.
  const showSide = !sideHidden || team.phase !== 'running'
  const toggleSide = () => {
    setSideHidden((hidden) => {
      try {
        localStorage.setItem('teamSide', hidden ? 'shown' : 'hidden')
      } catch {
        // Не запомнится, и ладно.
      }
      return !hidden
    })
  }

  useEffect(() => {
    const onError = (e: Error) => {
      setError(errorText(e))
      onLostAccess()
    }
    const stopPlan = watchPlan(team.id, setStored, onError)
    const stopProgress = watchProgress(team.id, setProgress, onError)
    return () => {
      stopPlan()
      stopProgress()
    }
  }, [team.id, onLostAccess])

  const run = useCallback((action: Promise<unknown>) => {
    setError('')
    return action.catch((e) => setError(errorText(e)))
  }, [])

  // Карточка «вырастает» из того места, где на неё нажали. Из самой карточки переходим к связанным без этого.
  const openTask = useCallback((id: number, from?: Element | null) => {
    setTask((prev) => ({ id, from: from && !prev ? from.getBoundingClientRect() : null, key: prev ? prev.key : Date.now() }))
  }, [])

  const colors = useMemo(() => memberColors(team.members, team.roles, team.questRunner), [team.members, team.roles, team.questRunner])
  // Пока роли раздаются, план считается на лету у каждого в браузере: расчёт одинаковый у всех.
  const preview = useMemo(
    () => (catalog && team.phase === 'roles' ? buildPlan({ catalog, members: team.members, roles: team.roles, questRunner: team.questRunner }) : null),
    [catalog, team.phase, team.members, team.roles, team.questRunner],
  )
  const running = team.phase === 'running' && stored !== null
  const plan = team.phase === 'running' ? stored : preview
  const drift = useMemo(() => (catalog && team.phase === 'running' ? planDrift(stored, team.members, catalog) : null), [catalog, team.phase, stored, team.members])

  if (!catalog)
    return (
      <section className="card narrow">
        <h1>{team.name}</h1>
        <p className="muted">Для сервера {serverName(team.server)} список заданий ещё не готов.</p>
        <Link to="/cabinet">В личный кабинет</Link>
      </section>
    )

  const ctx: TeamCtx = { team, catalog, plan, preview: team.phase === 'roles', progress, colors, uid, nickname, isCaptain, running, run, openTask }

  const mineLeft = plan ? pathOf(plan, catalog, uid).filter((t) => stateOf(progress, t.id) !== 'done').length : 0
  const questsLeft = catalog.quests.filter((q) => questStage(progress, q.id) !== QUEST_DONE).length
  const counter: Record<TabId, number | null> = { progress: null, quests: questsLeft, mine: plan ? mineLeft : null }

  return (
    <div className={`team-page${showSide ? '' : ' no-side'}`}>
      <div className="team-main">
        <div className="team-title">
          {editingName !== null ? (
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault()
                run(renameTeam(team.id, editingName)).then(() => setEditingName(null))
              }}
            >
              <input value={editingName} onChange={(e) => setEditingName(e.target.value)} minLength={2} maxLength={32} autoFocus />
              <button className="btn small">Сохранить</button>
              <button type="button" className="link" onClick={() => setEditingName(null)}>
                Отмена
              </button>
            </form>
          ) : (
            <h1>
              {team.name}
              {isCaptain && (
                <button className="link small" onClick={() => setEditingName(team.name)}>
                  изменить
                </button>
              )}
            </h1>
          )}
          <p className="muted">
            {serverName(team.server)} · ID <span className="team-id">{team.id}</span>
            <button className="link small" onClick={() => navigator.clipboard?.writeText(team.id)}>
              скопировать
            </button>
          </p>
          {team.phase === 'running' && (
            <button className="link small side-toggle" onClick={toggleSide}>
              {showSide ? 'Скрыть панель команды' : `Команда · ${team.members.length}`}
            </button>
          )}
        </div>

        {error && (
          <p className="error banner" role="alert">
            {error}
            <button className="link small" onClick={() => setError('')}>
              скрыть
            </button>
          </p>
        )}
        {drift && (
          <p className="warn banner">
            {drift.gone.length > 0 && 'Кто-то вышел из команды после распределения, и его задания остались без исполнителя. '}
            {drift.newcomers.length > 0 && `После распределения в команду вошли: ${drift.newcomers.map((m) => nickOf(team, m)).join(', ')}. У них пока нет заданий. `}
            {drift.catalogChanged && 'Список заданий обновился после распределения. '}
            {isCaptain ? 'Нажми «Изменить роли» в панели команды и заверши распределение заново: задания пересчитаются, отметки сохранятся.' : 'Капитану нужно перераспределить задания.'}
          </p>
        )}

        <div className="tabs big">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              {t.title}
              {counter[t.id] !== null && <span className="tab-count">{counter[t.id]}</span>}
            </button>
          ))}
        </div>

        {tab === 'progress' && <TreeBoard ctx={ctx} />}
        {tab === 'quests' && <QuestsTab ctx={ctx} />}
        {tab === 'mine' && <MyTasks ctx={ctx} />}
      </div>

      {showSide && <TeamPanel ctx={ctx} onManage={() => setManage(true)} onLeave={() => run(leaveTeam(uid, team.id)).then(() => navigate('/cabinet'))} />}

      {task && <TaskDialog key={task.key} ctx={ctx} taskId={task.id} from={task.from} onClose={() => setTask(null)} />}
      {manage && isCaptain && <ManageDialog ctx={ctx} onClose={() => setManage(false)} onDisbanded={() => navigate('/cabinet')} />}
    </div>
  )
}
