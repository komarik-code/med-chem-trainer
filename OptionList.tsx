import { Check, X } from 'lucide-react'
import type { Question } from '../lib/types'
import { Rich, cx } from './ui'

export type OptionState = 'idle' | 'selected' | 'correct' | 'wrong' | 'missed' | 'dim'

export function optionState(q: Question, letter: string, selected: string[], revealed: boolean): OptionState {
  const isSel = selected.includes(letter)
  if (!revealed) return isSel ? 'selected' : 'idle'
  const isCorrect = q.correct.includes(letter)
  if (isCorrect && isSel) return 'correct'
  if (isCorrect) return 'missed' // правильний, але не вибраний
  if (isSel) return 'wrong'
  return 'dim'
}

const STYLES: Record<OptionState, { box: string; badge: string }> = {
  idle: { box: 'border-line bg-surface hover:border-ink-3/60', badge: 'bg-surface-2 text-ink-2' },
  selected: { box: 'border-accent bg-accent-soft ring-1 ring-accent', badge: 'bg-accent text-accent-ink' },
  correct: { box: 'border-ok bg-ok-soft ring-1 ring-ok animate-pop', badge: 'bg-ok text-white' },
  missed: { box: 'border-ok bg-ok-soft/70 border-dashed', badge: 'bg-ok text-white' },
  wrong: { box: 'border-bad bg-bad-soft ring-1 ring-bad animate-shake', badge: 'bg-bad text-white' },
  dim: { box: 'border-line bg-surface opacity-60', badge: 'bg-surface-2 text-ink-3' },
}

export function OptionList({
  question,
  selected,
  revealed,
  disabled,
  onSelect,
}: {
  question: Question
  selected: string[]
  revealed: boolean
  disabled?: boolean
  onSelect?: (letter: string) => void
}) {
  return (
    <ul className="flex flex-col gap-2.5" role={question.multiple ? 'group' : 'radiogroup'}>
      {question.options.map((o) => {
        const st = optionState(question, o.id, selected, revealed)
        const s = STYLES[st]
        const icon =
          st === 'correct' || st === 'missed' ? <Check className="size-4" strokeWidth={3} /> : st === 'wrong' ? <X className="size-4" strokeWidth={3} /> : o.id
        return (
          <li key={o.id}>
            <button
              type="button"
              role={question.multiple ? 'checkbox' : 'radio'}
              aria-checked={selected.includes(o.id)}
              disabled={disabled || revealed}
              onClick={() => onSelect?.(o.id)}
              className={cx(
                'flex min-h-14 w-full items-start gap-3 rounded-2xl border-2 px-3.5 py-3 text-left text-[16px] leading-snug transition-colors duration-150',
                'disabled:cursor-default enabled:active:scale-[0.99]',
                s.box,
              )}
            >
              <span
                className={cx(
                  'mt-px grid size-7 shrink-0 place-items-center text-[13px] font-bold transition-colors',
                  question.multiple ? 'rounded-lg' : 'rounded-full',
                  s.badge,
                )}
              >
                {icon}
              </span>
              <Rich html={o.html} className="min-w-0 flex-1 pt-0.5" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
