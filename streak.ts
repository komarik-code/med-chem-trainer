/**
 * Щоденна серія. Усі дати — календарні дні за часовим поясом Europe/Kyiv
 * у форматі "YYYY-MM-DD", незалежно від налаштувань пристрою.
 */
import type { DayLog } from './types'

export const STREAK_TZ = 'Europe/Kyiv'
export const STREAK_GOALS = [3, 7, 14, 30, 60, 100]

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: STREAK_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

/** Календарний день за Києвом для моменту часу (мс). */
export function kyivDateKey(ts: number): string {
  const parts = fmt.formatToParts(new Date(ts))
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

const DAY_MS = 86_400_000

function keyToUtc(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** Зсув календарного дня (коректно через межі місяців і років). */
export function addDays(key: string, n: number): string {
  return new Date(keyToUtc(key) + n * DAY_MS).toISOString().slice(0, 10)
}

/** День тижня: 0 = понеділок … 6 = неділя */
export function weekdayMon0(key: string): number {
  return (new Date(keyToUtc(key)).getUTCDay() + 6) % 7
}

export interface StreakInfo {
  current: number
  longest: number
  /** сьогодні вже зараховано */
  activeToday: boolean
  today: string
}

const isActive = (days: Record<string, DayLog>, key: string) => (days[key]?.fullTests ?? 0) > 0

export function computeStreak(days: Record<string, DayLog>, now = Date.now()): StreakInfo {
  const today = kyivDateKey(now)
  const activeToday = isActive(days, today)

  // поточна серія: від сьогодні (або від учора, якщо сьогодні ще не зараховано — день ще не скінчився)
  let current = 0
  let cursor = activeToday ? today : addDays(today, -1)
  while (isActive(days, cursor)) {
    current++
    cursor = addDays(cursor, -1)
  }

  // найдовша серія за весь час
  const keys = Object.keys(days).filter((k) => isActive(days, k) && k <= today).sort()
  let longest = 0
  let run = 0
  let prev: string | null = null
  for (const k of keys) {
    run = prev !== null && addDays(prev, 1) === k ? run + 1 : 1
    longest = Math.max(longest, run)
    prev = k
  }

  return { current, longest: Math.max(longest, current), activeToday, today }
}

export function nextGoal(current: number): number | null {
  return STREAK_GOALS.find((g) => g > current) ?? null
}

/** Останні n днів (включно з сьогоднішнім), від найстарішого до сьогодні. */
export function lastDays(n: number, now = Date.now()): string[] {
  const today = kyivDateKey(now)
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)))
}
