import { ArrowSquareOut, CheckCircle, Warning } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

import type { AccountView, EnvironmentSnapshot } from '../../../shared/codex-quota'
import { ACTION_CATALOG, WARNING_CATALOG, resolveActionAvailability } from '../../../shared/codex-quota'
import { Chip } from '../components/Chip'
import { QuotaMeter } from '../components/QuotaMeter'
import { formatPlan } from '../lib/format'
import type { RunningJob } from '../lib/use-workbench'

interface AccountCardProps {
  account: AccountView
  environment: EnvironmentSnapshot
  job?: RunningJob
  now: Date
  onActivate: (force: boolean) => void
  onOpen: () => void
  onRetryQuota: () => void
}

/**
 * One account, sized to be read at a glance and acted on with one click.
 *
 * Switching under a running Codex Desktop needs an acknowledgement, which the
 * workbench collects in a dialog. There is no room for a dialog here, so the
 * button asks the same question in place and only switches on the second
 * click.
 */
export function AccountCard({
  account,
  environment,
  job,
  now,
  onActivate,
  onOpen,
  onRetryQuota
}: AccountCardProps): React.JSX.Element {
  const [armed, setArmed] = useState(false)
  const quota = account.quota
  const email = quota.status === 'ready' ? quota.report.email : null
  const plan = quota.status === 'ready' ? quota.report.plan : null
  const warnings = [...account.warnings, ...(quota.status === 'ready' ? quota.report.warnings : [])]
  const availability = resolveActionAvailability('activate', account, environment)
  const busy = job !== undefined
  const live = account.active === 'yes'

  // Quitting Desktop while the card is armed takes the question away with it.
  useEffect(() => {
    if (!environment.desktopRunning) setArmed(false)
  }, [environment.desktopRunning])

  const click = (): void => {
    if (environment.desktopRunning && !armed) {
      setArmed(true)
      return
    }
    setArmed(false)
    onActivate(environment.desktopRunning)
  }

  const label = live
    ? 'Already in use'
    : busy
      ? ACTION_CATALOG[job.action].running
      : armed
        ? 'Switch anyway'
        : 'Switch to this account'

  return (
    <article className="card" aria-label={account.account}>
      <header className="card__head">
        <span className={`dot${live ? ' dot--live' : ' dot--idle'}`} aria-hidden="true" />
        <span className="card__identity">
          <span className="card__name numeric">{account.account}</span>
          <span className="card__email">
            {email ?? (quota.status === 'loading' ? 'reading identity' : 'no email on file')}
          </span>
        </span>
        {live ? (
          <Chip tone="accent" icon={<CheckCircle size={12} weight="bold" />}>
            In use
          </Chip>
        ) : plan ? (
          <Chip>{formatPlan(plan)}</Chip>
        ) : null}
      </header>

      <QuotaMeter state={quota} now={now} onRetry={onRetryQuota} />

      {warnings.length > 0 ? (
        <div className="card__warnings">
          {warnings.slice(0, 2).map((warning) => (
            <Chip
              key={warning}
              tone={warning === 'corrupt-auth' ? 'danger' : 'warn'}
              icon={<Warning size={12} weight="bold" />}
            >
              {WARNING_CATALOG[warning].label}
            </Chip>
          ))}
        </div>
      ) : null}

      <div className="card__actions">
        <button
          type="button"
          // Only the button that will actually switch something looks primary;
          // a green button that cannot be pressed reads as the app being broken.
          className={`button${availability.enabled && !live ? ' button--primary' : ''}${armed ? ' button--armed' : ''}`}
          disabled={!availability.enabled || busy}
          onClick={click}
        >
          {busy ? <span className="spinner" aria-hidden="true" /> : null}
          {label}
        </button>
        <button type="button" className="link-button" onClick={onOpen}>
          <ArrowSquareOut size={12} weight="bold" />
          Open in Codex Quota
        </button>
      </div>

      <p className="card__note">
        {armed
          ? 'Codex Desktop is running. It keeps the old account until you restart it.'
          : (availability.reason ?? 'The live credential is backed up before it is replaced.')}
      </p>
    </article>
  )
}
