import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { errorText } from '../lib/errors'
import { serverName } from '../lib/servers'
import { createTeam, joinTeam } from '../lib/teams'

interface Props {
  uid: string
  nickname: string
  server: string
  onClose: () => void
}

export default function FindTeamDialog({ uid, nickname, server, onClose }: Props) {
  const [mode, setMode] = useState<'join' | 'create'>('join')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [createdId, setCreatedId] = useState('')
  const navigate = useNavigate()

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (mode === 'join') {
        const id = await joinTeam(uid, nickname, server, value)
        navigate(`/team/${id}`)
      } else {
        setCreatedId(await createTeam(uid, nickname, server, value))
      }
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h2>Найти команду · {serverName(server)}</h2>
          <button className="icon" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        {createdId ? (
          <div className="created">
            <p>Команда создана. Отправь этот ID тем, кого зовёшь:</p>
            <div className="team-id big">{createdId}</div>
            <div className="row">
              <button className="btn ghost" onClick={() => navigator.clipboard?.writeText(createdId)}>
                Скопировать
              </button>
              <button className="btn" onClick={() => navigate(`/team/${createdId}`)}>
                Открыть команду
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="tabs">
              <button className={mode === 'join' ? 'active' : ''} onClick={() => (setMode('join'), setValue(''), setError(''))}>
                Присоединиться
              </button>
              <button className={mode === 'create' ? 'active' : ''} onClick={() => (setMode('create'), setValue(''), setError(''))}>
                Создать
              </button>
            </div>
            <form onSubmit={submit} className="form">
              {mode === 'join' ? (
                <label>
                  ID команды
                  <input
                    value={value}
                    onChange={(e) => setValue(e.target.value.toUpperCase())}
                    placeholder="Например, K7M2QX"
                    maxLength={6}
                    autoFocus
                    className="mono"
                  />
                </label>
              ) : (
                <label>
                  Название команды
                  <input value={value} onChange={(e) => setValue(e.target.value)} minLength={2} maxLength={32} autoFocus />
                </label>
              )}
              {error && <p className="error">{error}</p>}
              <button className="btn" disabled={busy || value.trim().length < 2}>
                {busy ? 'Подожди…' : mode === 'join' ? 'Присоединиться' : 'Создать команду'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
