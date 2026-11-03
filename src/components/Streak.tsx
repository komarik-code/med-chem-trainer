import { Flame, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import { progressStore } from '../lib/progress'
import { STREAK_GOALS, computeStreak, lastDays, nextGoal, weekdayMon0 } from '../lib/streak'
import { plural } from '../lib/stats'
import { Card, ProgressBar, cx } from './ui'

export const daysWord = (n: number) => plural(n, 'день', 'дні', 'днів')

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']
const MONTHS = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру']

function useStreak() {
  const progress = useStore(progressStore)
  return { days: progress.days, info: computeStreak(progress.days) }
}

/** Компактний чип для головної сторінки. */
export function StreakChip() {
  const { info } = useStreak()
  return (
    <Link
      to="/progress"
      aria-label={`Серія: ${info.current} ${daysWord(info.current)}${info.activeToday ? ', сьогодні зараховано' : ''}`}
      className={cx(
        'inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-[15px] font-bold tabular-nums transition active:scale-95',
        info.activeToday ? 'bg-warn-soft text-warn' : 'bg-surface-2 text-ink-3',
      )}
    >
      <Flame className={cx('size-5', info.activeToday && 'fill-current')} />
      {info.current}
    </Link>
  )
}

/** Повна картка серії: поточна, найдовша, календар 30 днів, цілі. */
export function StreakCard() {
  const { days, info } = useStreak()
  const goal = nextGoal(info.current)
  const prevGoal = [...STREAK_GOALS].reverse().find((g) => g <= info.current) ?? 0
  const last30 = lastDays(30)
  const lead = weekdayMon0(last30[0])

  const status = info.activeToday
    ? 'Сьогодні вже зараховано — так тримати!'
    : info.current > 0
      ? 'Заверши один повний тест сьогодні, щоб не перервати серію.'
      : 'Заверши один тест повністю — і серія почнеться.'

  return (
    <Card className="p-4" >
      <div className="flex items-center gap-4">
        <div className={cx('grid size-16 shrink-0 place-items-center rounded-3xl', info.current ? 'bg-warn-soft text-warn' : 'bg-surface-2 text-ink-3')}>
          <Flame className={cx('size-9', info.activeToday && 'fill-current')} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[28px] leading-none font-extrabold tabular-nums">
            {info.current} <span className="text-base font-bold text-ink-2">{daysWord(info.current)}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-sm text-ink-3">
            <Trophy className="size-4" /> Найдовша: <b className="text-ink tabular-nums">{info.longest}</b> {daysWord(info.longest)}
          </div>
        </div>
      </div>
      <p className={cx('mt-3 text-sm', info.activeToday ? 'text-ok' : 'text-ink-2')}>{status}</p>

      {/* календар 30 днів */}
      <div className="mt-4">
        <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold text-ink-3">
          {WEEKDAYS.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="mt-1.5 grid grid-cols-7 gap-1.5" role="list" aria-label="Активність за останні 30 днів">
          {Array.from({ length: lead }, (_, i) => (
            <div key={`pad${i}`} aria-hidden />
          ))}
          {last30.map((k) => {
            const n = days[k]?.fullTests ?? 0
            const isToday = k === info.today
            const [, m, d] = k.split('-').map(Number)
            return (
              <div
                key={k}
                role="listitem"
                title={`${d} ${MONTHS[m - 1]}: ${n ? `завершено тестів — ${n}` : 'без повного тесту'}`}
                aria-label={`${d} ${MONTHS[m - 1]}${n ? ', є повний тест' : ''}`}
                className={cx(
                  'grid aspect-square place-items-center rounded-lg text-[12px] font-semibold tabular-nums transition',
                  n ? 'bg-warn text-white' : 'bg-surface-2 text-ink-3',
                  isToday && 'ring-2 ring-accent ring-offset-2 ring-offset-surface',
                )}
              >
                {d}
              </div>
            )
          })}
        </div>
      </div>

      {/* цілі */}
      <div className="mt-5">
        {goal ? (
          <>
            <div className="mb-1.5 flex justify-between text-sm">
              <span className="text-ink-2">
                Наступна ціль: <b className="text-ink">{goal} {daysWord(goal)}</b>
              </span>
              <span className="text-ink-3 tabular-nums">ще {goal - info.current}</span>
            </div>
            <ProgressBar tone="warn" value={(info.current - prevGoal) / (goal - prevGoal)} />
          </>
        ) : (
          <p className="text-sm font-semibold text-ok">Усі цілі досягнуто! 🏆</p>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {STREAK_GOALS.map((g) => {
            const reached = info.longest >= g
            return (
              <span
                key={g}
                className={cx(
                  'rounded-full px-2.5 py-1 text-xs font-bold tabular-nums',
                  reached ? 'bg-warn text-white' : g === goal ? 'bg-warn-soft text-warn' : 'bg-surface-2 text-ink-3',
                )}
              >
                {reached && '✓ '}
                {g}
              </span>
            )
          })}
        </div>
      </div>
    </Card>
  )
}
