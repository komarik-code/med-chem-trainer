import type { ComponentProps, ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

/** Текст з бази. Дані генеруються нашим конвертером (екранований текст + sub/sup/img). */
export function Rich({ html, className, as: Tag = 'span' }: { html: string; className?: string; as?: 'span' | 'div' | 'p' }) {
  return <Tag className={cx('rich', className)} dangerouslySetInnerHTML={{ __html: html }} />
}

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  const cls = cx('bg-surface rounded-card shadow-card border border-line/60', className)
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cx(cls, 'w-full text-left transition active:scale-[0.99] hover:border-line')}>
        {children}
      </button>
    )
  return <div className={cls}>{children}</div>
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({
  variant = 'primary',
  className,
  children,
  icon,
  block,
  ...rest
}: ComponentProps<'button'> & { variant?: BtnVariant; icon?: ReactNode; block?: boolean }) {
  const styles: Record<BtnVariant, string> = {
    primary: 'bg-accent text-accent-ink shadow-sm hover:brightness-105',
    secondary: 'bg-surface-2 text-ink hover:bg-line/70',
    ghost: 'bg-transparent text-ink-2 hover:bg-surface-2',
    danger: 'bg-bad text-white hover:brightness-105',
  }
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-[15px] font-semibold transition',
        'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        styles[variant],
        block && 'w-full',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  )
}

export function ProgressBar({ value, className, tone = 'accent' }: { value: number; className?: string; tone?: 'accent' | 'ok' | 'bad' | 'warn' }) {
  const color = { accent: 'bg-accent', ok: 'bg-ok', bad: 'bg-bad', warn: 'bg-warn' }[tone]
  return (
    <div className={cx('h-2 overflow-hidden rounded-full bg-surface-2', className)} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full transition-[width] duration-500 ease-out', color)} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  )
}

export function ProgressRing({ value, size = 88, stroke = 9, children, tone = 'accent' }: { value: number; size?: number; stroke?: number; children?: ReactNode; tone?: 'accent' | 'ok' | 'bad' }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const color = { accent: 'var(--accent)', ok: 'var(--ok)', bad: 'var(--bad)' }[tone]
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, value)))}
          style={{ transition: 'stroke-dashoffset 0.7s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  )
}

export function StatTile({ label, value, tone, icon }: { label: string; value: ReactNode; tone?: 'ok' | 'bad' | 'warn' | 'accent'; icon?: ReactNode }) {
  const color = tone ? { ok: 'text-ok', bad: 'text-bad', warn: 'text-warn', accent: 'text-accent' }[tone] : 'text-ink'
  return (
    <div className="rounded-2xl bg-surface-2/70 px-3 py-3">
      <div className="flex items-start gap-1.5 text-xs leading-tight font-medium text-ink-3">
        {icon && <span className="mt-px shrink-0">{icon}</span>}
        <span className="min-w-0 truncate">{label}</span>
      </div>
      <div className={cx('mt-1 text-xl font-bold tabular-nums', color)}>{value}</div>
    </div>
  )
}

export function PageHeader({ title, subtitle, back, right }: { title: string; subtitle?: string; back?: boolean | string; right?: ReactNode }) {
  const nav = useNavigate()
  return (
    <header className="flex items-start gap-2 pt-4 pb-4">
      {back && (
        <button
          type="button"
          aria-label="Назад"
          onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))}
          className="-ml-2 grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-surface-2"
        >
          <ChevronLeft className="size-6" />
        </button>
      )}
      <div className="min-w-0 flex-1 pt-1.5">
        <h1 className="text-[22px] leading-tight font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-3">{subtitle}</p>}
      </div>
      {right}
    </header>
  )
}

export function Chip({ active, children, onClick }: { active?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'min-h-11 rounded-full border px-4 text-sm font-semibold transition active:scale-[0.97]',
        active ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-ink-2 hover:border-ink-3',
      )}
    >
      {children}
    </button>
  )
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mt-7 mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[13px] font-semibold tracking-wide text-ink-3 uppercase">{children}</h2>
      {right}
    </div>
  )
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center animate-in">
      <div className="mb-4 grid size-16 place-items-center rounded-3xl bg-accent-soft text-accent">{icon}</div>
      <h3 className="text-lg font-bold">{title}</h3>
      {text && <p className="mt-1.5 max-w-xs text-sm text-ink-3">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
