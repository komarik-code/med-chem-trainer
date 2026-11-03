import type { ProgressData, Question, QuestionStat } from './types'

export interface Aggregate {
  total: number
  /** питань, на які відповідали хоча б раз */
  seen: number
  /** питань, остання відповідь на які правильна */
  mastered: number
  attempts: number
  correct: number
  wrong: number
  /** у списку повторення */
  review: number
  /** успішно повторених (були помилки, зараз виправлено) */
  repaired: number
  accuracy: number
}

export function aggregate(questions: Question[], progress: ProgressData): Aggregate {
  const a: Aggregate = { total: questions.length, seen: 0, mastered: 0, attempts: 0, correct: 0, wrong: 0, review: 0, repaired: 0, accuracy: 0 }
  for (const q of questions) {
    const s = progress.questions[q.id]
    if (!s || s.attempts === 0) continue
    a.seen++
    a.attempts += s.attempts
    a.correct += s.correct
    a.wrong += s.wrong
    if (s.history.at(-1)?.ok) a.mastered++
    if (s.inReview) a.review++
    else if (s.wrong > 0) a.repaired++
  }
  a.accuracy = a.attempts ? a.correct / a.attempts : 0
  return a
}

const DAY = 86_400_000

/**
 * Пріоритет для режиму «Слабкі місця».
 * Більше помилок, вища частка помилок і свіжіша помилка → вищий бал.
 */
export function weaknessScore(s: QuestionStat | undefined, now = Date.now()): number {
  if (!s || s.wrong === 0) return 0
  const errorRate = s.wrong / Math.max(1, s.attempts)
  const volume = Math.log2(s.wrong + 1)
  const days = s.lastWrong ? (now - s.lastWrong) / DAY : 30
  const recency = 1 + 1 / (1 + days / 3) // 2.0 щойно → ~1.1 через місяць
  const reviewBoost = s.inReview ? 1.25 : 1
  return errorRate * volume * recency * reviewBoost
}

export function percent(n: number, d: number): number {
  return d ? Math.round((n / d) * 100) : 0
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (x: number) => String(x).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function formatDate(t: number): string {
  return new Date(t).toLocaleString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** «1 питання», «2 питання», «5 питань» */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

export const questionsWord = (n: number) => `${n} ${plural(n, 'питання', 'питання', 'питань')}`
