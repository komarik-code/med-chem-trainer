import { Download, HardDriveDownload } from 'lucide-react'
import { useStore } from '../lib/store'
import { progressStore, settingsStore } from '../lib/progress'
import { BACKUP_INTERVAL_DAYS, downloadBackup, isBackupDue, snoozeBackupReminder } from '../lib/backup'
import { Button, Card } from './ui'

/** Примітка від авторів — показується біля нагадування і в розділі «Дані». */
export function BackupDisclaimer({ className = '' }: { className?: string }) {
  return (
    <div className={`text-xs leading-relaxed text-ink-3 ${className}`}>
      <p>* бо замстарості впадлу підняти для цього сервер</p>
      <p>За втрату даних староста і замстарости відповідальності нести не будуть, робити більше нема шо :)</p>
    </div>
  )
}

/** Банер на головній: раз на 5 днів нагадує скачати JSON з прогресом. */
export function BackupReminder() {
  useStore(progressStore)
  useStore(settingsStore) // перерахунок після скачування / «пізніше»
  if (!isBackupDue()) return null

  return (
    <Card className="mb-4 border-accent/40 p-4 animate-in">
      <div className="flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
          <HardDriveDownload className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold">Час зберегти прогрес</div>
          <p className="mt-0.5 text-sm text-ink-2">
            Прогрес живе тільки в цьому браузері*. Скачай файл — якщо браузер очиститься, його можна буде імпортувати у «Прогрес → Дані». Нагадуємо раз на {BACKUP_INTERVAL_DAYS} днів.
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <Button onClick={downloadBackup} icon={<Download className="size-5" />}>
          Скачати JSON
        </Button>
        <Button variant="secondary" onClick={snoozeBackupReminder}>
          Пізніше
        </Button>
      </div>
      <BackupDisclaimer className="mt-3" />
    </Card>
  )
}
