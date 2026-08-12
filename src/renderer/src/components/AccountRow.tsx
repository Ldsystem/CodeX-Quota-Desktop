import { CaretRight, CheckCircle, Question, Warning } from '@phosphor-icons/react'
import type { KeyboardEvent } from 'react'

import type { AccountView } from '../../../shared/codex-quota'
import { ACTION_CATALOG, WARNING_CATALOG } from '../../../shared/codex-quota'
import { formatPlan } from '../lib/format'
import type { RunningJob } from '../lib/use-workbench'
import { Chip } from './Chip'
import { QuotaMeter } from './QuotaMeter'

interface AccountRowProps {
  account: AccountView
  job?: RunningJob
  now: Date
  onOpen: (account: string) => void
  onRetryQuota: (account: string) => void
}

/**
 * The row is the navigation: opening it goes to that account's page. It is a
 * div rather than a button because it hosts its own retry control.
 */
export function AccountRow({
  account,
  job,
  now,
  onOpen,
  onRetryQuota
}: AccountRowProps): React.JSX.Element {
  const quota = account.quota
  const email = quota.status === 'ready' ? quota.report.email : null
  const plan = quota.status === 'ready' ? quota.report.plan : null
  const warnings = [
    ...account.warnings,
    ...(quota.status === 'ready' ? quota.report.warnings : [])
  ]

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpen(account.account)
    }
  }

  return (
    <div
      className="account-row"
      role="button"
      tabIndex={0}
      aria-label={`Open ${account.account}`}
      onClick={() => onOpen(account.account)}
      onKeyDown={onKeyDown}
    >
      <div className="account-row__head">
        <span
          className={`dot${account.active === 'yes' ? ' dot--live' : ' dot--idle'}`}
          aria-hidden="true"
        />
        <span className="account-row__identity">
          <span className="account-row__name numeric">{account.account}</span>
          <span className="account-row__email">
            {email ?? (quota.status === 'loading' ? 'reading identity' : 'no email on file')}
          </span>
        </span>
        <span className="account-row__badges">
          {job ? (
            <Chip tone="accent" icon={<span className="spinner spinner--accent" aria-hidden="true" />}>
              {ACTION_CATALOG[job.action].running}
            </Chip>
          ) : null}
          {account.active === 'yes' ? (
            <Chip tone="accent" icon={<CheckCircle size={12} weight="bold" />}>
              In use
            </Chip>
          ) : null}
          {account.active === 'unknown' ? (
            <Chip tone="warn" icon={<Question size={12} weight="bold" />}>
              Active unclear
            </Chip>
          ) : null}
          {plan ? <Chip>{formatPlan(plan)}</Chip> : null}
          {account.profileMode === 'cli_isolated' ? <Chip>CLI only</Chip> : null}
          {warnings.map((warning) => (
            <Chip
              key={warning}
              tone={warning === 'corrupt-auth' ? 'danger' : 'warn'}
              icon={<Warning size={12} weight="bold" />}
            >
              {WARNING_CATALOG[warning].label}
            </Chip>
          ))}
        </span>
        <CaretRight size={14} weight="bold" className="account-row__caret" />
      </div>

      <QuotaMeter state={quota} now={now} onRetry={() => onRetryQuota(account.account)} />
    </div>
  )
}
