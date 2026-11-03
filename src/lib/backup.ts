import { exportProgressJson, progressStore, settingsStore } from './progress'

/** Як часто нагадувати про резервну копію прогресу. */
export const BACKUP_INTERVAL_DAYS = 5
const DAY_MS = 86_400_000

/** Завантажити JSON з прогресом і запам'ятати дату останнього бекапу. */
export function downloadBackup() {
  const blob = new Blob([exportProgressJson()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `himtrenazher-progress-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  settingsStore.update((s) => ({ ...s, lastBackupAt: Date.now() }))
}

/** «Нагадати пізніше» — наступне нагадування через той самий інтервал. */
export function snoozeBackupReminder() {
  settingsStore.update((s) => ({ ...s, backupSnoozedAt: Date.now() }))
}

/** Найраніша відповідь у прогресі — відлік, якщо бекапів ще не було. */
function firstActivity(): number | null {
  let min: number | null = null
  for (const s of Object.values(progressStore.get().questions)) {
    for (const h of s.history) if (h.t > 0 && (min === null || h.t < min)) min = h.t
  }
  return min
}

/** Чи пора показати нагадування (є що втрачати і минуло ≥ 5 днів від бекапу / першої активності / відкладення). */
export function isBackupDue(now = Date.now()): boolean {
  const first = firstActivity()
  if (first === null) return false
  const { lastBackupAt, backupSnoozedAt } = settingsStore.get()
  const since = Math.max(lastBackupAt ?? first, backupSnoozedAt ?? 0)
  return now - since >= BACKUP_INTERVAL_DAYS * DAY_MS
}
