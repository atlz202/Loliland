import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { errorText } from '../lib/errors'
import { serverName } from '../lib/servers'
import { leaveTeam, renameTeam, setTeamOpen, watchTeam, type Team } from '../lib/teams'

const TABS = [
  { id: 'progress', title: 'Общий прогресс', text: 'Дерево всех заданий сборки по времени и направлениям, кто что делает.' },
  { id: 'quests', title: 'Квесты', text: 'На каком этапе команда по каждому квесту.' },
  { id: 'mine', title: 'Мои задачи', text: 'Твои задания по порядку: что сейчас, что следующее.' },
] as const

export default function TeamPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [team, setTeam] = useState<Team | null | undefined>(undefined)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('progress')
  const [editingName, setEditingName] = useState<string | null>(null)

  useEffect(() => watchTeam(id, setTeam, (e) => setError(errorText(e))), [id])

  if (error) return <section className="card narrow error">{error}</section>
  if (team === undefined) return <div className="center muted">Загрузка…</div>
  if (team === null || !user)
    return (
      <section className="card narrow">
        <h1>Команда не найдена</h1>
        <Link to="/cabinet">В личный кабинет</Link>
      </section>
    )

  const isMember = team.members.includes(user.uid)
  const isCaptain = team.captainUid === user.uid
  const run = (p: Promise<unknown>) => p.catch((e) => setError(errorText(e)))

  if (!isMember)
    return (
      <section className="card narrow">
        <h1>{team.name}</h1>
        <p className="muted">Ты не в этой команде. Войти можно через «Найти команду» в личном кабинете.</p>
        <Link to="/cabinet">В личный кабинет</Link>
      </section>
    )

  const activeTab = TABS.find((t) => t.id === tab)!

  return (
    <div className="team-page">
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
        </div>

        <div className="tabs big">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              {t.title}
            </button>
          ))}
        </div>
        <section className="card placeholder">
          <h2>{activeTab.title}</h2>
          <p>{activeTab.text}</p>
          <p className="muted small">Появится, когда согласуем список заданий.</p>
        </section>
      </div>

      <aside className="card team-side">
        <h3>Команда · {team.members.length}</h3>
        <ul className="members">
          {team.members.map((m) => (
            <li key={m}>
              <span className="dot" aria-hidden />
              {team.memberNicks[m] ?? '…'}
              {m === team.captainUid && <span className="badge gold">капитан</span>}
              {m === user.uid && <span className="muted small">(ты)</span>}
            </li>
          ))}
        </ul>
        <p className="muted small">Роли раздаются здесь после того, как капитан запустит распределение.</p>

        <div className="side-actions">
          <div className="status-line">
            Вход по ID: <span className={`badge ${team.open ? 'green' : ''}`}>{team.open ? 'открыт' : 'закрыт'}</span>
          </div>
          {isCaptain ? (
            <button className="btn small ghost" onClick={() => run(setTeamOpen(team.id, !team.open))}>
              {team.open ? 'Закрыть команду' : 'Открыть снова'}
            </button>
          ) : (
            <button
              className="btn small danger"
              onClick={() => {
                if (confirm(`Выйти из команды «${team.name}»?`)) run(leaveTeam(user.uid, team.id)).then(() => navigate('/cabinet'))
              }}
            >
              Выйти из команды
            </button>
          )}
        </div>
      </aside>
    </div>
  )
}
