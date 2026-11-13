// Куда вернуть человека после входа или регистрации. Нужно, чтобы ссылка-приглашение
// не терялась, если по ней пришёл тот, кто ещё не вошёл или не зарегистрирован.
const KEY = 'returnTo'

export function rememberReturn(path: string) {
  try {
    sessionStorage.setItem(KEY, path)
  } catch {
    // Хранилище может быть выключено: тогда человек просто попадёт в кабинет.
  }
}

/** Запомненный адрес внутри сайта или null. Сам адрес не забывает: это делает страница, на которую вернулись. */
export function peekReturn(): string | null {
  try {
    const path = sessionStorage.getItem(KEY)
    return path && path.startsWith('/') && !path.startsWith('//') ? path : null
  } catch {
    return null
  }
}

export function clearReturn() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Нечего забывать.
  }
}
