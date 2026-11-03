import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlayCircle, Trash2 } from 'lucide-react'
import { useQuizData } from '../lib/data'
import { useStore } from '../lib/store'
import { progressStore, sessionStore } from '../lib/progress'
import { aggregate, percent, plural } from '../lib/stats'
import { MODES, MODE_ORDER, abandonSession, categoryLabel } from '../lib/session'
import { CategoryCard } from '../components/CategoryCard'
import { ModeIcon, MODE_TONE } from '../components/ModeIcon'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Card, ProgressRing, SectionTitle, StatTile, cx } from '../components/ui'

export function HomePage() {
  const data = useQuizData()
  const progress = useStore(progressStore)
  const active = useStore(sessionStore)
  const nav = useNavigate()
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const all = data.categories.flatMap((c) => c.questions)
  const a = aggregate(all, progress)

  return (
    <div className="animate-in">
      <header className="pt-6 pb-5">
        <p className="text-sm font-medium text-ink-3">Тренажер тестів</p>
        <h1 className="text-[28px] leading-tight font-extrabold tracking-tight">ХімТренажер</h1>
      </header>

      {active && (
        <Card className="mb-4 flex items-center gap-3 border-accent/40 p-4">
          <div className={cx('grid size-11 shrink-0 place-items-center rounded-2xl', MODE_TONE[active.config.mode])}>
            <ModeIcon mode={active.config.mode} className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold">Незавершений тест</div>
            <div className="truncate text-sm text-ink-3">
              {MODES[active.config.mode].title} · {Object.keys(active.answers).length} з {active.questionIds.length}
            </div>
          </div>
          <button type="button" aria-label="Скасувати тест" onClick={() => setConfirmDiscard(true)} className="grid size-11 place-items-center rounded-xl text-ink-3 hover:bg-surface-2">
            <Trash2 className="size-5" />
          </button>
          <button type="button" onClick={() => nav('/quiz')} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-ink">
            <PlayCircle className="size-4" /> Далі
          </button>
        </Card>
      )}

      <Card className="p-4">
        <div className="flex items-center gap-4">
          <ProgressRing value={a.total ? a.seen / a.total : 0} size={92}>
            <div>
              <div className="text-xl font-extrabold tabular-nums">{percent(a.seen, a.total)}%</div>
              <div className="text-[10px] font-medium text-ink-3">пройдено</div>
            </div>
          </ProgressRing>
          <div className="min-w-0">
            <div className="text-2xl font-extrabold tabular-nums">{a.total}</div>
            <div className="text-sm text-ink-3">
              {plural(a.total, 'питання', 'питання', 'питань')} у {data.categories.length} {plural(data.categories.length, 'темі', 'темах', 'темах')}
            </div>
            <div className="mt-1 text-sm text-ink-2">
              Відповідали на <b className="tabular-nums">{a.seen}</b>
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <StatTile label="Правильних" value={a.correct} tone="ok" />
          <StatTile label="Помилок" value={a.wrong} tone="bad" />
          <StatTile label="Повторити" value={a.review} tone="warn" />
        </div>
      </Card>

      <SectionTitle>Режими</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {MODE_ORDER.map((m) => {
          const count = m === 'mistakes' ? a.review : null
          return (
            <button
              key={m}
              type="button"
              onClick={() => nav(`/setup/${m}`)}
              className="flex min-h-24 flex-col items-start justify-between rounded-card border border-line/60 bg-surface p-3.5 text-left shadow-card transition active:scale-[0.98]"
            >
              <div className="flex w-full items-start justify-between">
                <div className={cx('grid size-10 place-items-center rounded-xl', MODE_TONE[m])}>
                  <ModeIcon mode={m} className="size-5" />
                </div>
                {count !== null && count > 0 && <span className="rounded-full bg-bad px-2 text-xs leading-5 font-bold text-white tabular-nums">{count}</span>}
              </div>
              <div className="mt-3">
                <div className="text-[15px] leading-tight font-bold">{MODES[m].title}</div>
                <div className="mt-0.5 text-xs text-ink-3">{MODES[m].short}</div>
              </div>
            </button>
          )
        })}
      </div>

      <SectionTitle>Теми</SectionTitle>
      <div className="flex flex-col gap-3">
        {data.categories.map((c, i) => (
          <CategoryCard key={c.id} category={c} progress={progress} index={i} />
        ))}
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        title="Скасувати незавершений тест?"
        text={
          active ? (
            <>
              {MODES[active.config.mode].title}, {categoryLabel(active.config.categoryIds, data)}. Відповіді, які вже перевірені, залишаться в статистиці.
            </>
          ) : null
        }
        confirmLabel="Скасувати тест"
        cancelLabel="Залишити"
        danger
        onConfirm={() => {
          abandonSession()
          setConfirmDiscard(false)
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </div>
  )
}
