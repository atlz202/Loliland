import { signInWithEmailAndPassword } from 'firebase/auth'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { errorText } from '../lib/errors'
import { auth } from '../lib/firebase'

export default function Login() {
  const { user } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to={(location.state as { from?: string })?.from ?? '/cabinet'} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <section className="card narrow">
      <h1>Вход</h1>
      <form onSubmit={submit} className="form">
        <label>
          Почта
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label>
          Пароль
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn" disabled={busy}>
          {busy ? 'Входим…' : 'Войти'}
        </button>
      </form>
      <p className="muted small">
        <Link to="/reset">Забыл пароль?</Link> · Нет аккаунта? <Link to="/register">Регистрация</Link>
      </p>
    </section>
  )
}
