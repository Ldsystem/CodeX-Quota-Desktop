import { useState } from 'react'

import { Dialog } from './Dialog'

export interface ConfirmRequest {
  title: string
  body: string
  confirmLabel: string
  destructive: boolean
  /** When set, the confirm button stays disabled until the box is ticked. */
  acknowledgement?: string
  onConfirm: () => void
}

interface ConfirmDialogProps {
  request: ConfirmRequest
  submitting: boolean
  onCancel: () => void
}

export function ConfirmDialog({ request, submitting, onCancel }: ConfirmDialogProps): React.JSX.Element {
  const [acknowledged, setAcknowledged] = useState(false)
  const blocked = request.acknowledgement !== undefined && !acknowledged

  return (
    <Dialog
      title={request.title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="button button--quiet" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className={`button ${request.destructive ? 'button--danger' : 'button--primary'}`}
            onClick={request.onConfirm}
            disabled={submitting || blocked}
          >
            {submitting ? <span className="button__spinner" aria-hidden="true" /> : null}
            {submitting ? 'Working' : request.confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{request.body}</p>
      {request.acknowledgement ? (
        <label className="choice">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span className="choice__description">{request.acknowledgement}</span>
        </label>
      ) : null}
    </Dialog>
  )
}
