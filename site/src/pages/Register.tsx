import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { errorText } from '../lib/errors'
import { NICK_RE, register } from '../lib/users'

export default function Register() {
  const { user, reloadProfile } = useAuth()
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/cabinet" replace />

  const nickOk = NICK_RE.test(nickname)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!nickOk) return setError('Ник: от 3 до 16 символов, латиница, цифры и _.')
    if (password !== password2) return setError('Пароли не совпадают.')
    setBusy(true)
    setError('')
    try {
      await register(email.trim(), password, nickname)
      await reloadProfile()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <section className="card narrow">
      <h1>Регистрация</h1>
      <form onSubmit={submit} className="form">
        <label>
          Ник на Loliland
          <input value={nickname} onChange={(e) => setNickname(e.target.value.trim())} maxLength={16} autoComplete="username" required />
          <span className="hint">Пиши свой настоящий ник с сервера: по нему потом будут подтягиваться время и монеты.</span>
        </label>
        <label>
          Почта
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label>
          Пароль
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} autoComplete="new-password" required />
        </label>
        <label>
          Пароль ещё раз
          <input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} minLength={6} autoComplete="new-password" required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn" disabled={busy}>
          {busy ? 'Создаём аккаунт…' : 'Зарегистрироваться'}
        </button>
      </form>
      <p className="muted small">
        Уже есть аккаунт? <Link to="/login">Войти</Link>
      </p>
    </section>
  )
}
