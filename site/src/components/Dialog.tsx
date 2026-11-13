import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  /** Широкое окно: карточка задания, управление командой. */
  wide?: boolean
  /** Откуда окно «вырастает»: прямоугольник карточки на экране. */
  from?: DOMRect | null
  /** Меняется, когда в том же окне открывают другое содержимое: тогда оно прокручивается наверх. */
  resetKey?: string | number
  className?: string
  footer?: ReactNode
}

/** Модальное окно. Закрывается крестиком, щелчком мимо и клавишей Esc. */
export default function Dialog({ title, onClose, children, wide, from, resetKey, className = '', footer }: Props) {
  const overlay = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const origin = useRef(from)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Если окон несколько, Esc закрывает только верхнее.
      const all = document.querySelectorAll('.overlay')
      if (all[all.length - 1] === overlay.current) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Увеличение из карточки: окно стартует с её места и размера и раскрывается до своего.
  useLayoutEffect(() => {
    const el = box.current
    const start = origin.current
    if (!el || !el.animate) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (!start) {
      el.animate([{ opacity: 0, transform: 'translateY(8px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 140, easing: 'ease-out' })
      return
    }
    const end = el.getBoundingClientRect()
    const from = `translate(${start.left - end.left}px, ${start.top - end.top}px) scale(${start.width / end.width}, ${start.height / end.height})`
    el.animate([{ transform: from, opacity: 0.35 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,.85,.25,1)' })
  }, [])

  useEffect(() => {
    body.current?.scrollTo({ top: 0 })
  }, [resetKey])

  useEffect(() => {
    box.current?.focus()
  }, [])

  return createPortal(
    <div className="overlay" ref={overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog ${wide ? 'wide' : ''} ${className}`} role="dialog" aria-modal tabIndex={-1} ref={box}>
        <div className="dialog-head">
          <div className="dialog-title">{title}</div>
          <button className="icon" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <div className="dialog-body" ref={body}>
          {children}
        </div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
