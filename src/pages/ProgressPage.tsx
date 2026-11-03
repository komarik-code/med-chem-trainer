import { useRef, useState } from 'react'
import { Download, Monitor, Moon, Sun, Trash2, Upload } from 'lucide-react'
import { useQuizData } from '../lib/data'
import { useStore } from '../lib/store'
import { exportProgressJson, importProgress, parseImport, progressStore, resetProgress, settingsStore } from '../lib/progress'
import { MODES, categoryLabel } from '../lib/session'
import { aggregate, formatDate, formatDuration, percent, plural } from '../lib/stats'
import { splitTitle } from '../lib/titles'
import type { ProgressData, ThemePref } from '../lib/types'
import { ModeIcon, MODE_TONE } from '../components/ModeIcon'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Button, Card, PageHeader, ProgressBar, SectionTitle, StatTile, cx } from '../components/ui'

export function ProgressPage() {
  const data = useQuizData()
  const progress = useStore(progressStore)
  const settings = useStore(settingsStore)
  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingImport, setPendingImport] = useState<ProgressData | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const all = data.categories.flatMap((c) => c.questions)
  const a = aggregate(all, progress)
  const sessions = progress.sessions.slice().reverse()
  const totalTime = progress.sessions.reduce((s, x) => s + x.durationMs, 0)

  const onExport = () => {
    const blob = new Blob([exportProgressJson()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `himtrenazher-progress-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice({ ok: true, text: 'Файл з прогресом збережено. Його можна імпортувати на іншому пристрої.' })
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setPendingImport(parseImport(await file.text()))
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : 'Не вдалося прочитати файл' })
    }
  }

  const importInfo = pendingImport
    ? (() => {
        const known = Object.keys(pendingImport.questions).filter((id) => data.byId.has(id)).length
        return { known, total: Object.keys(pendingImport.questions).length, sessions: pendingImport.sessions.length }
      })()
    : null

  const themes: { id: ThemePref; label: string; icon: typeof Sun }[] = [
    { id: 'light', label: 'Світла', icon: Sun },
    { id: 'dark', label: 'Темна', icon: Moon },
    { id: 'system', label: 'Як у системі', icon: Monitor },
  ]

  return (
    <div className="animate-in">
      <PageHeader title="Прогрес" />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Відповідей" value={a.attempts} />
        <StatTile label="Точність" value={a.attempts ? `${percent(a.correct, a.attempts)}%` : '—'} tone="accent" />
        <StatTile label="Правильних" value={a.correct} tone="ok" />
        <StatTile label="Помилок" value={a.wrong} tone="bad" />
        <StatTile label="Пройдено питань" value={`${a.seen}/${a.total}`} />
        <StatTile label="Засвоєно" value={a.mastered} tone="ok" />
        <StatTile label="Тестів завершено" value={progress.sessions.length} />
        <StatTile label="Час навчання" value={formatDuration(totalTime)} />
      </div>

      <SectionTitle>За темами</SectionTitle>
      <Card className="divide-y divide-line/70">
        {data.categories.map((c) => {
          const ca = aggregate(c.questions, progress)
          return (
            <div key={c.id} className="p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{splitTitle(c.title).main}</span>
                <span className="text-sm text-ink-3 tabular-nums">
                  {ca.seen}/{ca.total}
                </span>
              </div>
              <ProgressBar className="mt-2" value={ca.total ? ca.seen / ca.total : 0} />
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
                <span>
                  точність <b className="text-ink">{ca.attempts ? `${percent(ca.correct, ca.attempts)}%` : '—'}</b>
                </span>
                <span>
                  правильно <b className="text-ok">{ca.correct}</b>
                </span>
                <span>
                  помилок <b className="text-bad">{ca.wrong}</b>
                </span>
                <span>
                  на повторенні <b className="text-warn">{ca.review}</b>
                </span>
              </div>
            </div>
          )
        })}
      </Card>

      {sessions.length > 0 && (
        <>
          <SectionTitle>Останні тести</SectionTitle>
          <Card className="divide-y divide-line/70">
            {sessions.slice(0, 10).map((s) => (
              <div key={s.id} className="flex items-center gap-3 p-3.5">
                <div className={cx('grid size-10 shrink-0 place-items-center rounded-xl', MODE_TONE[s.mode] ?? '')}>
                  <ModeIcon mode={s.mode in MODES ? s.mode : 'learn'} className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {MODES[s.mode]?.title ?? s.mode} · {categoryLabel(s.categoryIds ?? [], data)}
                  </div>
                  <div className="text-xs text-ink-3">
                    {formatDate(s.finishedAt)} · {formatDuration(s.durationMs)}
                  </div>
                </div>
                <div className="text-right">
                  <div className={cx('font-bold tabular-nums', percent(s.correct, s.total) >= 75 ? 'text-ok' : percent(s.correct, s.total) >= 50 ? 'text-ink' : 'text-bad')}>
                    {percent(s.correct, s.total)}%
                  </div>
                  <div className="text-xs text-ink-3 tabular-nums">
                    {s.correct}/{s.total}
                  </div>
                </div>
              </div>
            ))}
          </Card>
        </>
      )}

      <SectionTitle>Тема оформлення</SectionTitle>
      <div className="flex rounded-2xl bg-surface-2 p-1">
        {themes.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => settingsStore.set({ ...settings, theme: id })}
            aria-pressed={settings.theme === id}
            className={cx(
              'flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition',
              settings.theme === id ? 'bg-surface text-ink shadow-card' : 'text-ink-3',
            )}
          >
            <Icon className="size-4" /> <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      <SectionTitle>Дані</SectionTitle>
      <Card className="p-4">
        <p className="text-sm text-ink-2">
          Прогрес зберігається лише в цьому браузері. Щоб перенести його на інший пристрій або не втратити після очищення браузера — експортуйте файл і потім імпортуйте його.
        </p>
        {notice && (
          <p role="status" className={cx('mt-3 rounded-xl px-3 py-2 text-sm font-medium', notice.ok ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad')}>
            {notice.text}
          </p>
        )}
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button variant="secondary" onClick={onExport} icon={<Download className="size-5" />}>
            Експорт у JSON
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()} icon={<Upload className="size-5" />}>
            Імпорт з файлу
          </Button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
        <Button variant="ghost" block className="mt-2 text-bad" onClick={() => setConfirmReset(true)} icon={<Trash2 className="size-5" />}>
          Скинути весь прогрес
        </Button>
      </Card>
      <p className="mt-6 text-center text-xs text-ink-3">
        База: {a.total} {plural(a.total, 'питання', 'питання', 'питань')} · {data.categories.length} {plural(data.categories.length, 'тема', 'теми', 'тем')}
      </p>

      <ConfirmDialog
        open={!!pendingImport}
        title="Імпортувати прогрес?"
        text={
          importInfo && (
            <>
              У файлі статистика по <b>{importInfo.total}</b> питаннях
              {importInfo.known !== importInfo.total && <> (з них у поточній базі — {importInfo.known})</>} і <b>{importInfo.sessions}</b> завершених тестів. Поточний прогрес
              буде <b>замінено</b>.
            </>
          )
        }
        confirmLabel="Замінити прогрес"
        onConfirm={() => {
          if (pendingImport) importProgress(pendingImport)
          setPendingImport(null)
          setNotice({ ok: true, text: 'Прогрес імпортовано.' })
        }}
        onCancel={() => setPendingImport(null)}
      />
      <ConfirmDialog
        open={confirmReset}
        title="Скинути весь прогрес?"
        text="Буде видалено всю статистику, історію відповідей і список помилок. Цю дію неможливо скасувати. Радимо спершу зробити експорт."
        confirmLabel="Так, скинути"
        danger
        extra={
          <Button
            variant="secondary"
            block
            onClick={() => {
              onExport()
            }}
            icon={<Download className="size-5" />}
          >
            Спершу експортувати
          </Button>
        }
        onConfirm={() => {
          resetProgress()
          setConfirmReset(false)
          setNotice({ ok: true, text: 'Прогрес скинуто.' })
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  )
}
