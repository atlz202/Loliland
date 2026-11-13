import { signOut } from 'firebase/auth'
import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { errorText } from '../lib/errors'
import { auth } from '../lib/firebase'
import { peekReturn } from '../lib/returnTo'
import { claimNickname, isNicknameFree, NICK_RE } from '../lib/users'

/** На случай, если аккаунт есть, а ник не сохранился (например, оборвалась связь при регистрации). */
export default function ChooseNickname() {
  const { user, profile, reloadProfile } = useAuth()
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user === null) return <Navigate to="/login" replace />
  if (profile) return <Navigate to={peekReturn() ?? '/cabinet'} replace />
  if (!user) return null

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!NICK_RE.test(nickname)) return setError('Ник: от 3 до 16 символов, латиница, цифры и _.')
    setBusy(true)
    setError('')
    try {
      if (!(await isNicknameFree(nickname))) throw new Error('nickname-taken')
      await claimNickname(user!.uid, nickname)
      await reloadProfile()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <section className="card narrow">
      <h1>Укажи ник</h1>
      <p className="muted">Без ника с Loliland кабинет не откроется.</p>
      <form onSubmit={submit} className="form">
        <label>
          Ник на Loliland
          <input value={nickname} onChange={(e) => setNickname(e.target.value.trim())} maxLength={16} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn" disabled={busy}>
          Сохранить
        </button>
      </form>
      <p className="muted small">
        <button className="link" onClick={() => signOut(auth)}>
          Выйти
        </button>
      </p>
    </section>
  )
}
