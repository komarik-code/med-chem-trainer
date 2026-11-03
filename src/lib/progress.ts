import { createPersistentStore } from './store'
import type {
  ActiveSession,
  Mode,
  ProgressData,
  QuestionStat,
  SessionSummary,
  Settings,
} from './types'

/** Скільки правильних відповідей поспіль потрібно, щоб питання вийшло зі списку помилок. */
export const REVIEW_STREAK = 2
const HISTORY_LIMIT = 100
const SESSIONS_LIMIT = 200

const PREFIX = 'med-chem-trainer'

// ---------------------------------------------------------------- validation
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d)

function normalizeStat(raw: unknown): QuestionStat | null {
  if (!isObj(raw)) return null
  const history = Array.isArray(raw.history)
    ? raw.history
        .filter(isObj)
        .map((h) => ({ t: num(h.t), ok: Boolean(h.ok), mode: (typeof h.mode === 'string' ? h.mode : 'learn') as Mode }))
        .slice(-HISTORY_LIMIT)
    : []
  return {
    attempts: num(raw.attempts),
    correct: num(raw.correct),
    wrong: num(raw.wrong),
    streak: num(raw.streak),
    lastAttempt: num(raw.lastAttempt),
    lastWrong: typeof raw.lastWrong === 'number' ? raw.lastWrong : null,
    history,
    inReview: Boolean(raw.inReview),
    reviewedAt: typeof raw.reviewedAt === 'number' ? raw.reviewedAt : null,
  }
}

export function validateProgress(raw: unknown): ProgressData | null {
  if (!isObj(raw) || raw.version !== 1 || !isObj(raw.questions)) return null
  const questions: Record<string, QuestionStat> = {}
  for (const [id, s] of Object.entries(raw.questions)) {
    const st = normalizeStat(s)
    if (st) questions[id] = st
  }
  const sessions: SessionSummary[] = Array.isArray(raw.sessions)
    ? (raw.sessions.filter(isObj) as unknown as SessionSummary[]).slice(-SESSIONS_LIMIT)
    : []
  return { version: 1, questions, sessions }
}

const emptyProgress = (): ProgressData => ({ version: 1, questions: {}, sessions: [] })

export const progressStore = createPersistentStore<ProgressData>(`${PREFIX}:progress:v1`, emptyProgress, validateProgress)

export const settingsStore = createPersistentStore<Settings>(
  `${PREFIX}:settings`,
  () => ({ theme: 'system' }),
  (raw) => (isObj(raw) && ['system', 'light', 'dark'].includes(raw.theme as string) ? (raw as unknown as Settings) : null),
)

function validateSession(raw: unknown): ActiveSession | null {
  if (!isObj(raw) || !Array.isArray(raw.questionIds) || !isObj(raw.config) || !isObj(raw.answers)) return null
  return raw as unknown as ActiveSession
}

/** Поточна (незавершена) сесія — переживає перезавантаження сторінки. */
export const sessionStore = createPersistentStore<ActiveSession | null>(`${PREFIX}:session`, () => null, validateSession)
/** Остання завершена сесія — для екрана результатів. */
export const lastResultStore = createPersistentStore<ActiveSession | null>(`${PREFIX}:last-result`, () => null, validateSession)

// ---------------------------------------------------------------- mutations
export function emptyStat(): QuestionStat {
  return { attempts: 0, correct: 0, wrong: 0, streak: 0, lastAttempt: 0, lastWrong: null, history: [], inReview: false, reviewedAt: null }
}

function applyAnswer(prev: QuestionStat | undefined, ok: boolean, mode: Mode, now: number): QuestionStat {
  const s = prev ?? emptyStat()
  const next: QuestionStat = {
    ...s,
    attempts: s.attempts + 1,
    correct: s.correct + (ok ? 1 : 0),
    wrong: s.wrong + (ok ? 0 : 1),
    streak: ok ? s.streak + 1 : 0,
    lastAttempt: now,
    lastWrong: ok ? s.lastWrong : now,
    history: [...s.history, { t: now, ok, mode }].slice(-HISTORY_LIMIT),
  }
  if (!ok) {
    next.inReview = true
    next.reviewedAt = null
  } else if (s.inReview && next.streak >= REVIEW_STREAK) {
    next.inReview = false
    next.reviewedAt = now
  }
  return next
}

export function recordAnswers(items: { id: string; ok: boolean }[], mode: Mode) {
  if (!items.length) return
  const now = Date.now()
  progressStore.update((p) => {
    const questions = { ...p.questions }
    for (const it of items) questions[it.id] = applyAnswer(questions[it.id], it.ok, mode, now)
    return { ...p, questions }
  })
}

export function addSessionSummary(summary: SessionSummary) {
  progressStore.update((p) => ({ ...p, sessions: [...p.sessions, summary].slice(-SESSIONS_LIMIT) }))
}

export function resetProgress() {
  progressStore.set(emptyProgress())
  sessionStore.set(null)
  lastResultStore.set(null)
}

// ---------------------------------------------------------------- export / import
const EXPORT_APP = 'med-chem-trainer'

export function exportProgressJson(): string {
  return JSON.stringify(
    { app: EXPORT_APP, exportedAt: new Date().toISOString(), progress: progressStore.get() },
    null,
    1,
  )
}

export function parseImport(text: string): ProgressData {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('Файл не є коректним JSON')
  }
  const payload = isObj(raw) && raw.app === EXPORT_APP ? raw.progress : raw
  const data = validateProgress(payload)
  if (!data) throw new Error('Файл не схожий на експорт прогресу цього застосунку')
  return data
}

export function importProgress(data: ProgressData) {
  progressStore.set(data)
  sessionStore.set(null)
}
