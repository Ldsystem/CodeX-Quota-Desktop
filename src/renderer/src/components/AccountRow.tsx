import { ArrowsLeftRight, CaretRight, CheckCircle, Play, Question, Warning } from '@phosphor-icons/react'
import type { MouseEvent, SyntheticEvent } from 'react'

import { isAccountRowActionTarget } from '../../../shared/account-row-actions'
import type { AccountActionId, AccountView, EnvironmentSnapshot } from '../../../shared/codex-quota'
import { ACTION_CATALOG, WARNING_CATALOG, resolveActionAvailability } from '../../../shared/codex-quota'
import { formatPlan } from '../lib/format'
import type { RunningJob } from '../lib/use-workbench'
import { Chip } from './Chip'
import { QuotaMeter } from './QuotaMeter'

interface AccountRowProps {
  account: AccountView
  environment: EnvironmentSnapshot | null
  job?: RunningJob
  now: Date
  onOpen: (account: string) => void
  onRetryQuota: (account: string) => void
  onAction: (action: AccountActionId, account: string) => void
}

const LANDING_ACTIONS = ['activate', 'start-window'] as const

const LANDING_ICONS: Record<(typeof LANDING_ACTIONS)[number], React.ReactNode> = {
  activate: <ArrowsLeftRight size={15} weight="bold" />,
  'start-window': <Play size={15} weight="bold" />
}

/**
 * The row opens account detail from its identity control and from the rest of
 * the row except nested action buttons. Those actions are siblings of the
 * identity button so assistive tech can activate Switch/Start without opening
 * detail.
 */
export function AccountRow({
  account,
  environment,
  job,
  now,
  onOpen,
  onRetryQuota,
  onAction
}: AccountRowProps): React.JSX.Element {
  const quota = account.quota
  const email = quota.status === 'ready' ? quota.report.email : null
  const plan = quota.status === 'ready' ? quota.report.plan : null
  const warnings = [
    ...account.warnings,
    ...(quota.status === 'ready' ? quota.report.warnings : [])
  ]

  const openUnlessAction = (event: SyntheticEvent): void => {
    if (isAccountRowActionTarget(event.target)) return
    onOpen(account.account)
  }

  const openAccount = (event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation()
    onOpen(account.account)
  }

  const runAction = (event: MouseEvent<HTMLButtonElement>, action: AccountActionId): void => {
    event.stopPropagation()
    onAction(action, account.account)
  }

  return (
    <div className="account-row" onClick={openUnlessAction}>
      <div className="account-row__head">
        <button
          type="button"
          className="account-row__open"
          aria-label={`Open ${account.account}`}
          onClick={openAccount}
        >
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
        </button>
        {environment ? (
          <span className="account-row__actions">
            {LANDING_ACTIONS.map((id) => {
              const availability = resolveActionAvailability(id, account, environment)
              const running = job?.action === id
              return (
                <button
                  key={id}
                  type="button"
                  className="button button--icon"
                  data-account-action={id}
                  title={ACTION_CATALOG[id].short}
                  disabled={!availability.enabled || job !== undefined}
                  aria-label={ACTION_CATALOG[id].short}
                  onClick={(event) => runAction(event, id)}
                >
                  {running ? <span className="spinner" aria-hidden="true" /> : LANDING_ICONS[id]}
                  <span className="visually-hidden">{ACTION_CATALOG[id].short}</span>
                </button>
              )
            })}
          </span>
        ) : null}
        <CaretRight size={14} weight="bold" className="account-row__caret" aria-hidden="true" />
      </div>

      <QuotaMeter state={quota} now={now} onRetry={() => onRetryQuota(account.account)} />
    </div>
  )
}
