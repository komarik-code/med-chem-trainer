import { createPersistentStore } from './store'
import { computeStreak, kyivDateKey } from './streak'
import type {
  ActiveSession,
  DayLog,
  Mode,
  ProgressData,
  QuestionStat,
  SessionSummary,
  Settings,
  StreakOutcome,
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

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Питання, текст яких виправлено в базі (биті символи після конвертації RTF),
 * отримали нові ID. Переносимо збережену статистику зі старих ID на нові.
 */
const ID_ALIASES: Record<string, string> = {
  '6934-9a37a0ca51': '6934-4dac829d25', // №275: 6СО2 + 6Н2О
  '6934-c2438b1c02': '6934-c846171280', // №371: (каталізатор NO)
  '6934-d474ee7fa9': '6934-5005798504', // №374: (г)
  '6934-6c39c8aaa4': '6934-d463b0eb45', // №389: ⇔, ΔH
  '6934-69b4ce6720': '6934-89ffb03365', // №390: ↔
  '6934-18b4d5c2a7': '6934-b90d564dee', // №399: hυ →
}
export const resolveQuestionId = (id: string) => ID_ALIASES[id] ?? id

/**
 * Перевірка й міграція збережених даних.
 * v1 → v2: додається порожній журнал днів (минулі повні тести відновити неможливо —
 * у v1 не зберігалось, чи тест пройдено повністю).
 */
export function validateProgress(raw: unknown): ProgressData | null {
  if (!isObj(raw) || (raw.version !== 1 && raw.version !== 2) || !isObj(raw.questions)) return null
  const questions: Record<string, QuestionStat> = {}
  for (const [rawId, s] of Object.entries(raw.questions)) {
    const st = normalizeStat(s)
    const id = resolveQuestionId(rawId)
    // якщо є і старий, і новий запис — лишаємо той, де більше спроб
    if (st && (!questions[id] || questions[id].attempts < st.attempts)) questions[id] = st
  }
  const sessions: SessionSummary[] = Array.isArray(raw.sessions)
    ? (raw.sessions.filter(isObj) as unknown as SessionSummary[]).slice(-SESSIONS_LIMIT)
    : []
  const days: Record<string, DayLog> = {}
  if (raw.version === 2 && isObj(raw.days)) {
    for (const [k, d] of Object.entries(raw.days)) {
      if (DAY_KEY_RE.test(k) && isObj(d) && num(d.fullTests) > 0) days[k] = { fullTests: Math.floor(num(d.fullTests)) }
    }
  }
  return { version: 2, questions, sessions, days }
}

const emptyProgress = (): ProgressData => ({ version: 2, questions: {}, sessions: [], days: {} })

export const progressStore = createPersistentStore<ProgressData>(`${PREFIX}:progress:v1`, emptyProgress, validateProgress)

export const settingsStore = createPersistentStore<Settings>(
  `${PREFIX}:settings`,
  () => ({ theme: 'system' }),
  (raw) =>
    isObj(raw) && ['system', 'light', 'dark'].includes(raw.theme as string)
      ? {
          theme: raw.theme as Settings['theme'],
          lastBackupAt: typeof raw.lastBackupAt === 'number' ? raw.lastBackupAt : undefined,
          backupSnoozedAt: typeof raw.backupSnoozedAt === 'number' ? raw.backupSnoozedAt : undefined,
        }
      : null,
)

function validateSession(raw: unknown): ActiveSession | null {
  if (!isObj(raw) || !Array.isArray(raw.questionIds) || !isObj(raw.config) || !isObj(raw.answers)) return null
  const s = raw as unknown as ActiveSession
  const remap = <T,>(rec: Record<string, T>) => Object.fromEntries(Object.entries(rec ?? {}).map(([k, v]) => [resolveQuestionId(k), v]))
  return {
    ...s,
    questionIds: s.questionIds.map(resolveQuestionId),
    answers: remap(s.answers),
    checked: remap(s.checked),
    config: s.config.fixedIds ? { ...s.config, fixedIds: s.config.fixedIds.map(resolveQuestionId) } : s.config,
  }
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

/**
 * Зарахувати повністю завершений тест у журнал днів.
 * День визначається моментом завершення за Києвом, тож «заднім числом» його не зарахувати.
 */
export function recordFullTest(now = Date.now()): StreakOutcome {
  const key = kyivDateKey(now)
  const prev = progressStore.get().days[key]?.fullTests ?? 0
  progressStore.update((p) => ({ ...p, days: { ...p.days, [key]: { fullTests: prev + 1 } } }))
  return { full: true, newDay: prev === 0, current: computeStreak(progressStore.get().days, now).current }
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
