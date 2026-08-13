import { useEffect, useState } from 'react'

import type { AccountActionId, AddAccountInput, CodexQuotaService } from '../../shared/codex-quota'
import { AddAccountDialog } from './components/AddAccountDialog'
import { AppHeader } from './components/AppHeader'
import { ConfirmDialog } from './components/ConfirmDialog'
import type { ConfirmRequest } from './components/ConfirmDialog'
import { ToastStack } from './components/ToastStack'
import { FixtureCodexQuotaService } from './lib/fixture-service'
import { shell } from './lib/shell'
import { usePreferences } from './lib/use-preferences'
import { useWorkbench } from './lib/use-workbench'
import { AccountPage } from './views/AccountPage'
import { EnvironmentView } from './views/EnvironmentView'
import { OverviewView } from './views/OverviewView'

// Under Electron the preload exposes the real service; `pnpm dev:web` has no
// preload, so the browser preview keeps rendering fixture data.
const service: CodexQuotaService = window.codexQuota ?? new FixtureCodexQuotaService()

/** Two levels deep at most: the overview, and one thing opened from it. */
type Route =
  | { kind: 'overview' }
  | { kind: 'account'; account: string }
  | { kind: 'environment' }

const CONFIRMATIONS: Partial<
  Record<AccountActionId, (account: string) => Omit<ConfirmRequest, 'onConfirm'>>
> = {
  logout: (account) => ({
    title: `Sign out of ${account}?`,
    body: 'This clears the credential stored in this profile. The account itself and its settings stay.',
    confirmLabel: 'Sign out',
    destructive: true
  }),
  'delete-auth': (account) => ({
    title: `Delete the stored credential for ${account}?`,
    body: 'Only the copy inside this profile is deleted. The credential Codex Desktop is using right now is untouched.',
    confirmLabel: 'Delete credential',
    destructive: true
  }),
  remove: (account) => ({
    title: `Remove ${account}?`,
    body: 'The account, its stored credential, and its profile folder are deleted. This cannot be undone.',
    confirmLabel: 'Remove account',
    destructive: true
  }),
  'start-window': (account) => ({
    title: `Start the quota window for ${account}?`,
    body: 'One minimal request is billed to this account so its quota window starts counting now.',
    confirmLabel: 'Start window',
    destructive: false
  })
}

export default function App(): React.JSX.Element {
  const bench = useWorkbench(service)
  const { preferences, update: updatePreferences } = usePreferences()
  const [route, setRoute] = useState<Route>({ kind: 'overview' })
  const [addOpen, setAddOpen] = useState(false)
  const [addSubmitting, setAddSubmitting] = useState(false)
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null)
  const [now, setNow] = useState(() => new Date())

  // Keeps reset countdowns honest without re-fetching anything.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  // The menu bar panel acts on the same files, so a switch made there has to
  // land here without the user thinking to refresh.
  useEffect(() => shell.onChanged(() => bench.refreshAll()), [bench.refreshAll])

  // "Open in Codex Quota" on a panel card asks for that account's page.
  useEffect(
    () => shell.onRoute((account) => setRoute(account ? { kind: 'account', account } : { kind: 'overview' })),
    []
  )

  const openAccount =
    route.kind === 'account'
      ? (bench.accounts.find((entry) => entry.account === route.account) ?? null)
      : null

  // An account can disappear underneath the page, for instance after removal.
  useEffect(() => {
    if (route.kind === 'account' && bench.registryStatus === 'ready' && openAccount === null) {
      setRoute({ kind: 'overview' })
    }
  }, [bench.registryStatus, openAccount, route])

  const requestAction = (action: AccountActionId, account: string): void => {
    if (!bench.environment) return

    if (action === 'activate' && bench.environment.desktopRunning) {
      setConfirmRequest({
        title: 'Codex Desktop is running',
        body: `Switching to ${account} now writes new credentials underneath a running app. Desktop keeps the old account until you restart it.`,
        confirmLabel: 'Switch anyway',
        destructive: false,
        acknowledgement: 'I will restart Codex Desktop after switching.',
        onConfirm: () => {
          setConfirmRequest(null)
          bench.runAction(action, account, { force: true })
        }
      })
      return
    }

    const template = CONFIRMATIONS[action]
    if (template) {
      setConfirmRequest({
        ...template(account),
        onConfirm: () => {
          setConfirmRequest(null)
          if (action === 'remove') setRoute({ kind: 'overview' })
          bench.runAction(action, account)
        }
      })
      return
    }

    bench.runAction(action, account)
  }

  const submitNewAccount = async (input: AddAccountInput): Promise<void> => {
    setAddSubmitting(true)
    const created = await bench.addAccount(input)
    setAddSubmitting(false)
    if (created) {
      setAddOpen(false)
      setRoute({ kind: 'account', account: input.account })
    }
  }

  const heading = describe(route, bench.accounts.length)

  return (
    <div className="app">
      <AppHeader
        title={heading.title}
        subtitle={heading.subtitle}
        onBack={route.kind === 'overview' ? undefined : () => setRoute({ kind: 'overview' })}
        readAt={bench.registryReadAt}
        quotaPending={bench.quotaPending}
        jobs={bench.jobs}
        now={now}
        showAddAccount={route.kind === 'overview'}
        autoSync={preferences.autoSync}
        onToggleAutoSync={(next) => updatePreferences({ autoSync: next })}
        onRefresh={bench.refreshAll}
        onAddAccount={() => setAddOpen(true)}
        onOpenSettings={() => setRoute({ kind: 'environment' })}
      />

      <main className="app__view">
        {route.kind === 'overview' ? (
          <OverviewView
            accounts={bench.accounts}
            environment={bench.environment}
            registryStatus={bench.registryStatus}
            now={now}
            jobFor={bench.jobFor}
            onOpenAccount={(account) => setRoute({ kind: 'account', account })}
            onRetryQuota={bench.refreshQuota}
            onRetryRegistry={bench.refreshAll}
            onAddAccount={() => setAddOpen(true)}
          />
        ) : null}

        {route.kind === 'account' && openAccount && bench.environment ? (
          <AccountPage
            account={openAccount}
            environment={bench.environment}
            job={bench.jobFor(openAccount.account)}
            now={now}
            onAction={(action) => requestAction(action, openAccount.account)}
            onRetryQuota={() => bench.refreshQuota(openAccount.account)}
          />
        ) : null}

        {route.kind === 'environment' ? <EnvironmentView environment={bench.environment} /> : null}
      </main>

      {addOpen ? (
        <AddAccountDialog
          existingNames={bench.accounts.map((account) => account.account)}
          submitting={addSubmitting}
          onCancel={() => setAddOpen(false)}
          onSubmit={(input) => void submitNewAccount(input)}
        />
      ) : null}

      {confirmRequest ? (
        <ConfirmDialog
          request={confirmRequest}
          submitting={false}
          onCancel={() => setConfirmRequest(null)}
        />
      ) : null}

      <ToastStack toasts={bench.toasts} onDismiss={bench.dismissToast} />
    </div>
  )
}

function describe(route: Route, accountCount: number): { title: string; subtitle: string } {
  if (route.kind === 'account') {
    return { title: route.account, subtitle: 'Account detail and the actions available for it' }
  }
  if (route.kind === 'environment') {
    return { title: 'Settings', subtitle: 'Paths and settings this bench runs against' }
  }
  return {
    title: 'Codex Quota',
    subtitle:
      accountCount === 0
        ? 'No accounts registered yet'
        : `${accountCount} account${accountCount === 1 ? '' : 's'} · open one to act on it`
  }
}
