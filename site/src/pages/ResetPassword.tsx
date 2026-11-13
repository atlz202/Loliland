import { sendPasswordResetEmail } from 'firebase/auth'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { errorText } from '../lib/errors'
import { auth } from '../lib/firebase'

export default function ResetPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await sendPasswordResetEmail(auth, email.trim())
      setSent(true)
    } catch (err) {
      setError(errorText(err))
    }
  }

  return (
    <section className="card narrow">
      <h1>Сброс пароля</h1>
      {sent ? (
        <p>Если такая почта зарегистрирована, на неё пришло письмо со ссылкой для нового пароля.</p>
      ) : (
        <form onSubmit={submit} className="form">
          <label>
            Почта
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn">Отправить письмо</button>
        </form>
      )}
      <p className="muted small">
        <Link to="/login">Назад ко входу</Link>
      </p>
    </section>
  )
}
