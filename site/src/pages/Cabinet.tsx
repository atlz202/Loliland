import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import FindTeamDialog from '../components/FindTeamDialog'
import { errorText } from '../lib/errors'
import { SERVERS } from '../lib/servers'
import { watchMyTeams, type Team } from '../lib/teams'

export default function Cabinet() {
  const { user, profile } = useAuth()
  const [teams, setTeams] = useState<Team[] | null>(null)
  const [error, setError] = useState('')
  const [dialogServer, setDialogServer] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    return watchMyTeams(user.uid, setTeams, (e) => setError(errorText(e)))
  }, [user])

  if (!user || !profile) return null

  return (
    <div className="cabinet">
      <section className="card profile">
        <div className="avatar" aria-hidden>
          {profile.nickname.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <h1>{profile.nickname}</h1>
          <p className="muted">{user.email}</p>
          {profile.createdAt && <p className="muted small">На сайте с {profile.createdAt.toDate().toLocaleDateString('ru-RU')}</p>}
        </div>
      </section>

      <h2 className="section-title">Мои команды</h2>
      {error && <p className="error">{error}</p>}

      {SERVERS.map((server) => {
        const mine = (teams ?? []).filter((t) => t.server === server.id)
        return (
          <section key={server.id} className="card server">
            <div className="server-head">
              <h3>{server.name}</h3>
              <button className="btn small ghost" onClick={() => setDialogServer(server.id)}>
                Найти команду
              </button>
            </div>
            {teams === null ? (
              <p className="muted">Загрузка…</p>
            ) : mine.length === 0 ? (
              <div className="empty">
                <p>На этом сервере у тебя пока нет команды.</p>
                <button className="btn" onClick={() => setDialogServer(server.id)}>
                  Найти команду
                </button>
              </div>
            ) : (
              <ul className="team-list">
                {mine.map((t) => (
                  <li key={t.id}>
                    <Link to={`/team/${t.id}`} className="team-row">
                      <span className="team-name">
                        {t.name}
                        {t.captainUid === user.uid && <span className="badge gold">капитан</span>}
                      </span>
                      <span className="muted small">{t.members.length} чел.</span>
                      <span className={`badge ${t.open ? 'green' : ''}`}>{t.open ? 'открыта' : 'закрыта'}</span>
                      <span className="team-id">{t.id}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}

      {dialogServer && (
        <FindTeamDialog uid={user.uid} nickname={profile.nickname} server={dialogServer} onClose={() => setDialogServer(null)} />
      )}
    </div>
  )
}
