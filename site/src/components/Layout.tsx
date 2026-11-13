import { signOut } from 'firebase/auth'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { auth, usingEmulators } from '../lib/firebase'

export default function Layout() {
  const { user, profile } = useAuth()
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden />
          Loliland Team
        </Link>
        <nav>
          {user && profile ? (
            <>
              <NavLink to="/cabinet">Личный кабинет</NavLink>
              <span className="nick">{profile.nickname}</span>
              <button className="link" onClick={() => signOut(auth)}>
                Выйти
              </button>
            </>
          ) : user === null ? (
            <>
              <NavLink to="/login">Вход</NavLink>
              <NavLink to="/register" className="btn small">
                Регистрация
              </NavLink>
            </>
          ) : null}
        </nav>
      </header>
      {usingEmulators && <div className="emu-banner">Локальный режим: данные в эмуляторе, не на сервере</div>}
      <main>
        <Outlet />
      </main>
    </div>
  )
}
