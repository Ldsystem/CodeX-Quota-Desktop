import {
  ArrowClockwise,
  ArrowsLeftRight,
  CheckCircle,
  DownloadSimple,
  Key,
  Play,
  Question,
  SignIn,
  SignOut,
  Trash
} from '@phosphor-icons/react'
import type { ReactNode } from 'react'

import type {
  AccountActionId,
  AccountView,
  EnvironmentSnapshot,
  QuotaReport,
  QuotaSource,
  QuotaState,
  TriState
} from '../../../shared/codex-quota'
import {
  ACTION_CATALOG,
  PROFILE_MODE_COPY,
  WARNING_CATALOG,
  resolveActionAvailability
} from '../../../shared/codex-quota'
import { Chip } from '../components/Chip'
import { Panel } from '../components/Panel'
import { QuotaMeter } from '../components/QuotaMeter'
import { TokenActivity } from '../components/TokenActivity'
import {
  formatExpiry,
  formatFetchedAt,
  formatPlan,
  formatResetAt,
  formatTokens
} from '../lib/format'
import type { RunningJob } from '../lib/use-workbench'

interface AccountPageProps {
  account: AccountView
  environment: EnvironmentSnapshot
  job?: RunningJob
  now: Date
  onAction: (action: AccountActionId) => void
  onRetryQuota: () => void
}

const ICONS: Record<AccountActionId, ReactNode> = {
  activate: <ArrowsLeftRight size={15} weight="bold" />,
  'import-active': <DownloadSimple size={15} weight="bold" />,
  login: <SignIn size={15} weight="bold" />,
  'start-window': <Play size={15} weight="bold" />,
  logout: <SignOut size={15} weight="bold" />,
  'delete-auth': <Key size={15} weight="bold" />,
  remove: <Trash size={15} weight="bold" />
}

const ORDER: AccountActionId[] = [
  'activate',
  'import-active',
  'login',
  'start-window',
  'logout',
  'delete-auth',
  'remove'
]

export function AccountPage({
  account,
  environment,
  job,
  now,
  onAction,
  onRetryQuota
}: AccountPageProps): React.JSX.Element {
  const quota = account.quota
  const report = quota.status === 'ready' ? quota.report : null
  const warnings = [...account.warnings, ...(report?.warnings ?? [])]
  const tokenUsage = report?.tokenUsage ?? null

  return (
    <div className="account-page">
      <header className="account-page__head">
        <div className="account-page__identity">
          <h2 className="account-page__name numeric">{account.account}</h2>
          <span className="account-page__email">
            {report?.email ?? 'No email on file'} · {PROFILE_MODE_COPY[account.profileMode].label}
          </span>
        </div>
        <div className="account-page__badges">
          {account.active === 'yes' ? (
            <Chip tone="accent" icon={<CheckCircle size={12} weight="bold" />}>
              In use by Codex Desktop
            </Chip>
          ) : null}
          {account.active === 'unknown' ? (
            <Chip tone="warn" icon={<Question size={12} weight="bold" />}>
              Active unclear
            </Chip>
          ) : null}
          {report?.plan ? <Chip>{formatPlan(report.plan)}</Chip> : null}
        </div>
        <div className="account-page__meter">
          <QuotaMeter state={quota} now={now} onRetry={onRetryQuota} />
        </div>
      </header>

      <div className="account-page__grid">
        <div className="account-page__main">
          {tokenUsage ? (
            <Panel
              title="Token activity"
              subtitle={`${formatTokens(tokenUsage.lifetimeTokens)} tokens in total${
                tokenUsage.since ? ` since ${formatExpiry(tokenUsage.since)}` : ''
              }`}
            >
              <TokenActivity usage={tokenUsage} />
            </Panel>
          ) : null}

          <Panel
            title="Subscription and quota"
            aside={<QuotaStatusNote state={quota} now={now} onRetry={onRetryQuota} />}
          >
            <div className="fact-grid">
              <Fact
                label="Plan"
                value={report ? formatPlan(report.plan) : null}
                pending={quota.status === 'loading'}
              />
              <Fact
                label="Renews or ends"
                value={report ? formatExpiry(report.subscriptionExpiresOn) : null}
                pending={quota.status === 'loading'}
              />
              <Fact
                label="Weekly window resets"
                value={report ? formatResetAt(report.weekly.resetAt, now) : null}
                pending={quota.status === 'loading'}
              />
              <Fact
                label="Resets available"
                value={resetCreditsLabel(report)}
                pending={quota.status === 'loading'}
              />
            </div>
          </Panel>

          <Panel title="Credential state">
            <div className="fact-grid">
              <Fact label="Stored credential" value={account.hasStoredAuth ? 'Present' : 'None'} />
              <Fact label="Access token" value={triStateLabel(account.hasAccessToken)} />
              <Fact label="Refresh token" value={triStateLabel(account.hasRefreshToken)} />
              <Fact
                label="Usage source"
                value={report ? sourceLabel(report.source) : null}
                pending={quota.status === 'loading'}
              />
            </div>
            <div className="path-list">
              <PathFact
                label="Profile"
                value={`${environment.storageRoot}/accounts/${account.account}`}
              />
              <PathFact label="Live credential" value={environment.liveAuthPath} />
            </div>
          </Panel>

          {warnings.length > 0 ? (
            <Panel title="Needs attention">
              <ul className="warning-list">
                {warnings.map((warning) => (
                  <li key={warning} className="warning-item">
                    <span className="warning-item__title">{WARNING_CATALOG[warning].label}</span>
                    <span className="warning-item__body">{WARNING_CATALOG[warning].meaning}</span>
                    <span className="warning-item__fix">{WARNING_CATALOG[warning].fix}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>

        <div className="account-page__aside">
          <Panel title="Actions">
            <div className="action-list">
              {ORDER.map((id) => {
                const availability = resolveActionAvailability(id, account, environment)
                const running = job?.action === id
                const variant =
                  id === 'activate'
                    ? ' button--primary'
                    : availability.destructive
                      ? ' button--danger'
                      : ''
                return (
                  <div className="action" key={id}>
                    <button
                      type="button"
                      className={`button button--block${variant}`}
                      disabled={!availability.enabled || job !== undefined}
                      aria-describedby={availability.reason ? `${id}-note` : undefined}
                      onClick={() => onAction(id)}
                    >
                      {running ? <span className="spinner" aria-hidden="true" /> : ICONS[id]}
                      {running ? `${ACTION_CATALOG[id].running}…` : ACTION_CATALOG[id].label}
                    </button>
                    {availability.reason ? (
                      <p className="action-note" id={`${id}-note`}>
                        {availability.reason}
                      </p>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}

function QuotaStatusNote({
  state,
  now,
  onRetry
}: {
  state: QuotaState
  now: Date
  onRetry: () => void
}): React.JSX.Element | null {
  if (state.status === 'loading') return <span className="panel__pending">fetching</span>
  if (state.status === 'idle') return <span className="panel__pending">not fetched</span>
  if (state.status === 'failed') {
    return (
      <button type="button" className="link-button" onClick={onRetry}>
        <ArrowClockwise size={12} weight="bold" />
        retry
      </button>
    )
  }
  return <span className="panel__pending">{formatFetchedAt(state.report.fetchedAt, now)}</span>
}

function Fact({
  label,
  value,
  pending
}: {
  label: string
  value: string | null
  pending?: boolean
}): React.JSX.Element {
  return (
    <div className="fact">
      <span className="fact__label">{label}</span>
      {pending ? (
        <span className="skeleton skeleton--fact" aria-hidden="true" />
      ) : (
        <span className={`fact__value${value === null ? ' fact__value--muted' : ''}`}>
          {value ?? 'Unavailable'}
        </span>
      )}
    </div>
  )
}

function PathFact({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="path">
      <span className="path__label">{label}</span>
      <code className="path__value numeric">{value}</code>
    </div>
  )
}

function resetCreditsLabel(report: QuotaReport | null): string | null {
  if (report === null) return null
  return report.availableResetCredits === null ? 'Unknown' : String(report.availableResetCredits)
}

function triStateLabel(value: TriState): string {
  if (value === 'yes') return 'Present'
  if (value === 'no') return 'Missing'
  return 'Unreadable'
}

function sourceLabel(source: QuotaSource): string {
  if (source === 'codex-oauth') return 'Usage API'
  if (source === 'codex-oauth-partial') return 'Token claims only'
  return 'None'
}