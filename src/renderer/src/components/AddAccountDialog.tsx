import { WarningCircle } from '@phosphor-icons/react'
import { useId, useState } from 'react'

import type { AddAccountInput, ProfileMode } from '../../../shared/codex-quota'
import { PROFILE_MODE_COPY, validateAccountName } from '../../../shared/codex-quota'
import { Dialog } from './Dialog'

interface AddAccountDialogProps {
  existingNames: readonly string[]
  submitting: boolean
  onCancel: () => void
  onSubmit: (input: AddAccountInput) => void
}

const MODES: ProfileMode[] = ['desktop_preserving', 'cli_isolated']

export function AddAccountDialog({
  existingNames,
  submitting,
  onCancel,
  onSubmit
}: AddAccountDialogProps): React.JSX.Element {
  const [name, setName] = useState('')
  const [mode, setMode] = useState<ProfileMode>('desktop_preserving')
  const [touched, setTouched] = useState(false)
  const nameId = useId()
  const hintId = useId()
  const errorId = useId()

  const error = validateAccountName(name, existingNames)
  const showError = touched && error !== null

  const submit = (): void => {
    setTouched(true)
    if (error !== null) return
    onSubmit({ account: name.trim(), profileMode: mode })
  }

  return (
    <Dialog
      title="Add an account"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="button button--quiet" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="button button--primary" onClick={submit} disabled={submitting}>
            {submitting ? <span className="button__spinner" aria-hidden="true" /> : null}
            {submitting ? 'Creating' : 'Create account'}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field__label" htmlFor={nameId}>
          Account name
        </label>
        <input
          id={nameId}
          className="field__input numeric"
          value={name}
          placeholder="plus_02"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={showError}
          aria-describedby={showError ? errorId : hintId}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => setTouched(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit()
          }}
        />
        {showError ? (
          <span className="field__error" id={errorId} role="alert">
            <WarningCircle size={14} weight="bold" />
            {error}
          </span>
        ) : (
          <span className="field__hint" id={hintId}>
            Letters, numbers, and the characters . _ - are allowed.
          </span>
        )}
      </div>

      <fieldset className="field" style={{ border: 0, margin: 0, padding: 0 }}>
        <legend className="field__label">How this profile is used</legend>
        <div className="choice-group">
          {MODES.map((value) => (
            <label className="choice" key={value}>
              <input
                type="radio"
                name="profile-mode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              <span>
                <span className="choice__title">{PROFILE_MODE_COPY[value].label}</span>
                <br />
                <span className="choice__description">{PROFILE_MODE_COPY[value].description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <p style={{ margin: 0 }}>
        Creating an account only reserves the name and its folder. Sign in or import a credential afterwards.
      </p>
    </Dialog>
  )
}
