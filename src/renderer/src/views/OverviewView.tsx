import {
  ArrowsLeftRight,
  Clock,
  Coins,
  Monitor,
  Plus,
  UsersThree,
  WarningCircle
} from '@phosphor-icons/react'

import {
  isQuotaSpent,
  isReadyToSwitch,
  type AccountView,
  type EnvironmentSnapshot
} from '../../../shared/codex-quota'
import { AccountRow } from '../components/AccountRow'
import { StatCard } from '../components/StatCard'
import { formatCountdown, formatResetAt, formatTokens } from '../lib/format'
import type { RunningJob } from '../lib/use-workbench'

interface OverviewViewProps {
  accounts: AccountView[]
  environment: EnvironmentSnapshot | null
  registryStatus: 'loading' | 'ready' | 'failed'
  now: Date
  jobFor: (account: string) => RunningJob | undefined
  onOpenAccount: (account: string) => void
  onRetryQuota: (account: string) => void
  onRetryRegistry: () => void
  onAddAccount: () => void
}

export function OverviewView({
  accounts,
  environment,
  registryStatus,
  now,
  jobFor,
  onOpenAccount,
  onRetryQuota,
  onRetryRegistry,
  onAddAccount
}: OverviewViewProps): React.JSX.Element {
  if (registryStatus === 'failed') {
    return (
      <div className="placeholder">
        <WarningCircle size={26} weight="bold" className="placeholder__icon" />
        <h2 className="placeholder__title">Account state could not be read</h2>
        <p className="placeholder__body">
          The registry under the storage root did not respond. Nothing was changed.
        </p>
        <button type="button" className="button" onClick={onRetryRegistry}>
          Try again
        </button>
      </div>
    )
  }

  const ready = accounts.filter(isReadyToSwitch)
  const spent = accounts.filter(
    (account) =>
      account.profileMode === 'desktop_preserving' &&
      account.hasStoredAuth &&
      isQuotaSpent(account.quota)
  )
  const active = accounts.find((account) => account.active === 'yes')

  const lifetime = accounts.reduce<{ tokens: number; accounts: number }>(
    (total, account) => {
      if (account.quota.status !== 'ready' || account.quota.report.tokenUsage === null) return total
      return {
        tokens: total.tokens + account.quota.report.tokenUsage.lifetimeTokens,
        accounts: total.accounts + 1
      }
    },
    { tokens: 0, accounts: 0 }
  )
  const anyPending = accounts.some((account) => account.quota.status === 'loading')

  const nextReset = accounts
    .flatMap((account) =>
      account.quota.status === 'ready' && account.quota.report.window.resetAt !== null
        ? [{ account: account.account, resetAt: account.quota.report.window.resetAt }]
        : []
    )
    .sort((a, b) => a.resetAt - b.resetAt)[0]

  return (
    <>
      <div className="stat-grid">
        <StatCard
          label="Ready to switch"
          value={`${ready.length}/${accounts.length}`}
          note={[
            active ? `${active.account} in use` : 'no account is in use',
            spent.length > 0 ? `${spent.length} out of quota` : null
          ]
            .filter(Boolean)
            .join(' · ')}
          icon={<ArrowsLeftRight size={15} weight="bold" />}
          tone={active ? 'accent' : 'neutral'}
        />

        {/* The usage API reports no token history, so this card stays hidden
            unless some account ever starts returning one. */}
        {lifetime.accounts > 0 ? (
          <StatCard
            label="Lifetime tokens"
            value={formatTokens(lifetime.tokens)}
            note={`across ${lifetime.accounts} account${lifetime.accounts === 1 ? '' : 's'}`}
            icon={<Coins size={15} weight="bold" />}
          />
        ) : null}

        <StatCard
          label="Next quota reset"
          value={nextReset ? (formatCountdown(nextReset.resetAt, now) ?? 'due now') : 'None'}
          note={
            nextReset
              ? `${nextReset.account}, ${formatResetAt(nextReset.resetAt, now)}`
              : anyPending
                ? 'waiting on usage figures'
                : 'no reset times reported'
          }
          icon={<Clock size={15} weight="bold" />}
          pending={anyPending && !nextReset}
        />

        <StatCard
          label="Codex Desktop"
          value={environment?.desktopRunning ? 'Running' : 'Not running'}
          note={
            environment?.desktopRunning
              ? 'restart it after switching'
              : 'switching applies immediately'
          }
          icon={<Monitor size={15} weight="bold" />}
          tone={environment?.desktopRunning ? 'warn' : 'neutral'}
          pending={environment === null}
        />
      </div>

      <section className="account-list" aria-label="Accounts">
        {registryStatus === 'loading' ? <SkeletonRows /> : null}

        {registryStatus === 'ready' && accounts.length === 0 ? (
          <div className="placeholder">
            <UsersThree size={26} weight="bold" className="placeholder__icon" />
            <h2 className="placeholder__title">No accounts yet</h2>
            <p className="placeholder__body">
              Add an account to store its credentials separately, then import the one Codex Desktop
              is using.
            </p>
            <button type="button" className="button button--primary" onClick={onAddAccount}>
              <Plus size={15} weight="bold" />
              Add account
            </button>
          </div>
        ) : null}

        {accounts.map((account) => (
          <AccountRow
            key={account.account}
            account={account}
            job={jobFor(account.account)}
            now={now}
            onOpen={onOpenAccount}
            onRetryQuota={onRetryQuota}
          />
        ))}
      </section>
    </>
  )
}

function SkeletonRows(): React.JSX.Element {
  return (
    <>
      {[0, 1, 2].map((index) => (
        <div className="account-row account-row--skeleton" key={index} aria-hidden="true">
          <div className="skeleton skeleton--title" />
          <div className="skeleton skeleton--line" />
        </div>
      ))}
      <span className="visually-hidden" role="status">
        Reading account state
      </span>
    </>
  )
}
