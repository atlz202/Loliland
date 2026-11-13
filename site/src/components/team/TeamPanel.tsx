// Правая панель: состав команды, роли, раздача ролей перетаскиванием и кнопки капитана.
import { useEffect, useMemo, useState, type CSSProperties, type DragEvent } from 'react'
import { isRoleId, ROLES, roleOf } from '../../data/roles'
import type { RoleId } from '../../data/types'
import { orderedRoles } from '../../lib/colors'
import { loadOf, roleLoads, uncoveredRoles } from '../../lib/plan'
import { finishDistribution } from '../../lib/teamState'
import { autoClosed, closesAt, nickOf, setPhase, setQuestRunner, setRoles, toggleRole, type Team } from '../../lib/teams'
import Dialog from '../Dialog'
import { RoleChip, Who } from './bits'
import type { TeamCtx } from './ctx'

const PHASE_LABEL: Record<Team['phase'], string> = { gathering: 'Сбор команды', roles: 'Раздача ролей', running: 'Идёт сборка' }

const plural = (n: number, one: string, few: string, many: string) => {
  const d = n % 10
  const h = n % 100
  return d === 1 && h !== 11 ? one : d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many
}
const tasksWord = (n: number) => `${n} ${plural(n, 'задание', 'задания', 'заданий')}`
const hoursWord = (h: number) => `≈ ${Number.isInteger(h) ? h : h.toFixed(1)} ч`

/** Сколько осталось до того, как команда закроется сама. */
function leftText(ms: number) {
  const hours = ms / 3600e3
  if (hours >= 48) return `${Math.floor(hours / 24)} дн.`
  if (hours >= 1) return `${Math.floor(hours)} ч`
  return `${Math.max(1, Math.round(ms / 60e3))} мин`
}

interface Props {
  ctx: TeamCtx
  onManage: () => void
  onLeave: () => void
}

export default function TeamPanel({ ctx, onManage, onLeave }: Props) {
  const { team, catalog, plan, colors, uid, isCaptain } = ctx
  const [dragging, setDragging] = useState<RoleId | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'finish' | 'reopen' | 'leave' | null>(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  // Срок автозакрытия считается от текущего времени: раз в минуту обновляем.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60e3)
    return () => clearInterval(timer)
  }, [])

  const rolesPhase = team.phase === 'roles'
  const loads = useMemo(() => (plan ? loadOf(plan, catalog, team.members) : null), [plan, catalog, team.members])
  const perRole = useMemo(() => roleLoads(catalog), [catalog])
  const uncovered = useMemo(() => uncoveredRoles(catalog, team.members, team.roles), [catalog, team.members, team.roles])
  const holders = (role: RoleId) => (role === 'quest' ? (team.questRunner ? [team.questRunner] : []) : team.members.filter((m) => team.roles[m]?.includes(role)))

  /** Кому я могу давать роли: себе, а капитан — любому. */
  const canEdit = (m: string) => rolesPhase && (isCaptain || m === uid)

  const give = (m: string, role: RoleId) => {
    if (!canEdit(m)) return
    if (role === 'quest') {
      if (team.questRunner === m) return
      if (team.questRunner && !isCaptain) return void ctx.run(Promise.reject(new Error('quest-taken')))
      return void ctx.run(setQuestRunner(team.id, m))
    }
    const mine = team.roles[m] ?? []
    if (!mine.includes(role)) ctx.run(setRoles(team.id, m, [...mine, role]))
  }

  const toggle = (role: RoleId) => {
    if (!canEdit(uid)) return
    if (role === 'quest' && team.questRunner && team.questRunner !== uid && !isCaptain) return void ctx.run(Promise.reject(new Error('quest-taken')))
    ctx.run(toggleRole(team, uid, role))
  }

  const onDrop = (e: DragEvent, m: string) => {
    e.preventDefault()
    const role = e.dataTransfer.getData('text/plain')
    setOver(null)
    setDragging(null)
    if (isRoleId(role)) give(m, role)
  }

  const act = (p: Promise<unknown>) => {
    setBusy(true)
    return ctx.run(p).finally(() => {
      setBusy(false)
      setConfirm(null)
    })
  }

  const closing = closesAt(team)
  const expired = autoClosed(team, now)
  const noQuest = !team.questRunner
  const fallbackNick = plan?.questFallback ? nickOf(team, plan.questFallback) : null

  return (
    <aside className="card team-side">
      <div className="side-head">
        <h3>Команда · {team.members.length}</h3>
        <span className={`badge phase-${team.phase}`}>{PHASE_LABEL[team.phase]}</span>
      </div>

      <ul className={`members${dragging ? ' dragging' : ''}`}>
        {team.members.map((m) => {
          const roles = orderedRoles(team.roles[m], team.questRunner === m)
          const load = loads?.[m]
          const droppable = dragging !== null && canEdit(m)
          return (
            <li
              key={m}
              data-member={nickOf(team, m)}
              className={`${droppable ? 'droppable' : ''}${over === m && droppable ? ' over' : ''}`}
              onDragOver={(e) => {
                if (!canEdit(m)) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
                if (over !== m) setOver(m)
              }}
              onDragLeave={() => setOver((o) => (o === m ? null : o))}
              onDrop={(e) => onDrop(e, m)}
            >
              <Who nick={nickOf(team, m)} color={colors[m]} />
              <div className="member-body">
                <div className="member-name">
                  {nickOf(team, m)}
                  {m === team.captainUid && <span className="badge gold">капитан</span>}
                  {m === uid && <span className="muted small">(ты)</span>}
                </div>
                {roles.length > 0 && (
                  <div className="member-roles">
                    {roles.map((r) => (
                      <RoleChip key={r} id={r} onRemove={canEdit(m) ? () => ctx.run(r === 'quest' ? setQuestRunner(team.id, null) : setRoles(team.id, m, (team.roles[m] ?? []).filter((x) => x !== r))) : undefined} />
                    ))}
                  </div>
                )}
                {team.phase !== 'gathering' && roles.length === 0 && <div className="muted small">{rolesPhase ? (canEdit(m) ? 'перетащи роль сюда' : 'ещё без ролей') : 'без ролей'}</div>}
                {load && (
                  <div className="member-load muted small">
                    {tasksWord(load.count)} · {hoursWord(load.hours)}
                    {load.questCount > 0 && ` · квестовых ${load.questCount}`}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {team.phase === 'gathering' && (
        <div className="side-block">
          {isCaptain ? (
            <>
              <p className="muted small">Собери команду: дай ID, ссылку или пригласи по нику. Потом запускай раздачу ролей.</p>
              <button className="btn" disabled={busy} onClick={() => act(setPhase(team.id, 'roles'))}>
                Начать распределение ролей
              </button>
            </>
          ) : (
            <p className="muted small">Капитан собирает команду. Роли раздаются здесь, когда он запустит распределение.</p>
          )}
        </div>
      )}

      {rolesPhase && (
        <div className="side-block">
          <h4>Роли</h4>
          <p className="muted small">
            Перетащи роль на себя или просто нажми на неё. Ролей можно взять несколько: чем их больше, тем больше заданий.
            {isCaptain && ' Капитан может перетащить роль на любого.'}
          </p>
          <div className="palette">
            {ROLES.map((role) => {
              const who = holders(role.id)
              const mine = who.includes(uid)
              const takenByOther = role.id === 'quest' && who.length > 0 && !mine
              const load = perRole[role.id]
              return (
                <button
                  type="button"
                  key={role.id}
                  data-role={role.id}
                  className={`palette-role${mine ? ' mine' : ''}${takenByOther ? ' taken' : ''}${who.length === 0 ? ' free' : ''}`}
                  style={{ '--c': role.color } as CSSProperties}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', role.id)
                    e.dataTransfer.effectAllowed = 'copy'
                    // Не сразу: если страница перерисуется прямо в начале перетаскивания, браузер может его отменить.
                    setTimeout(() => setDragging(role.id), 0)
                  }}
                  onDragEnd={() => {
                    setDragging(null)
                    setOver(null)
                  }}
                  onClick={() => toggle(role.id)}
                  title={`${role.name}. ${role.about}`}
                >
                  <span className="palette-name">
                    {role.short}
                    {mine && <span aria-hidden> ✓</span>}
                  </span>
                  <span className="palette-meta">
                    {!load ? 'без заданий' : role.id === 'quest' ? `${tasksWord(load.count)} · параллельно` : `${tasksWord(load.count)} · ${hoursWord(load.hours)}`}
                  </span>
                  <span className="palette-who">
                    {who.length === 0 ? 'никто не взял' : who.map((m) => nickOf(team, m)).join(', ')}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="muted small">Часы условные, по сложности: лёгкое 0,5 ч, среднее 2 ч, сложное 6 ч, суперсложное 12 ч.</p>
          {(uncovered.length > 0 || noQuest) && (
            <div className="warn small">
              {uncovered.length > 0 && (
                <p>
                  Никто не взял: {uncovered.map((r) => roleOf(r).short).join(', ')}. Их задания достанутся тем, кто свободнее.
                </p>
              )}
              {noQuest && <p>Квестовика нет{fallbackNick ? `: квесты достанутся ${fallbackNick}` : ''}.</p>}
            </div>
          )}
          {isCaptain ? (
            <button className="btn" disabled={busy} onClick={() => setConfirm('finish')}>
              Распределение завершено
            </button>
          ) : (
            <p className="muted small">Когда все выберут роли, капитан нажмёт «Распределение завершено», и задания закрепятся.</p>
          )}
        </div>
      )}

      {team.phase === 'running' && isCaptain && (
        <div className="side-block">
          <button className="btn small ghost" disabled={busy} onClick={() => setConfirm('reopen')}>
            Изменить роли
          </button>
        </div>
      )}

      <div className="side-actions">
        <div className="status-line">
          Вход по ID:{' '}
          {!team.open ? (
            <span className="badge">закрыт</span>
          ) : expired ? (
            <span className="badge">закрылся сам</span>
          ) : (
            <>
              <span className="badge green">открыт</span>
              {closing && <span className="muted small"> закроется сам через {leftText(closing - now)}</span>}
            </>
          )}
        </div>
        {isCaptain ? (
          <button className="btn small ghost" onClick={onManage}>
            Управление командой
          </button>
        ) : (
          <button className="btn small danger" onClick={() => setConfirm('leave')}>
            Выйти из команды
          </button>
        )}
      </div>

      {confirm === 'finish' && (
        <Dialog title={<h2>Завершить распределение?</h2>} onClose={() => setConfirm(null)}>
          <p>Задания закрепятся за игроками по нынешним ролям, и у каждого появится свой путь.</p>
          {uncovered.length > 0 && (
            <p className="warn">
              Никто не взял роли: {uncovered.map((r) => roleOf(r).short).join(', ')}. Их задания достанутся тем, у кого работы меньше.
            </p>
          )}
          {noQuest && <p className="warn">Квестовика не выбрали{fallbackNick ? `: квесты будет вести ${fallbackNick}` : ''}.</p>}
          <p className="muted small">Вход по ID закроется: команда собрана. Роли потом можно изменить, отметки о сделанном сохранятся.</p>
          <div className="row end">
            <button className="btn ghost" onClick={() => setConfirm(null)}>
              Отмена
            </button>
            <button className="btn" disabled={busy} onClick={() => act(finishDistribution(team, catalog, uid))}>
              Завершить
            </button>
          </div>
        </Dialog>
      )}
      {confirm === 'reopen' && (
        <Dialog title={<h2>Вернуться к раздаче ролей?</h2>} onClose={() => setConfirm(null)}>
          <p>Игроки снова смогут менять роли. Задания пересчитаются, когда ты ещё раз нажмёшь «Распределение завершено».</p>
          <p className="muted small">Отметки о сделанных заданиях и квестах сохранятся. Пока роли раздаются, отмечать задания нельзя.</p>
          <div className="row end">
            <button className="btn ghost" onClick={() => setConfirm(null)}>
              Отмена
            </button>
            <button className="btn" disabled={busy} onClick={() => act(setPhase(team.id, 'roles'))}>
              Изменить роли
            </button>
          </div>
        </Dialog>
      )}
      {confirm === 'leave' && (
        <Dialog title={<h2>Выйти из команды «{team.name}»?</h2>} onClose={() => setConfirm(null)}>
          <p>Твои роли освободятся. {team.phase === 'running' && 'Твои задания останутся без исполнителя, пока капитан не перераспределит их.'}</p>
          <div className="row end">
            <button className="btn ghost" onClick={() => setConfirm(null)}>
              Отмена
            </button>
            <button className="btn danger" onClick={onLeave}>
              Выйти
            </button>
          </div>
        </Dialog>
      )}
    </aside>
  )
}
