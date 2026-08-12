import { CheckCircle, WarningCircle, X } from '@phosphor-icons/react'
import { useEffect } from 'react'

export interface ToastMessage {
  id: number
  ok: boolean
  title: string
  detail?: string
  backupPath?: string
}

interface ToastStackProps {
  toasts: ToastMessage[]
  onDismiss: (id: number) => void
}

const AUTO_DISMISS_MS = 6000

export function ToastStack({ toasts, onDismiss }: ToastStackProps): React.JSX.Element | null {
  useEffect(() => {
    if (toasts.length === 0) return
    const timers = toasts.map((toast) => setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS))
    return () => timers.forEach(clearTimeout)
  }, [toasts, onDismiss])

  if (toasts.length === 0) return null

  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast${toast.ok ? '' : ' toast--error'}`}>
          {toast.ok ? (
            <CheckCircle size={18} weight="bold" color="var(--accent)" />
          ) : (
            <WarningCircle size={18} weight="bold" color="var(--danger)" />
          )}
          <div>
            <div className="toast__title">{toast.title}</div>
            {toast.detail ? <div className="toast__detail">{toast.detail}</div> : null}
            {toast.backupPath ? (
              <code className="toast__path numeric">Backup: {toast.backupPath}</code>
            ) : null}
          </div>
          <button
            type="button"
            className="toast__close"
            aria-label="Dismiss notification"
            onClick={() => onDismiss(toast.id)}
          >
            <X size={14} weight="bold" />
          </button>
        </div>
      ))}
    </div>
  )
}
