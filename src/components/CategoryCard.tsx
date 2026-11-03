import { ChevronRight, FlaskConical, Play } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Category, ProgressData } from '../lib/types'
import { aggregate, percent, questionsWord } from '../lib/stats'
import { splitTitle } from '../lib/titles'
import { Card, ProgressBar } from './ui'

export function CategoryCard({ category, progress, index }: { category: Category; progress: ProgressData; index: number }) {
  const nav = useNavigate()
  const a = aggregate(category.questions, progress)
  const { main, subject } = splitTitle(category.title)
  const hues = ['#5b5bd6', '#138a7a', '#d9622b', '#2f6fd6', '#9146c9']
  const hue = hues[index % hues.length]

  return (
    <Card className="p-4 animate-in">
      <button type="button" onClick={() => nav(`/category/${category.id}`)} className="flex w-full items-start gap-3 text-left">
        <div className="grid size-12 shrink-0 place-items-center rounded-2xl" style={{ background: `${hue}1a`, color: hue }}>
          <FlaskConical className="size-6" />
        </div>
        <div className="min-w-0 flex-1">
          {subject && <div className="text-xs font-medium text-ink-3">{subject}</div>}
          <h3 className="text-[17px] leading-snug font-bold">{main}</h3>
          <div className="mt-0.5 text-sm text-ink-3">{questionsWord(category.count)}</div>
        </div>
        <ChevronRight className="mt-3 size-5 shrink-0 text-ink-3" />
      </button>

      <div className="mt-4">
        <div className="mb-1.5 flex justify-between text-xs font-medium text-ink-3">
          <span>Пройдено {a.seen} з {a.total}</span>
          <span className="tabular-nums">{percent(a.seen, a.total)}%</span>
        </div>
        <ProgressBar value={a.total ? a.seen / a.total : 0} />
      </div>

      <div className="mt-4 flex items-center gap-2">
        <div className="flex flex-1 flex-wrap gap-x-4 gap-y-1 text-sm">
          <span className="text-ink-2">
            Точність <b className="tabular-nums">{a.attempts ? `${percent(a.correct, a.attempts)}%` : '—'}</b>
          </span>
          <span className={a.review ? 'text-bad' : 'text-ink-3'}>
            Помилок <b className="tabular-nums">{a.review}</b>
          </span>
        </div>
        <button
          type="button"
          onClick={() => nav(`/setup/learn?cat=${category.id}`)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-ink transition active:scale-[0.97]"
        >
          <Play className="size-4 fill-current" /> Почати
        </button>
      </div>
    </Card>
  )
}
