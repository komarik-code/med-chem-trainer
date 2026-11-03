import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Clock, Flag, X } from 'lucide-react'
import { useQuizData } from '../lib/data'
import { useStore } from '../lib/store'
import { lastResultStore, progressStore, sessionStore } from '../lib/progress'
import { MODES, finishSession, goTo, isCorrect, setExamAnswer, submitInstant } from '../lib/session'
import { formatDuration } from '../lib/stats'
import type { ActiveSession, Question } from '../lib/types'
import { OptionList } from '../components/OptionList'
import { QuestionCard, Verdict } from '../components/QuestionCard'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Button, ProgressBar, cx } from '../components/ui'

function Timer({ since }: { since: number }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      <Clock className="size-3.5" />
      {formatDuration(Date.now() - since)}
    </span>
  )
}

export function QuizPage() {
  const session = useStore(sessionStore)
  const last = useStore(lastResultStore)
  const data = useQuizData()
  const shownId = useRef<string | null>(null)
  if (session) shownId.current = session.id
  if (!session) {
    // сесію щойно завершено на цьому екрані → до результатів, інакше на головну
    const justFinished = shownId.current !== null && last?.id === shownId.current
    return <Navigate to={justFinished ? '/results' : '/'} replace />
  }
  const q = data.byId.get(session.questionIds[session.index])
  if (!q) {
    // питання зникло з бази (наприклад, база оновилась) — пропускаємо
    return <MissingQuestion session={session} />
  }
  return <QuizView key={session.id} session={session} question={q} />
}

function MissingQuestion({ session }: { session: ActiveSession }) {
  const data = useQuizData()
  useEffect(() => {
    const ids = session.questionIds.filter((id) => data.byId.has(id))
    sessionStore.set(ids.length ? { ...session, questionIds: ids, index: Math.min(session.index, ids.length - 1) } : null)
  }, [session, data])
  return null
}

function QuizView({ session, question: q }: { session: ActiveSession; question: Question }) {
  const data = useQuizData()
  const progress = useStore(progressStore)
  const nav = useNavigate()
  const info = MODES[session.config.mode]
  const instant = info.instant
  const total = session.questionIds.length
  const isLast = session.index === total - 1
  const checked = Boolean(session.checked[q.id])

  // тимчасовий вибір для питань з кількома відповідями в миттєвих режимах
  const [pending, setPending] = useState<string[]>([])
  useEffect(() => setPending([]), [q.id])

  const [confirmFinish, setConfirmFinish] = useState(false)
  const topRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [q.id])

  const selected = instant ? (checked ? (session.answers[q.id] ?? []) : pending) : (session.answers[q.id] ?? [])
  const revealed = instant && checked
  const done = instant ? Object.keys(session.checked).length : Object.keys(session.answers).length
  const unanswered = total - done

  const finish = useCallback(() => {
    finishSession(data)
    nav('/results', { replace: true })
  }, [data, nav])

  const next = useCallback(() => {
    if (isLast) {
      if (!instant && unanswered > 0) setConfirmFinish(true)
      else finish()
    } else goTo(session.index + 1)
  }, [isLast, instant, unanswered, finish, session.index])

  const onSelect = useCallback(
    (letter: string) => {
      if (instant) {
        if (checked) return
        if (q.multiple) setPending((p) => (p.includes(letter) ? p.filter((x) => x !== letter) : [...p, letter]))
        else submitInstant(q, [letter])
      } else {
        const cur = session.answers[q.id] ?? []
        if (q.multiple) setExamAnswer(q.id, cur.includes(letter) ? cur.filter((x) => x !== letter) : [...cur, letter])
        else setExamAnswer(q.id, cur[0] === letter ? [] : [letter])
      }
    },
    [instant, checked, q, session.answers],
  )

  const confirmMulti = useCallback(() => {
    if (pending.length) submitInstant(q, pending)
  }, [pending, q])

  // клавіатура: A–E / 1–5 — вибір, Enter — підтвердити / далі, ←/→ — навігація
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirmFinish || e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toUpperCase()
      const byNum = /^[1-9]$/.test(k) ? q.options[Number(k) - 1]?.id : undefined
      const byLetter = q.options.find((o) => o.id === k)?.id
      const letter = byNum ?? byLetter
      if (letter) {
        e.preventDefault()
        onSelect(letter)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (instant && !checked) {
          if (q.multiple) confirmMulti()
        } else next()
      } else if (e.key === 'ArrowLeft' && session.index > 0) goTo(session.index - 1)
      else if (e.key === 'ArrowRight' && (!instant || checked)) next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [q, onSelect, instant, checked, confirmMulti, next, session.index, confirmFinish])

  const category = data.categories.find((c) => c.id === q.categoryId)

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col" ref={topRef}>
      {/* верхня панель */}
      <div className="sticky top-0 z-20 bg-bg/90 px-4 pt-3 pb-3 backdrop-blur-lg sm:px-6">
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Вийти (прогрес збережеться)" onClick={() => nav('/')} className="-ml-2 grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-surface-2">
            <X className="size-6" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-center justify-between gap-2 text-xs font-semibold text-ink-3">
              <span className="truncate">{info.title}</span>
              <span className="flex shrink-0 items-center gap-3">
                <Timer since={session.startedAt} />
                <span className="tabular-nums text-ink">
                  {session.index + 1} / {total}
                </span>
              </span>
            </div>
            <ProgressBar value={done / total} />
          </div>
          <button
            type="button"
            aria-label="Завершити тест"
            onClick={() => setConfirmFinish(true)}
            className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-surface-2"
          >
            <Flag className="size-5" />
          </button>
        </div>
        {!instant && <ExamStrip session={session} />}
      </div>

      {/* питання */}
      <div className="flex-1 px-4 pt-2 pb-36 sm:px-6">
        <QuestionCard key={q.id} question={q} categoryTitle={data.categories.length > 1 ? category?.title : undefined} stat={progress.questions[q.id]}>
          <OptionList question={q} selected={selected} revealed={revealed} onSelect={onSelect} />
          {revealed && <Verdict ok={isCorrect(q, selected)} question={q} />}
          {instant && !checked && !q.multiple && <p className="mt-4 text-center text-sm text-ink-3">Торкніться варіанта, щоб відповісти</p>}
        </QuestionCard>
      </div>

      {/* нижня панель дій */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line/70 bg-surface/90 backdrop-blur-lg pb-safe">
        <div className="mx-auto flex max-w-2xl gap-2 px-4 py-3 sm:px-6">
          <Button variant="secondary" aria-label="Попереднє питання" disabled={session.index === 0} onClick={() => goTo(session.index - 1)} className="w-14 shrink-0 px-0">
            <ArrowLeft className="size-5" />
          </Button>
          {instant && !checked && q.multiple ? (
            <Button block disabled={!pending.length} onClick={confirmMulti} icon={<Check className="size-5" />}>
              Підтвердити{pending.length ? ` (${pending.length})` : ''}
            </Button>
          ) : instant && !checked ? (
            <Button block variant="secondary" disabled>
              Оберіть відповідь
            </Button>
          ) : (
            <Button block onClick={next}>
              {isLast ? 'Завершити' : instant ? 'Далі' : selected.length ? 'Далі' : 'Пропустити'}
              {!isLast && <ArrowRight className="size-5" />}
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmFinish}
        title="Завершити тест?"
        text={
          unanswered > 0
            ? `Без відповіді: ${unanswered}. ${instant ? 'Вони не враховуються в результаті.' : 'Вони будуть зараховані як невиконані.'}`
            : 'Усі питання мають відповідь.'
        }
        confirmLabel="Завершити й переглянути результат"
        cancelLabel="Продовжити тест"
        onConfirm={() => {
          setConfirmFinish(false)
          finish()
        }}
        onCancel={() => setConfirmFinish(false)}
      />
    </div>
  )
}

/** Іспит: стрічка номерів для швидкого переходу між питаннями. */
function ExamStrip({ session }: { session: ActiveSession }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-i="${session.index}"]`)
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [session.index])
  return (
    <div ref={ref} className="no-scrollbar -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
      {session.questionIds.map((id, i) => {
        const answered = Boolean(session.answers[id]?.length)
        const current = i === session.index
        return (
          <button
            key={id}
            data-i={i}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Питання ${i + 1}${answered ? ', є відповідь' : ''}`}
            className={cx(
              'grid h-9 min-w-9 shrink-0 place-items-center rounded-xl px-1.5 text-xs font-bold tabular-nums transition',
              current ? 'bg-accent text-accent-ink' : answered ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-ink-3',
            )}
          >
            {i + 1}
          </button>
        )
      })}
    </div>
  )
}
