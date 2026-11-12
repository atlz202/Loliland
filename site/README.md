# Сайт команды Loliland

Дерево заданий сборки для команды на модовом сервере Loliland. Описание всего сайта лежит в файлах проекта (`site_spec.md`).

Сейчас готово: регистрация с ником с Loliland, вход, сброс пароля, личный кабинет, «Мои команды» по серверам, создание команды с уникальным ID, вход по ID, закрытие и открытие команды капитаном, выход из команды. На странице команды пока заглушки трёх вкладок.

## Из чего сделан

- **Firebase** (Google), бесплатный план Spark, без карты:
  - **Hosting** — сам сайт (адрес вида `имя-проекта.web.app`);
  - **Authentication** — регистрация и вход по почте и паролю;
  - **Firestore** — база (профили, ники, команды), изменения видны всем сразу.
- **React + TypeScript + Vite** — сам сайт.

## Структура

```
site/
├─ firebase.json            настройки хостинга и эмуляторов
├─ firestore.rules          кто что может читать и менять в базе
├─ tests/rules.test.mjs     проверки правил базы
└─ src/
   ├─ lib/
   │  ├─ firebase.ts        подключение к Firebase (или к эмуляторам)
   │  ├─ servers.ts         список серверов Loliland
   │  ├─ users.ts           регистрация и ники
   │  ├─ teams.ts           команды: создать, войти по ID, закрыть, выйти
   │  └─ errors.ts          тексты ошибок по-русски
   ├─ auth/AuthContext.tsx  кто сейчас вошёл
   ├─ components/           шапка, защита страниц, окно «Найти команду»
   └─ pages/                главная, вход, регистрация, сброс пароля, кабинет, команда
```

## Данные в базе

| Коллекция | Документ | Поля |
|---|---|---|
| `users` | uid | `nickname`, `nicknameLower`, `createdAt` |
| `nicknames` | ник в нижнем регистре | `uid` (нужен, чтобы ник не заняли дважды) |
| `teams` | ID команды (6 символов) | `name`, `server`, `captainUid`, `members`, `memberNicks`, `open`, `createdAt` |

## Запустить у себя без настоящего проекта

Нужен Node.js 20+ и Java 11+ (для эмулятора базы).

```bash
cd site
npm install
npm run emulators      # в одном окне: локальные «Firebase» на компьютере
npm run dev:local      # в другом окне: сайт на http://localhost:5173
npm run test:rules     # проверить правила базы
```

## Выложить в интернет (один раз)

1. Зайти на https://console.firebase.google.com под Google-аккаунтом и создать проект (Google Analytics можно выключить).
2. **Build → Authentication → Get started → Email/Password → включить.**
3. **Build → Firestore Database → Create database**, регион `eur3 (europe-west)`, режим production.
4. **Project settings → General → Your apps → значок `</>`** (веб-приложение), любое имя. Скопировать значения `apiKey`, `authDomain`, `projectId`, `appId`.
5. В папке `site` создать файл `.env.local` по образцу `.env.example` и вставить туда эти значения. Они не секретные: защищает базу `firestore.rules`.
6. Выложить:

```bash
cd site
npx firebase login
npx firebase use --add          # выбрать созданный проект
npm run deploy                  # собирает сайт и выкладывает сайт и правила базы
```

Сайт откроется по адресу `https://<id-проекта>.web.app`.

## Лимиты бесплатного плана

Хостинг: 10 ГБ места и около 360 МБ трафика в день. Firestore: 50 000 чтений и 20 000 записей в день, 1 ГБ данных. Для нескольких команд этого хватает с большим запасом. Платные функции (Cloud Functions, например для парсера Loliland) требуют тарифа Blaze с картой; парсер можно будет запускать и бесплатно через GitHub Actions.
