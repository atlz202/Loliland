import { FirebaseError } from 'firebase/app'

const MESSAGES: Record<string, string> = {
  'auth/email-already-in-use': 'Эта почта уже зарегистрирована.',
  'auth/invalid-email': 'Почта указана неверно.',
  'auth/weak-password': 'Пароль слишком короткий: нужно минимум 6 символов.',
  'auth/invalid-credential': 'Неверная почта или пароль.',
  'auth/wrong-password': 'Неверная почта или пароль.',
  'auth/user-not-found': 'Неверная почта или пароль.',
  'auth/too-many-requests': 'Слишком много попыток. Подожди немного и попробуй снова.',
  'auth/network-request-failed': 'Нет связи с сервером. Проверь интернет.',
  'nickname-taken': 'Этот ник уже занят.',
  'not-found': 'Команды с таким ID нет.',
  closed: 'Команда закрыта, войти по ID нельзя.',
  'wrong-server': 'Эта команда с другого сервера.',
  'already-member': 'Ты уже в этой команде.',
  'id-collision': 'Не получилось подобрать ID. Попробуй ещё раз.',
  'permission-denied': 'Нет доступа.',
}

export function errorText(e: unknown): string {
  if (e instanceof FirebaseError) return MESSAGES[e.code] ?? `Ошибка: ${e.code}`
  if (e instanceof Error) return MESSAGES[e.message] ?? e.message
  return 'Что-то пошло не так.'
}
