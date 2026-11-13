import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { errorText } from '../lib/errors'
import { joinByLink, linkUsedUp, loadLink, type LinkPreview } from '../lib/invites'
import { clearReturn, rememberReturn } from '../lib/returnTo'
import { serverName } from '../lib/servers'
import { MAX_MEMBERS } from '../lib/teams'

/** Страница ссылки-приглашения: /join/<ID команды>/<ключ ссылки>. */
export default function Join() {
  const { teamId = '', token = '' } = useParams()
  const { user, profile } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [preview, setPreview] = useState<LinkPreview | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const ready = Boolean(user && profile)

  // Гость сначала входит или регистрируется. Запоминаем ссылку, чтобы вернуть его сюда.
  useEffect(() => {
    if (user === null || (user && !profile)) rememberReturn(location.pathname)
    else if (ready) clearReturn()
  }, [user, profile, ready, location.pathname])

  useEffect(() => {
    if (!ready) return
    let stale = false
    loadLink(teamId, token)
      .then((p) => !stale && setPreview(p))
      .catch((e) => !stale && setError(errorText(e)))
    return () => {
      stale = true
    }
  }, [ready, teamId, token])

  if (user === undefined) return <div className="center muted">Загрузка…</div>
  if (user && !profile) return <Navigate to="/nickname" replace />
  if (!user || !profile)
    return (
      <section className="card narrow">
        <h1>Тебя зовут в команду</h1>
        <p className="muted">Это ссылка-приглашение в команду на Loliland Team. Чтобы вступить, войди или зарегистрируйся: после этого ты вернёшься сюда.</p>
        <div className="row">
          <Link to="/register" className="btn">
            Зарегистрироваться
          </Link>
          <Link to="/login" className="btn ghost">
            Войти
          </Link>
        </div>
      </section>
    )

  if (error && !preview) return <section className="card narrow error">{error}</section>
  if (!preview) return <div className="center muted">Загрузка…</div>

  const { team, link } = preview
  if (!team || !link)
    return (
      <section className="card narrow">
        <h1>Ссылка не работает</h1>
        <p className="muted">Такой ссылки нет. Возможно, капитан её удалил. Попроси новую.</p>
        <Link to="/cabinet">В личный кабинет</Link>
      </section>
    )

  const member = team.members.includes(user.uid)
  const problem = member
    ? null
    : link.revoked
      ? 'Капитан отозвал эту ссылку. Попроси новую.'
      : linkUsedUp(link)
        ? 'По этой ссылке уже вошли столько раз, сколько было разрешено. Попроси у капитана новую.'
        : team.members.length >= MAX_MEMBERS
          ? `В команде уже ${MAX_MEMBERS} человек, больше нельзя.`
          : null

  async function join() {
    setBusy(true)
    setError('')
    try {
      await joinByLink(user!.uid, profile!.nickname, teamId, token)
      navigate(`/team/${teamId}`, { replace: true })
    } catch (e) {
      setError(errorText(e))
      setBusy(false)
    }
  }

  return (
    <section className="card narrow join">
      <p className="muted small">Приглашение в команду</p>
      <h1>{team.name}</h1>
      <p className="muted">
        {serverName(team.server)} · капитан {team.memberNicks[team.captainUid] ?? '…'} · {team.members.length} чел.
      </p>
      {member ? (
        <>
          <p>Ты уже в этой команде.</p>
          <Link to={`/team/${team.id}`} className="btn">
            Открыть команду
          </Link>
        </>
      ) : problem ? (
        <>
          <p className="error">{problem}</p>
          <Link to="/cabinet">В личный кабинет</Link>
        </>
      ) : (
        <>
          <p>
            Вступаешь как <b>{profile.nickname}</b>.
          </p>
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button className="btn" disabled={busy} onClick={join}>
              {busy ? 'Вступаем…' : 'Вступить в команду'}
            </button>
            <Link to="/cabinet" className="btn ghost">
              Не сейчас
            </Link>
          </div>
        </>
      )}
    </section>
  )
}
