export interface Option {
  /** Літера варіанта з оригінальної бази (A, B, C…) */
  id: string
  /** Текст варіанта; може містити <sub>, <sup>, <img> */
  html: string
}

export interface Question {
  /** Стабільний ID: <категорія>-<хеш вмісту> */
  id: string
  /** Номер питання в оригінальному файлі */
  number: number
  text: string
  options: Option[]
  /** Літери правильних варіантів */
  correct: string[]
  multiple: boolean
  explanation?: string
  categoryId: string
}

export interface CategoryMeta {
  id: string
  title: string
  description: string
  count: number
  file: string
}

export interface Category extends CategoryMeta {
  questions: Question[]
}

export type Mode = 'all' | 'learn' | 'exam' | 'mistakes' | 'weak' | 'random'

export interface AttemptRecord {
  /** час, мс */
  t: number
  ok: boolean
  mode: Mode
}

export interface QuestionStat {
  attempts: number
  correct: number
  wrong: number
  /** правильних відповідей поспіль */
  streak: number
  lastAttempt: number
  lastWrong: number | null
  history: AttemptRecord[]
  /** у списку повторення помилок */
  inReview: boolean
  /** коли питання востаннє успішно повторене */
  reviewedAt: number | null
}

export interface SessionSummary {
  id: string
  mode: Mode
  categoryIds: string[]
  total: number
  answered: number
  correct: number
  wrong: number
  startedAt: number
  finishedAt: number
  durationMs: number
}

/** Активність за календарний день (Europe/Kyiv) */
export interface DayLog {
  /** завершених тестів, у яких відповіли на всі питання */
  fullTests: number
}

export interface ProgressData {
  /** v1 — статистика; v2 — + журнал днів для щоденної серії */
  version: 2
  questions: Record<string, QuestionStat>
  sessions: SessionSummary[]
  /** ключ — "YYYY-MM-DD" за Києвом */
  days: Record<string, DayLog>
}

/** Як завершення тесту вплинуло на серію */
export interface StreakOutcome {
  /** тест пройдено повністю (усі питання з відповіддю) */
  full: boolean
  /** це перший повний тест сьогодні — день щойно зараховано */
  newDay: boolean
  current: number
}

export interface SessionConfig {
  mode: Mode
  /** порожній масив = усі категорії */
  categoryIds: string[]
  /** null = усі доступні питання */
  limit: number | null
  /** конкретний набір питань (наприклад, помилки з останнього тесту) */
  fixedIds?: string[]
}

export interface ActiveSession {
  id: string
  config: SessionConfig
  questionIds: string[]
  /** відповіді користувача: id питання -> вибрані літери */
  answers: Record<string, string[]>
  /** питання, відповідь на які вже перевірена (миттєвий режим) */
  checked: Record<string, boolean>
  index: number
  startedAt: number
  finishedAt: number | null
  /** заповнюється при завершенні */
  streak?: StreakOutcome
}

export type ThemePref = 'system' | 'light' | 'dark'

export interface Settings {
  theme: ThemePref
  /** коли востаннє скачано JSON з прогресом */
  lastBackupAt?: number
  /** коли натиснули «Пізніше» на нагадуванні */
  backupSnoozedAt?: number
}
