import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, Target } from 'lucide-react'
import { useQuizData } from '../lib/data'
import { useStore } from '../lib/store'
import { progressStore } from '../lib/progress'
import { MODES, MODE_ORDER } from '../lib/session'
import { aggregate, percent, questionsWord } from '../lib/stats'
import { splitTitle } from '../lib/titles'
import { ModeIcon, MODE_TONE } from '../components/ModeIcon'
import { Card, PageHeader, ProgressRing, SectionTitle, StatTile, cx } from '../components/ui'

export function CategoryPage() {
  const { id } = useParams()
  const data = useQuizData()
  const progress = useStore(progressStore)
  const nav = useNavigate()
  const category = data.categories.find((c) => c.id === id)
  if (!category) return <Navigate to="/" replace />

  const a = aggregate(category.questions, progress)
  const { main, subject } = splitTitle(category.title)

  return (
    <div className="animate-in">
      <PageHeader title={main} subtitle={[subject, category.description].filter(Boolean).join(' · ')} back="/" />

      <Card className="p-4">
        <div className="flex items-center gap-4">
          <ProgressRing value={a.total ? a.seen / a.total : 0}>
            <div className="text-lg font-extrabold tabular-nums">{percent(a.seen, a.total)}%</div>
          </ProgressRing>
          <div>
            <div className="text-lg font-bold">{questionsWord(a.total)}</div>
            <div className="text-sm text-ink-3">
              пройдено {a.seen}, засвоєно {a.mastered}
            </div>
            <div className="mt-1 text-sm text-ink-2">
              Точність: <b>{a.attempts ? `${percent(a.correct, a.attempts)}%` : '—'}</b>
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <StatTile label="Правильних" value={a.correct} tone="ok" />
          <StatTile label="Помилок" value={a.wrong} tone="bad" />
          <StatTile label="Повторити" value={a.review} tone="warn" />
        </div>
      </Card>

      <SectionTitle>Оберіть режим</SectionTitle>
      <div className="flex flex-col gap-2">
        {MODE_ORDER.map((m) => {
          const badge = m === 'mistakes' ? a.review : m === 'weak' ? category.questions.filter((q) => (progress.questions[q.id]?.wrong ?? 0) > 0).length : null
          return (
            <Card key={m} onClick={() => nav(`/setup/${m}?cat=${category.id}`)} className="flex items-center gap-3 p-3.5">
              <div className={cx('grid size-11 shrink-0 place-items-center rounded-2xl', MODE_TONE[m])}>
                <ModeIcon mode={m} className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold">{MODES[m].title}</div>
                <div className="truncate text-sm text-ink-3">{MODES[m].short}</div>
              </div>
              {badge !== null && (
                <span className={cx('rounded-full px-2.5 text-xs leading-6 font-bold tabular-nums', badge ? 'bg-bad-soft text-bad' : 'bg-surface-2 text-ink-3')}>
                  {m === 'weak' ? <Target className="mr-1 inline size-3" /> : null}
                  {badge}
                </span>
              )}
              <ChevronRight className="size-5 shrink-0 text-ink-3" />
            </Card>
          )
        })}
      </div>
    </div>
  )
}
