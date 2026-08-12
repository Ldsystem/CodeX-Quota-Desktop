import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'

interface DialogProps {
  title: string
  onClose: () => void
  children: ReactNode
  footer: ReactNode
}

export function Dialog({ title, onClose, children, footer }: DialogProps): React.JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    panelRef.current?.querySelector<HTMLElement>('input, button, select')?.focus()
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="dialog-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panelRef}>
        <h2 className="dialog__title" id={titleId}>
          {title}
        </h2>
        <div className="dialog__body">{children}</div>
        <div className="dialog__footer">{footer}</div>
      </div>
    </div>
  )
}
