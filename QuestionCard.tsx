import { CheckCircle2, Info, XCircle } from 'lucide-react'
import type { Question, QuestionStat } from '../lib/types'
import { splitTitle } from '../lib/titles'
import { Rich, cx } from './ui'

export function QuestionCard({
  question,
  categoryTitle,
  stat,
  children,
}: {
  question: Question
  categoryTitle?: string
  stat?: QuestionStat
  children?: React.ReactNode
}) {
  return (
    <div className="animate-in" key={question.id}>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-medium text-ink-3">
        {categoryTitle && <span className="rounded-full bg-surface-2 px-2.5 py-1">{splitTitle(categoryTitle).main}</span>}
        <span>№ {question.number}</span>
        {stat && stat.wrong > 0 && (
          <span className="rounded-full bg-bad-soft px-2.5 py-1 text-bad">
            помилок раніше: {stat.wrong}
          </span>
        )}
      </div>
      <Rich as="p" html={question.text} className="text-[18px] leading-relaxed font-semibold sm:text-[19px]" />
      {question.multiple && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-warn-soft px-2.5 py-1 text-[13px] font-semibold text-warn">
          <Info className="size-4" /> Декілька правильних відповідей
        </p>
      )}
      <div className="mt-5">{children}</div>
    </div>
  )
}

export function Verdict({ ok, question }: { ok: boolean; question: Question }) {
  const correctOpts = question.options.filter((o) => question.correct.includes(o.id))
  return (
    <div
      className={cx(
        'mt-4 rounded-2xl p-4 animate-in',
        ok ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad',
      )}
      role="status"
    >
      <div className="flex items-center gap-2 font-bold">
        {ok ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />}
        {ok ? 'Правильно!' : 'Неправильно'}
      </div>
      {!ok && (
        <div className="mt-2 text-[15px] text-ink">
          <span className="text-ink-2">Правильна відповідь: </span>
          {correctOpts.map((o, i) => (
            <span key={o.id}>
              {i > 0 && '; '}
              <b>{o.id}.</b> <Rich html={o.html} />
            </span>
          ))}
        </div>
      )}
      {question.explanation && (
        <div className="mt-3 border-t border-current/15 pt-3 text-[15px] text-ink">
          <div className="mb-1 text-xs font-semibold tracking-wide text-ink-3 uppercase">Пояснення</div>
          <Rich html={question.explanation} />
        </div>
      )}
    </div>
  )
}
