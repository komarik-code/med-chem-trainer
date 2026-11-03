import { NavLink, Outlet } from 'react-router-dom'
import { BarChart3, Home, RotateCcw } from 'lucide-react'
import { useStore } from '../lib/store'
import { progressStore } from '../lib/progress'
import { useQuizData } from '../lib/data'
import { cx } from './ui'

export function Layout() {
  const progress = useStore(progressStore)
  const data = useQuizData()
  let review = 0
  for (const id of data.byId.keys()) if (progress.questions[id]?.inReview) review++

  const tabs = [
    { to: '/', label: 'Головна', icon: Home, end: true },
    { to: '/mistakes', label: 'Помилки', icon: RotateCcw, badge: review },
    { to: '/progress', label: 'Прогрес', icon: BarChart3 },
  ]

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <main className="flex-1 px-4 pb-28 sm:px-6">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-surface/85 backdrop-blur-lg pb-safe">
        <div className="mx-auto flex max-w-2xl">
          {tabs.map(({ to, label, icon: Icon, end, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx('relative flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition', isActive ? 'text-accent' : 'text-ink-3 hover:text-ink-2')
              }
            >
              <span className="relative">
                <Icon className="size-6" strokeWidth={2.1} />
                {!!badge && (
                  <span className="absolute -top-1.5 -right-3 min-w-5 rounded-full bg-bad px-1.5 text-center text-[10px] leading-5 font-bold text-white tabular-nums">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </span>
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
