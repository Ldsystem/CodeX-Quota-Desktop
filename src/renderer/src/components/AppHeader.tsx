import { ArrowLeft, ArrowsClockwise, Gear, Plus, Terminal } from '@phosphor-icons/react'

import { ACTION_CATALOG } from '../../../shared/codex-quota'
import { formatFetchedAt } from '../lib/format'
import type { RunningJob } from '../lib/use-workbench'

interface AppHeaderProps {
  title: string
  subtitle: string
  /** Absent on the root view, where there is nothing to go back to. */
  onBack?: () => void
  readAt: string | null
  quotaPending: number
  jobs: RunningJob[]
  now: Date
  showAddAccount: boolean
  autoSync: boolean
  onToggleAutoSync: (next: boolean) => void
  onRefresh: () => void
  onAddAccount: () => void
  onOpenSettings: () => void
}

export function AppHeader({
  title,
  subtitle,
  onBack,
  readAt,
  quotaPending,
  jobs,
  now,
  showAddAccount,
  autoSync,
  onToggleAutoSync,
  onRefresh,
  onAddAccount,
  onOpenSettings
}: AppHeaderProps): React.JSX.Element {
  return (
    <header className="header">
      {onBack ? (
        <button type="button" className="button button--icon header__back" onClick={onBack}>
          <ArrowLeft size={16} weight="bold" />
          <span className="visually-hidden">Back</span>
        </button>
      ) : (
        <span className="header__mark" aria-hidden="true">
          <Terminal size={15} weight="bold" />
        </span>
      )}

      <div className="header__heading">
        <h1 className="header__title">{title}</h1>
        <span className="header__subtitle">{subtitle}</span>
      </div>

      <div className="header__status" role="status">
        {jobs.length > 0 ? (
          <span className="pill pill--busy">
            <span className="spinner spinner--accent" aria-hidden="true" />
            {jobs.length === 1
              ? `${ACTION_CATALOG[jobs[0]!.action].running} ${jobs[0]!.account}`
              : `${jobs.length} jobs running`}
          </span>
        ) : quotaPending > 0 ? (
          <span className="pill">
            <span className="spinner spinner--accent" aria-hidden="true" />
            Fetching usage
          </span>
        ) : readAt ? (
          <span className="pill">Read {formatFetchedAt(readAt, now)}</span>
        ) : (
          <span className="pill">Reading local state</span>
        )}
      </div>

      <div className="header__tools">
        <button
          type="button"
          className={`switch${autoSync ? ' switch--on' : ''}`}
          role="switch"
          aria-checked={autoSync}
          onClick={() => onToggleAutoSync(!autoSync)}
          title={
            autoSync
              ? 'Automatic sync is on: usage is re-read on a timer, and a quota window that never started is started for you so its reset comes sooner. Details in Settings.'
              : 'Automatic sync is off: nothing is read or spent unless you ask for it.'
          }
        >
          <span className="switch__track" aria-hidden="true">
            <span className="switch__knob" />
          </span>
          Auto
        </button>
        <button type="button" className="button button--icon" onClick={onRefresh} title="Re-read everything">
          <ArrowsClockwise size={16} weight="bold" />
          <span className="visually-hidden">Refresh</span>
        </button>
        {showAddAccount ? (
          <button type="button" className="button button--primary" onClick={onAddAccount}>
            <Plus size={15} weight="bold" />
            Add account
          </button>
        ) : null}
        <button type="button" className="button button--icon" onClick={onOpenSettings} title="Settings">
          <Gear size={16} weight="bold" />
          <span className="visually-hidden">Settings</span>
        </button>
      </div>
    </header>
  )
}
