import { Navigate, useNavigate } from 'react-router-dom'
import { CheckCircle2, CircleDashed, Clock, Home, RefreshCw, RotateCcw, Trophy, XCircle } from 'lucide-react'
import { useQuizData } from '../lib/data'
import { useStore } from '../lib/store'
import { lastResultStore } from '../lib/progress'
import { MODES, categoryLabel, computeResult, startSession } from '../lib/session'
import { formatDuration, percent } from '../lib/stats'
import { OptionList } from '../components/OptionList'
import { Button, Card, ProgressRing, Rich, SectionTitle, StatTile } from '../components/ui'

export function ResultsPage() {
  const result = useStore(lastResultStore)
  const data = useQuizData()
  const nav = useNavigate()
  if (!result) return <Navigate to="/" replace />

  const r = computeResult(result, data)
  const pct = percent(r.correct, r.total)
  const pctAnswered = percent(r.correct, r.answered)
  const info = MODES[result.config.mode]
  const tone = pct >= 80 ? 'ok' : pct >= 50 ? 'accent' : 'bad'
  const message =
    r.answered === 0 ? 'Жодної відповіді' : pct >= 90 ? 'Відмінно!' : pct >= 75 ? 'Добрий результат' : pct >= 50 ? 'Непогано, є над чим попрацювати' : 'Варто повторити матеріал'

  const unansweredIds = result.questionIds.filter((id) =>
    info.instant ? !result.checked[id] : !result.answers[id]?.length,
  )

  const retry = () => {
    if (startSession({ ...result.config, fixedIds: result.config.fixedIds }, data)) nav('/quiz', { replace: true })
  }
  const reviewMistakes = () => {
    if (startSession({ mode: 'mistakes', categoryIds: result.config.categoryIds, limit: null, fixedIds: r.wrongIds }, data)) nav('/quiz', { replace: true })
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-12 sm:px-6 animate-in">
      <header className="pt-6 pb-4 text-center">
        <p className="text-sm font-medium text-ink-3">
          {info.title} · {categoryLabel(result.config.categoryIds, data)}
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{message}</h1>
      </header>

      <Card className="p-5">
        <div className="flex flex-col items-center">
          <ProgressRing value={r.total ? r.correct / r.total : 0} size={148} stroke={13} tone={tone}>
            <div>
              <div className="text-4xl font-extrabold tabular-nums">{pct}%</div>
              <div className="text-xs font-medium text-ink-3">
                {r.correct} з {r.total}
              </div>
            </div>
          </ProgressRing>
          {r.unanswered > 0 && r.answered > 0 && (
            <p className="mt-3 text-sm text-ink-3">
              Серед відповідей: <b className="text-ink">{pctAnswered}%</b> правильних
            </p>
          )}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Правильно" value={r.correct} tone="ok" icon={<CheckCircle2 className="size-3.5" />} />
          <StatTile label="Помилки" value={r.wrong} tone="bad" icon={<XCircle className="size-3.5" />} />
          <StatTile label="Без відповіді" value={r.unanswered} icon={<CircleDashed className="size-3.5" />} />
          <StatTile label="Час" value={formatDuration(r.durationMs)} icon={<Clock className="size-3.5" />} />
        </div>
      </Card>

      <div className="mt-4 flex flex-col gap-2">
        {r.wrongIds.length > 0 && (
          <Button block onClick={reviewMistakes} icon={<RotateCcw className="size-5" />}>
            Повторити помилки ({r.wrongIds.length})
          </Button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={retry} icon={<RefreshCw className="size-5" />}>
            Ще раз
          </Button>
          <Button variant="secondary" onClick={() => nav('/', { replace: true })} icon={<Home className="size-5" />}>
            На головну
          </Button>
        </div>
      </div>

      {r.wrongIds.length > 0 ? (
        <>
          <SectionTitle>Помилки та правильні відповіді</SectionTitle>
          <div className="flex flex-col gap-3">
            {r.wrongIds.map((id, i) => {
              const q = data.byId.get(id)!
              return (
                <Card key={id} className="p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-ink-3">
                    <span className="grid size-6 place-items-center rounded-full bg-bad-soft text-bad">{i + 1}</span>
                    <span>№ {q.number}</span>
                  </div>
                  <Rich as="p" html={q.text} className="mb-3 text-[16px] leading-relaxed font-semibold" />
                  <OptionList question={q} selected={result.answers[id] ?? []} revealed />
                </Card>
              )
            })}
          </div>
        </>
      ) : (
        r.answered > 0 && (
          <Card className="mt-6 flex items-center gap-3 p-4">
            <Trophy className="size-6 shrink-0 text-ok" />
            <p className="text-[15px] text-ink-2">Жодної помилки — так тримати!</p>
          </Card>
        )
      )}

      {unansweredIds.length > 0 && !info.instant && (
        <>
          <SectionTitle>Без відповіді ({unansweredIds.length})</SectionTitle>
          <div className="flex flex-col gap-3">
            {unansweredIds.map((id) => {
              const q = data.byId.get(id)
              if (!q) return null
              return (
                <Card key={id} className="p-4">
                  <div className="mb-2 text-xs font-semibold text-ink-3">№ {q.number}</div>
                  <Rich as="p" html={q.text} className="mb-3 text-[16px] leading-relaxed font-semibold" />
                  <OptionList question={q} selected={[]} revealed />
                </Card>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
