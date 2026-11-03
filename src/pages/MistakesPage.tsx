import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, ChevronDown, PartyPopper, Play, RotateCcw } from 'lucide-react'
import { useQuizData } from '../lib/data'
import { useStore } from '../lib/store'
import { REVIEW_STREAK, progressStore } from '../lib/progress'
import { startSession } from '../lib/session'
import { aggregate, formatDate, questionsWord } from '../lib/stats'
import { splitTitle } from '../lib/titles'
import type { Question } from '../lib/types'
import { OptionList } from '../components/OptionList'
import { Button, Card, EmptyState, PageHeader, Rich, SectionTitle, StatTile, cx } from '../components/ui'

type Filter = 'review' | 'repaired'

export function MistakesPage() {
  const data = useQuizData()
  const progress = useStore(progressStore)
  const nav = useNavigate()
  const [filter, setFilter] = useState<Filter>('review')
  const [open, setOpen] = useState<string | null>(null)

  const all = data.categories.flatMap((c) => c.questions)
  const a = aggregate(all, progress)

  const start = (categoryIds: string[]) => {
    if (startSession({ mode: 'mistakes', categoryIds, limit: null }, data)) nav('/quiz')
  }

  const list: Question[] = all
    .filter((q) => {
      const s = progress.questions[q.id]
      if (!s || s.wrong === 0) return false
      return filter === 'review' ? s.inReview : !s.inReview
    })
    .sort((x, y) => {
      const sx = progress.questions[x.id]!
      const sy = progress.questions[y.id]!
      return sy.wrong - sx.wrong || (sy.lastWrong ?? 0) - (sx.lastWrong ?? 0)
    })

  if (a.review === 0 && a.repaired === 0) {
    return (
      <div>
        <PageHeader title="Помилки" />
        <EmptyState
          icon={<PartyPopper className="size-7" />}
          title="Помилок поки немає"
          text="Питання, на які ви відповісте неправильно, автоматично потраплять сюди для повторення."
          action={<Button onClick={() => nav('/setup/learn')}>Почати навчання</Button>}
        />
      </div>
    )
  }

  return (
    <div className="animate-in">
      <PageHeader title="Помилки" subtitle={`Питання виходить зі списку після ${REVIEW_STREAK} правильних відповідей поспіль. Історія зберігається.`} />

      <div className="grid grid-cols-2 gap-2">
        <StatTile label="На повторенні" value={a.review} tone="bad" icon={<RotateCcw className="size-3.5" />} />
        <StatTile label="Успішно повторено" value={a.repaired} tone="ok" icon={<CheckCircle2 className="size-3.5" />} />
      </div>

      {a.review > 0 && (
        <Button block className="mt-4 min-h-14 text-base" onClick={() => start([])} icon={<Play className="size-5 fill-current" />}>
          Повторити всі помилки · {a.review}
        </Button>
      )}

      <SectionTitle>За темами</SectionTitle>
      <div className="flex flex-col gap-2">
        {data.categories.map((c) => {
          const ca = aggregate(c.questions, progress)
          return (
            <Card key={c.id} className="flex items-center gap-3 p-3.5 pl-4">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{splitTitle(c.title).main}</div>
                <div className="text-sm text-ink-3">
                  <span className={ca.review ? 'text-bad' : ''}>{ca.review} на повторенні</span> · {ca.repaired} повторено
                </div>
              </div>
              <Button variant={ca.review ? 'primary' : 'secondary'} disabled={!ca.review} onClick={() => start([c.id])} className="min-h-11 px-4 text-sm">
                Повторити
              </Button>
            </Card>
          )
        })}
      </div>

      <SectionTitle>Питання</SectionTitle>
      <div className="mb-3 flex rounded-2xl bg-surface-2 p-1">
        {(
          [
            ['review', `На повторенні (${a.review})`],
            ['repaired', `Повторені (${a.repaired})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={cx('min-h-11 flex-1 rounded-xl text-sm font-semibold transition', filter === id ? 'bg-surface text-ink shadow-card' : 'text-ink-3')}
          >
            {label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-3">{filter === 'review' ? 'Усі помилки виправлено 🎉' : 'Ще немає успішно повторених питань'}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((q) => {
            const s = progress.questions[q.id]!
            const isOpen = open === q.id
            return (
              <Card key={q.id} className="overflow-hidden">
                <button type="button" onClick={() => setOpen(isOpen ? null : q.id)} className="flex w-full items-start gap-3 p-4 text-left" aria-expanded={isOpen}>
                  <div className="min-w-0 flex-1">
                    <Rich as="p" html={q.text} className={cx('text-[15px] leading-snug font-medium', !isOpen && 'line-clamp-2')} />
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-3">
                      <span className="font-semibold text-bad">помилок: {s.wrong}</span>
                      <span>спроб: {s.attempts}</span>
                      {s.lastWrong && <span>остання помилка: {formatDate(s.lastWrong)}</span>}
                      {s.inReview && s.streak > 0 && <span className="text-ok">поспіль правильно: {s.streak}/{REVIEW_STREAK}</span>}
                    </div>
                  </div>
                  <ChevronDown className={cx('mt-0.5 size-5 shrink-0 text-ink-3 transition', isOpen && 'rotate-180')} />
                </button>
                {isOpen && (
                  <div className="border-t border-line/70 p-4 pt-3 animate-in">
                    <OptionList question={q} selected={[]} revealed />
                    <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Історія відповідей">
                      {s.history.slice(-20).map((h, i) => (
                        <span key={i} title={formatDate(h.t)} className={cx('size-3 rounded-full', h.ok ? 'bg-ok' : 'bg-bad')} />
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
          <p className="pt-2 text-center text-xs text-ink-3">{questionsWord(list.length)}</p>
        </div>
      )}
    </div>
  )
}
