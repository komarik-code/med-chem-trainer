import type { QuizData } from './data'
import { addSessionSummary, lastResultStore, progressStore, recordAnswers, recordFullTest, sessionStore } from './progress'
import { weaknessScore } from './stats'
import type { ActiveSession, Mode, Question, SessionConfig } from './types'

export interface ModeInfo {
  id: Mode
  title: string
  short: string
  description: string
  /** чи показувати правильну відповідь одразу */
  instant: boolean
  /** чи можна вибирати кількість питань */
  limitable: boolean
  defaultLimit: number | null
}

export const MODES: Record<Mode, ModeInfo> = {
  all: {
    id: 'all', title: 'Усі питання', short: 'Кожне питання один раз',
    description: 'Усі питання обраної теми в перемішаному порядку, кожне — один раз за сесію. Результат видно одразу.',
    instant: true, limitable: false, defaultLimit: null,
  },
  learn: {
    id: 'learn', title: 'Навчання', short: 'Відповідь одразу',
    description: 'Питання по одному. Після вибору одразу видно, чи правильно, і який варіант правильний. Можна повертатися назад.',
    instant: true, limitable: true, defaultLimit: 20,
  },
  exam: {
    id: 'exam', title: 'Іспит', short: 'Перевірка в кінці',
    description: 'Правильні відповіді не показуються до завершення. Відповіді можна змінювати, доки тест не завершено.',
    instant: false, limitable: true, defaultLimit: 30,
  },
  mistakes: {
    id: 'mistakes', title: 'Помилки', short: 'Повторення помилок',
    description: `Питання, на які ви відповіли неправильно. Питання виходить зі списку після кількох правильних відповідей поспіль.`,
    instant: true, limitable: true, defaultLimit: null,
  },
  weak: {
    id: 'weak', title: 'Слабкі місця', short: 'Найскладніші для вас',
    description: 'Автоматичний добір питань з найбільшою кількістю й частотою помилок, з урахуванням давності останньої помилки.',
    instant: true, limitable: true, defaultLimit: 20,
  },
  random: {
    id: 'random', title: 'Випадковий тест', short: 'Випадковий набір',
    description: 'Випадкові питання без повторів у межах сесії. Кількість обираєте самі.',
    instant: true, limitable: true, defaultLimit: 20,
  },
}

export const MODE_ORDER: Mode[] = ['learn', 'exam', 'all', 'random', 'mistakes', 'weak']

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function poolFor(config: Pick<SessionConfig, 'mode' | 'categoryIds'>, data: QuizData): Question[] {
  const cats = config.categoryIds.length ? data.categories.filter((c) => config.categoryIds.includes(c.id)) : data.categories
  const all = cats.flatMap((c) => c.questions)
  const progress = progressStore.get()
  switch (config.mode) {
    case 'mistakes':
      return all.filter((q) => progress.questions[q.id]?.inReview)
    case 'weak':
      return all.filter((q) => (progress.questions[q.id]?.wrong ?? 0) > 0)
    default:
      return all
  }
}

export function buildQuestionIds(config: SessionConfig, data: QuizData): string[] {
  if (config.fixedIds?.length) return shuffle(config.fixedIds.filter((id) => data.byId.has(id)))
  const pool = poolFor(config, data)
  const limit = config.limit ?? pool.length
  if (config.mode === 'weak') {
    const progress = progressStore.get()
    const now = Date.now()
    const ranked = pool
      .map((q) => ({ id: q.id, score: weaknessScore(progress.questions[q.id], now) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
    return shuffle(ranked.map((r) => r.id))
  }
  return shuffle(pool.map((q) => q.id)).slice(0, limit)
}

export function startSession(config: SessionConfig, data: QuizData): ActiveSession | null {
  const questionIds = buildQuestionIds(config, data)
  if (!questionIds.length) return null
  const session: ActiveSession = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    config,
    questionIds,
    answers: {},
    checked: {},
    index: 0,
    startedAt: Date.now(),
    finishedAt: null,
  }
  sessionStore.set(session)
  return session
}

export function isCorrect(q: Question, selected: string[] | undefined): boolean {
  if (!selected || selected.length !== q.correct.length) return false
  const set = new Set(selected)
  return q.correct.every((c) => set.has(c))
}

/** Миттєвий режим: зафіксувати відповідь і записати в статистику. */
export function submitInstant(q: Question, selected: string[]) {
  const s = sessionStore.get()
  if (!s || s.checked[q.id]) return
  sessionStore.set({ ...s, answers: { ...s.answers, [q.id]: selected }, checked: { ...s.checked, [q.id]: true } })
  recordAnswers([{ id: q.id, ok: isCorrect(q, selected) }], s.config.mode)
}

/** Режим іспиту: просто зберегти вибір. */
export function setExamAnswer(qid: string, selected: string[]) {
  const s = sessionStore.get()
  if (!s) return
  const answers = { ...s.answers }
  if (selected.length) answers[qid] = selected
  else delete answers[qid]
  sessionStore.set({ ...s, answers })
}

export function goTo(index: number) {
  const s = sessionStore.get()
  if (!s) return
  sessionStore.set({ ...s, index: Math.max(0, Math.min(s.questionIds.length - 1, index)) })
}

export interface SessionResult {
  total: number
  answered: number
  correct: number
  wrong: number
  unanswered: number
  durationMs: number
  wrongIds: string[]
}

export function computeResult(s: ActiveSession, data: QuizData): SessionResult {
  const instant = MODES[s.config.mode].instant
  let correct = 0
  let wrong = 0
  const wrongIds: string[] = []
  for (const id of s.questionIds) {
    const q = data.byId.get(id)
    if (!q) continue
    const answered = instant ? s.checked[id] : Boolean(s.answers[id]?.length)
    if (!answered) continue
    if (isCorrect(q, s.answers[id])) correct++
    else {
      wrong++
      wrongIds.push(id)
    }
  }
  const total = s.questionIds.length
  return {
    total,
    answered: correct + wrong,
    correct,
    wrong,
    unanswered: total - correct - wrong,
    durationMs: (s.finishedAt ?? Date.now()) - s.startedAt,
    wrongIds,
  }
}

export function finishSession(data: QuizData): ActiveSession | null {
  const s = sessionStore.get()
  if (!s) return null
  const finished: ActiveSession = { ...s, finishedAt: Date.now() }
  if (!MODES[s.config.mode].instant) {
    // іспит: перевіряємо все разом і записуємо в статистику
    const items = s.questionIds
      .filter((id) => s.answers[id]?.length && data.byId.has(id))
      .map((id) => ({ id, ok: isCorrect(data.byId.get(id)!, s.answers[id]) }))
    recordAnswers(items, s.config.mode)
  }
  const r = computeResult(finished, data)
  // щоденна серія: зараховується лише тест, у якому відповіли на всі питання
  finished.streak = r.total > 0 && r.unanswered === 0 ? recordFullTest(finished.finishedAt!) : { full: false, newDay: false, current: 0 }
  if (r.answered > 0) {
    addSessionSummary({
      id: s.id,
      mode: s.config.mode,
      categoryIds: s.config.categoryIds,
      total: r.total,
      answered: r.answered,
      correct: r.correct,
      wrong: r.wrong,
      startedAt: s.startedAt,
      finishedAt: finished.finishedAt!,
      durationMs: r.durationMs,
    })
  }
  lastResultStore.set(finished)
  sessionStore.set(null)
  return finished
}

export function abandonSession() {
  sessionStore.set(null)
}

export function categoryLabel(ids: string[], data: QuizData): string {
  if (!ids.length || ids.length === data.categories.length) return 'Усі теми'
  return ids.map((id) => data.categories.find((c) => c.id === id)?.title ?? id).join(', ')
}
