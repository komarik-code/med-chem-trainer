import { useEffect, useState } from 'react'
import { Gift, X } from 'lucide-react'
import { Button } from './ui'

const JAR_URL = 'https://send.monobank.ua/jar/51pLXMgxCC'
const SEEN_KEY = 'med-chem-trainer:egg-seen'

/** 11, 12, 13 листопада (за місцевим часом відвідувача) */
function messageFor(d: Date): string | null {
  if (d.getMonth() !== 10) return null
  switch (d.getDate()) {
    case 11:
      return 'У розробника завтра день народження!'
    case 12:
      return 'У розробника сьогодні день народження!'
    case 13:
      return 'У розробника вчора був день народження!'
    default:
      return null
  }
}

const todayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

const CONFETTI_COLORS = ['#5b5bd6', '#16a34a', '#e5484d', '#f5a524', '#9146c9', '#138a7a']

export function BirthdayEgg() {
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const now = new Date()
    const msg = messageFor(now)
    if (!msg) return
    // показуємо один раз на день у кожному браузері, щоб не заважати навчанню
    try {
      if (localStorage.getItem(SEEN_KEY) === todayKey(now)) return
    } catch {
      /* без localStorage просто показуємо */
    }
    setMessage(msg)
  }, [])

  useEffect(() => {
    if (!message) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [message])

  function close() {
    try {
      localStorage.setItem(SEEN_KEY, todayKey(new Date()))
    } catch {
      /* ігноруємо */
    }
    setMessage(null)
  }

  function congratulate() {
    window.open(JAR_URL, '_blank', 'noopener,noreferrer')
    close()
  }

  if (!message) return null

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="egg-title" className="fixed inset-0 z-[100] grid place-items-center overflow-hidden bg-bg p-6 animate-in">
      {/* конфеті */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {Array.from({ length: 36 }, (_, i) => (
          <span
            key={i}
            className="egg-confetti"
            style={{
              left: `${(i * 37) % 100}%`,
              background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              animationDelay: `${(i % 12) * 0.35}s`,
              animationDuration: `${4 + (i % 5)}s`,
              transform: `rotate(${i * 29}deg)`,
            }}
          />
        ))}
      </div>

      <button type="button" aria-label="Закрити" onClick={close} className="absolute top-4 right-4 grid size-12 place-items-center rounded-full text-ink-2 hover:bg-surface-2">
        <X className="size-6" />
      </button>

      <div className="relative flex max-w-sm flex-col items-center text-center">
        <div className="text-7xl egg-bounce" aria-hidden>
          🎂
        </div>
        <h1 id="egg-title" className="mt-6 text-[28px] leading-tight font-extrabold tracking-tight">
          {message}
        </h1>
        <p className="mt-3 text-[15px] text-ink-3">Ти знайшов(-ла) пасхалку 🥚</p>
        <div className="mt-8 flex w-full flex-col gap-2">
          <Button block onClick={congratulate} icon={<Gift className="size-5" />} className="min-h-14 text-base">
            Привітати
          </Button>
          <Button block variant="secondary" onClick={close}>
            Закрити
          </Button>
        </div>
      </div>
    </div>
  )
}
