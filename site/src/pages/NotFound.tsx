import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <section className="card narrow">
      <h1>Страница не найдена</h1>
      <Link to="/">На главную</Link>
    </section>
  )
}
