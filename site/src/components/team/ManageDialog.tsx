// Окно капитана: вход по ID и автозакрытие, ссылки-приглашения, личные приглашения, участники.
import { useEffect, useState, type FormEvent } from 'react'
import { errorText } from '../../lib/errors'
import {
  createLink,
  deleteLink,
  disbandTeam,
  invitePlayer,
  LINK_USES,
  linkUrl,
  linkUsedUp,
  revokeInvitation,
  revokeLink,
  searchUsers,
  watchLinks,
  type FoundUser,
  type InviteLink,
} from '../../lib/invites'
import { autoClosed, closesAt, kickMember, MAX_MEMBERS, nickOf, setAutoCloseHours, setTeamOpen, transferCaptain } from '../../lib/teams'
import { NICK_RE } from '../../lib/users'
import Dialog from '../Dialog'
import { Who } from './bits'
import type { TeamCtx } from './ctx'

const usesLabel = (n: number) => (n === 0 ? '∞' : String(n))

function CopyButton({ text, label = 'Скопировать' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="btn small ghost"
      onClick={() =>
        navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          })
          .catch(() => {})
      }
    >
      {copied ? 'Скопировано' : label}
    </button>
  )
}

export default function ManageDialog({ ctx, onClose, onDisbanded }: { ctx: TeamCtx; onClose: () => void; onDisbanded: () => void }) {
  const { team, colors, uid } = ctx
  const [links, setLinks] = useState<InviteLink[]>([])
  const [uses, setUses] = useState<number>(1)
  const [hours, setHours] = useState(String(team.autoCloseHours))
  const [search, setSearch] = useState('')
  const [found, setFound] = useState<FoundUser[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [ask, setAsk] = useState<{ text: string; yes: string; action: () => Promise<unknown> } | null>(null)

  useEffect(() => watchLinks(team.id, setLinks, (e) => setError(errorText(e))), [team.id])

  // Поиск по началу ника, с небольшой задержкой после ввода.
  useEffect(() => {
    const prefix = search.trim()
    if (prefix.length < 2 || !/^[A-Za-z0-9_]+$/.test(prefix)) {
      setFound(null)
      return
    }
    let stale = false
    setSearching(true)
    const timer = setTimeout(() => {
      searchUsers(prefix)
        .then((list) => !stale && setFound(list))
        .catch((e) => !stale && setError(errorText(e)))
        .finally(() => !stale && setSearching(false))
    }, 300)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [search])

  const run = (p: Promise<unknown>) => {
    setError('')
    return p.catch((e) => setError(errorText(e)))
  }
  const expired = autoClosed(team)
  const closing = closesAt(team)
  // Кто успел войти другим путём, в списке «ещё не ответили» не нужен.
  const invited = Object.entries(team.invited).filter(([id]) => !team.members.includes(id))
  const full = team.members.length >= MAX_MEMBERS
  const hoursNumber = Number(hours)
  const hoursOk = Number.isInteger(hoursNumber) && hoursNumber >= 1 && hoursNumber <= 720

  const saveHours = (e: FormEvent) => {
    e.preventDefault()
    if (hoursOk && hoursNumber !== team.autoCloseHours) run(setAutoCloseHours(team.id, hoursNumber))
  }

  return (
    <Dialog wide title={<h2>Управление командой «{team.name}»</h2>} onClose={onClose} className="manage">
      {error && <p className="error">{error}</p>}

      <section>
        <h4>Вход по ID</h4>
        <div className="row">
          <span className="team-id big-ish">{team.id}</span>
          <CopyButton text={team.id} label="Скопировать ID" />
          {!team.open ? <span className="badge">закрыт</span> : expired ? <span className="badge">закрылся сам</span> : <span className="badge green">открыт</span>}
          <button className="btn small ghost" onClick={() => run(setTeamOpen(team.id, !team.open || expired))}>
            {!team.open || expired ? 'Открыть снова' : 'Закрыть вход'}
          </button>
        </div>
        <p className="muted small">
          {!team.open
            ? 'По ID сейчас никто не войдёт. Ссылки и личные приглашения работают и в закрытой команде.'
            : expired
              ? 'Давно никто не входил, поэтому вход по ID закрылся сам. Ссылки и личные приглашения работают.'
              : closing
                ? `Закроется сам ${new Date(closing).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}, если за это время никто не войдёт. Каждый вход отодвигает срок.`
                : ''}
        </p>
        <form className="row" onSubmit={saveHours}>
          <label className="inline">
            Закрывать, если никто не вошёл за
            <input type="number" min={1} max={720} value={hours} onChange={(e) => setHours(e.target.value)} className="num" />ч
          </label>
          <button className="btn small ghost" disabled={!hoursOk || hoursNumber === team.autoCloseHours}>
            Сохранить
          </button>
        </form>
      </section>

      <section>
        <h4>Ссылка-приглашение</h4>
        <p className="muted small">Кто откроет ссылку, сможет вступить, даже если вход по ID закрыт. Одноразовая сгорает после первого входа.</p>
        <div className="row">
          <span className="muted small">Сколько человек может войти:</span>
          <div className="seg" role="group" aria-label="Сколько человек может войти по ссылке">
            {LINK_USES.map((n) => (
              <button key={n} type="button" className={uses === n ? 'active' : ''} onClick={() => setUses(n)} title={n === 0 ? 'Без ограничений' : undefined}>
                {usesLabel(n)}
              </button>
            ))}
          </div>
          <button className="btn small" disabled={full} onClick={() => run(createLink(team.id, uid, uses))}>
            Создать ссылку
          </button>
        </div>
        {links.length > 0 && (
          <ul className="links">
            {links.map((l) => {
              const dead = l.revoked || linkUsedUp(l)
              return (
                <li key={l.token} className={dead ? 'dead' : ''}>
                  <input readOnly value={linkUrl(team.id, l.token)} onFocus={(e) => e.target.select()} aria-label="Ссылка-приглашение" />
                  <span className="muted small">
                    {l.revoked ? 'отозвана' : linkUsedUp(l) ? 'использована' : l.maxUses === 0 ? `без ограничений, вошли ${l.uses}` : `вошли ${l.uses} из ${l.maxUses}`}
                  </span>
                  {!dead && <CopyButton text={linkUrl(team.id, l.token)} />}
                  {dead ? (
                    <button className="btn small ghost" onClick={() => run(deleteLink(team.id, l.token))}>
                      Удалить
                    </button>
                  ) : (
                    <button className="btn small danger" onClick={() => run(revokeLink(team.id, l.token))}>
                      Отозвать
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section>
        <h4>Пригласить игрока</h4>
        <p className="muted small">Начни вводить ник игрока, который уже зарегистрирован на сайте. Он увидит приглашение у себя в кабинете.</p>
        <input value={search} onChange={(e) => setSearch(e.target.value.trim())} placeholder="Ник, от двух букв" maxLength={16} aria-label="Ник игрока" />
        {search.length >= 2 && !NICK_RE.test(search) && search.length >= 3 && <p className="muted small">В нике только латиница, цифры и _.</p>}
        {found && (
          <ul className="found">
            {found.length === 0 && !searching && <li className="muted small">Никого не нашлось. Игрок должен сначала зарегистрироваться на сайте.</li>}
            {found.map((u) => {
              const member = team.members.includes(u.uid)
              const already = u.uid in team.invited
              return (
                <li key={u.uid}>
                  <span>{u.nickname}</span>
                  {member ? (
                    <span className="muted small">уже в команде</span>
                  ) : already ? (
                    <span className="muted small">приглашён</span>
                  ) : (
                    <button className="btn small" disabled={full || invited.length >= 20} onClick={() => run(invitePlayer(team, ctx.nickname, u))}>
                      Пригласить
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {invited.length > 0 && (
          <>
            <p className="muted small">Приглашены и ещё не ответили:</p>
            <ul className="found">
              {invited.map(([id, nick]) => (
                <li key={id}>
                  <span>{nick}</span>
                  <button className="btn small ghost" onClick={() => run(revokeInvitation(team.id, id))}>
                    Отозвать
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section>
        <h4>
          Участники <span className="muted">{team.members.length} из {MAX_MEMBERS}</span>
        </h4>
        <ul className="found">
          {team.members.map((m) => (
            <li key={m}>
              <span className="row tight">
                <Who nick={nickOf(team, m)} color={colors[m]} size="sm" />
                {nickOf(team, m)}
                {m === team.captainUid && <span className="badge gold">капитан</span>}
              </span>
              {m !== uid && (
                <span className="row tight">
                  <button
                    className="btn small ghost"
                    onClick={() =>
                      setAsk({
                        text: `Передать капитана игроку ${nickOf(team, m)}? Ты останешься в команде обычным участником, вернуть капитана сможет только он.`,
                        yes: 'Передать',
                        action: () => transferCaptain(team.id, m).then(onClose),
                      })
                    }
                  >
                    Сделать капитаном
                  </button>
                  <button
                    className="btn small danger"
                    onClick={() =>
                      setAsk({
                        text: `Исключить ${nickOf(team, m)} из команды? Его роли освободятся${team.phase === 'running' ? ', а задания останутся без исполнителя, пока ты не перераспределишь их' : ''}.`,
                        yes: 'Исключить',
                        action: () => kickMember(team.id, m),
                      })
                    }
                  >
                    Исключить
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
        {team.members.length > 1 ? (
          <p className="muted small">Чтобы выйти из команды самому, сначала передай капитана. Распустить команду можно, когда в ней остался только капитан.</p>
        ) : (
          <div className="row">
            <span className="muted small grow">В команде только ты. Если она больше не нужна, её можно распустить.</span>
            <button
              className="btn small danger"
              onClick={() =>
                setAsk({
                  text: `Распустить команду «${team.name}»? Она удалится вместе с планом и отметками. Вернуть её будет нельзя.`,
                  yes: 'Распустить',
                  action: () => disbandTeam(team, links).then(onDisbanded),
                })
              }
            >
              Распустить команду
            </button>
          </div>
        )}
      </section>

      {ask && (
        <Dialog title={<h2>Точно?</h2>} onClose={() => setAsk(null)}>
          <p>{ask.text}</p>
          <div className="row end">
            <button className="btn ghost" onClick={() => setAsk(null)}>
              Отмена
            </button>
            <button
              className="btn danger"
              onClick={() => {
                const { action } = ask
                setAsk(null)
                run(action())
              }}
            >
              {ask.yes}
            </button>
          </div>
        </Dialog>
      )}
    </Dialog>
  )
}
