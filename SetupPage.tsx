import { useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Play, Sparkles } from 'lucide-react'
import { useQuizData } from '../lib/data'
import { useStore } from '../lib/store'
import { progressStore, sessionStore } from '../lib/progress'
import { MODES, poolFor, startSession } from '../lib/session'
import { questionsWord } from '../lib/stats'
import { splitTitle } from '../lib/titles'
import type { Mode } from '../lib/types'
import { ModeIcon, MODE_TONE } from '../components/ModeIcon'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Button, Card, Chip, EmptyState, PageHeader, SectionTitle, cx } from '../components/ui'

const LIMITS = [10, 20, 30, 50]

export function SetupPage() {
  const { mode: modeParam } = useParams()
  const [params] = useSearchParams()
  const data = useQuizData()
  const progress = useStore(progressStore) // перерахунок пулу при зміні прогресу
  const active = useStore(sessionStore)
  const nav = useNavigate()

  const initialCat = params.get('cat')
  const [cat, setCat] = useState<string | null>(initialCat && data.categories.some((c) => c.id === initialCat) ? initialCat : null)
  const info = modeParam && modeParam in MODES ? MODES[modeParam as Mode] : null
  const [limit, setLimit] = useState<number | null>(info?.defaultLimit ?? null)
  const [confirmReplace, setConfirmReplace] = useState(false)

  const categoryIds = cat ? [cat] : []
  const pool = useMemo(() => (info ? poolFor({ mode: info.id, categoryIds: cat ? [cat] : [] }, data) : []), [info, cat, data, progress])
  if (!info) return <Navigate to="/" replace />

  const effective = limit === null ? pool.length : Math.min(limit, pool.length)

  const begin = () => {
    const s = startSession({ mode: info.id, categoryIds, limit }, data)
    if (s) nav('/quiz', { replace: true })
  }
  const onStart = () => (active ? setConfirmReplace(true) : begin())

  const countFor = (catId: string | null) => poolFor({ mode: info.id, categoryIds: catId ? [catId] : [] }, data).length

  return (
    <div className="animate-in">
      <PageHeader title={info.title} back />

      <Card className="flex gap-3 p-4">
        <div className={cx('grid size-12 shrink-0 place-items-center rounded-2xl', MODE_TONE[info.id])}>
          <ModeIcon mode={info.id} className="size-6" />
        </div>
        <p className="text-[15px] leading-relaxed text-ink-2">{info.description}</p>
      </Card>

      <SectionTitle>Тема</SectionTitle>
      <div className="flex flex-col gap-2">
        {[null, ...data.categories.map((c) => c.id)].map((id) => {
          const c = id ? data.categories.find((x) => x.id === id)! : null
          const n = countFor(id)
          const selected = cat === id
          return (
            <button
              key={id ?? 'all'}
              type="button"
              onClick={() => setCat(id)}
              aria-pressed={selected}
              className={cx(
                'flex min-h-14 items-center gap-3 rounded-2xl border-2 px-4 py-2.5 text-left transition',
                selected ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-ink-3/50',
              )}
            >
              <span className={cx('size-5 shrink-0 rounded-full border-2 transition', selected ? 'border-accent bg-accent shadow-[inset_0_0_0_3px_var(--surface)]' : 'border-ink-3/50')} />
              <span className="min-w-0 flex-1 font-semibold">{c ? splitTitle(c.title).main : 'Усі теми разом'}</span>
              <span className="shrink-0 text-sm text-ink-3 tabular-nums">{n}</span>
            </button>
          )
        })}
      </div>

      {info.limitable && pool.length > 0 && (
        <>
          <SectionTitle>Кількість питань</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {LIMITS.filter((l) => l < pool.length).map((l) => (
              <Chip key={l} active={limit === l} onClick={() => setLimit(l)}>
                {l}
              </Chip>
            ))}
            <Chip active={limit === null || limit >= pool.length} onClick={() => setLimit(null)}>
              Усі ({pool.length})
            </Chip>
          </div>
        </>
      )}

      {pool.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="size-7" />}
          title={info.id === 'mistakes' ? 'Помилок немає' : info.id === 'weak' ? 'Слабких місць ще немає' : 'Немає питань'}
          text={
            info.id === 'mistakes' || info.id === 'weak'
              ? 'Тут з’являться питання, на які ви відповіли неправильно. Спробуйте режим «Навчання».'
              : undefined
          }
          action={
            (info.id === 'mistakes' || info.id === 'weak') && (
              <Button onClick={() => nav(`/setup/learn${cat ? `?cat=${cat}` : ''}`, { replace: true })}>До навчання</Button>
            )
          }
        />
      ) : (
        <div className="sticky bottom-20 z-10 mt-8 pb-2">
          <Button block onClick={onStart} icon={<Play className="size-5 fill-current" />} className="min-h-14 text-base shadow-lg">
            Почати · {questionsWord(effective)}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmReplace}
        title="Почати новий тест?"
        text="У вас є незавершений тест. Він буде закритий. Перевірені відповіді залишаться в статистиці."
        confirmLabel="Почати новий"
        onConfirm={() => {
          setConfirmReplace(false)
          begin()
        }}
        onCancel={() => setConfirmReplace(false)}
      />
    </div>
  )
}
