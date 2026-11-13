import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import FindTeamDialog from '../components/FindTeamDialog'
import { errorText } from '../lib/errors'
import { acceptInvitation, declineInvitation, watchMyInvitations, type Invitation } from '../lib/invites'
import { SERVERS, serverName } from '../lib/servers'
import { joinableById, watchMyTeams, type Team } from '../lib/teams'

const PHASE: Record<Team['phase'], string> = { gathering: 'сбор команды', roles: 'раздача ролей', running: 'идёт сборка' }

export default function Cabinet() {
  const { user, profile } = useAuth()
  const [teams, setTeams] = useState<Team[] | null>(null)
  const [error, setError] = useState('')
  const [dialogServer, setDialogServer] = useState<string | null>(null)
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [busy, setBusy] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    if (!user) return
    const onError = (e: Error) => setError(errorText(e))
    const stopTeams = watchMyTeams(user.uid, setTeams, onError)
    const stopInvitations = watchMyInvitations(user.uid, setInvitations, onError)
    return () => {
      stopTeams()
      stopInvitations()
    }
  }, [user])

  if (!user || !profile) return null

  // Приглашения в команды, где человек уже состоит, не показываем.
  const pending = invitations.filter((i) => !(teams ?? []).some((t) => t.id === i.teamId))

  const answer = (inv: Invitation, accept: boolean) => {
    setBusy(inv.id)
    setError('')
    const done = accept ? acceptInvitation(inv, user.uid, profile.nickname).then(() => navigate(`/team/${inv.teamId}`)) : declineInvitation(inv, user.uid)
    done.catch((e) => setError(errorText(e))).finally(() => setBusy(''))
  }

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

      {error && <p className="error">{error}</p>}

      {pending.length > 0 && (
        <>
          <h2 className="section-title">Приглашения</h2>
          {pending.map((inv) => (
            <section key={inv.id} className="card invitation">
              <div>
                <h3>{inv.teamName}</h3>
                <p className="muted small">
                  {serverName(inv.server)} · зовёт капитан {inv.fromNick}
                </p>
              </div>
              <div className="row">
                <button className="btn" disabled={busy === inv.id} onClick={() => answer(inv, true)}>
                  Вступить
                </button>
                <button className="btn ghost" disabled={busy === inv.id} onClick={() => answer(inv, false)}>
                  Отказаться
                </button>
              </div>
            </section>
          ))}
        </>
      )}

      <h2 className="section-title">Мои команды</h2>

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
                      <span className="muted small">
                        {t.members.length} чел. · {PHASE[t.phase]}
                      </span>
                      <span className={`badge ${joinableById(t) ? 'green' : ''}`}>{joinableById(t) ? 'открыта' : 'закрыта'}</span>
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
