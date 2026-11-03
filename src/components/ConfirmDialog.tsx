import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from './ui'

export function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel = 'Підтвердити',
  cancelLabel = 'Скасувати',
  danger,
  onConfirm,
  onCancel,
  extra,
}: {
  open: boolean
  title: string
  text?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
  extra?: ReactNode
}) {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 backdrop-blur-[2px] sm:items-center" onClick={onCancel} role="presentation">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl bg-surface p-5 shadow-xl animate-in pb-safe"
      >
        <h2 id="confirm-title" className="text-lg font-bold">{title}</h2>
        {text && <div className="mt-2 text-[15px] text-ink-2">{text}</div>}
        <div className="mt-5 flex flex-col gap-2">
          <Button ref={ref} variant={danger ? 'danger' : 'primary'} block onClick={onConfirm}>
            {confirmLabel}
          </Button>
          {extra}
          <Button variant="secondary" block onClick={onCancel}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
