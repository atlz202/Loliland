import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export default function Home() {
  const { user } = useAuth()
  if (user) return <Navigate to="/cabinet" replace />
  return (
    <section className="hero">
      <h1>Сборка командой, без хаоса</h1>
      <p className="lead">
        Дерево заданий на весь вайп: кто что делает, в каком порядке и зачем. Собери команду, раздайте роли, и у
        каждого появится свой путь.
      </p>
      <div className="row">
        <Link to="/register" className="btn">
          Зарегистрироваться
        </Link>
        <Link to="/login" className="btn ghost">
          Войти
        </Link>
      </div>
      <ul className="steps">
        <li>
          <b>1</b>Регистрация с ником с Loliland
        </li>
        <li>
          <b>2</b>Создай команду или войди по её ID
        </li>
        <li>
          <b>3</b>Раздайте роли, и задания распределятся сами
        </li>
      </ul>
    </section>
  )
}
