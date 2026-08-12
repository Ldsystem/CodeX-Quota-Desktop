/**
 * Workbench state.
 *
 * Nothing here awaits on behalf of the interface. The registry read paints the
 * bench; each account's quota fetch and each action run as independent jobs
 * that only ever narrow their own slice of state. Several accounts can be
 * signing in, switching, and refreshing at the same time, and the rest of the
 * app stays interactive throughout.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  AccountActionId,
  AccountView,
  AddAccountInput,
  CodexQuotaService,
  EnvironmentSnapshot,
  QuotaState,
  RegistrySnapshot
} from '../../../shared/codex-quota'
import type { ToastMessage } from '../components/ToastStack'

export interface RunningJob {
  account: string
  action: AccountActionId
  startedAt: number
}

export interface WorkbenchState {
  accounts: AccountView[]
  environment: EnvironmentSnapshot | null
  registryReadAt: string | null
  registryStatus: 'loading' | 'ready' | 'failed'
  quotaPending: number
  jobs: RunningJob[]
  toasts: ToastMessage[]
  jobFor: (account: string) => RunningJob | undefined
  refreshAll: () => void
  refreshQuota: (account: string) => void
  runAction: (action: AccountActionId, account: string) => void
  addAccount: (input: AddAccountInput) => Promise<boolean>
  dismissToast: (id: number) => void
}

/** Actions whose result changes what the usage API would say. */
const REFETCH_AFTER: AccountActionId[] = ['import-active', 'login', 'start-window']

export function useWorkbench(service: CodexQuotaService): WorkbenchState {
  const [registry, setRegistry] = useState<RegistrySnapshot | null>(null)
  const [registryStatus, setRegistryStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [quota, setQuota] = useState<Record<string, QuotaState>>({})
  const [jobs, setJobs] = useState<RunningJob[]>([])
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const toastId = useRef(0)
  const mounted = useRef(true)
  // Late responses from a superseded fetch must not overwrite a newer one.
  const fetchGeneration = useRef<Record<string, number>>({})

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const pushToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    toastId.current += 1
    const id = toastId.current
    setToasts((current) => [...current, { ...toast, id }])
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const refreshQuota = useCallback(
    (account: string) => {
      const generation = (fetchGeneration.current[account] ?? 0) + 1
      fetchGeneration.current[account] = generation
      setQuota((current) => ({ ...current, [account]: { status: 'loading' } }))

      void service
        .fetchQuota(account)
        .then((report) => {
          if (!mounted.current || fetchGeneration.current[account] !== generation) return
          setQuota((current) => ({ ...current, [account]: { status: 'ready', report } }))
        })
        .catch((error: unknown) => {
          if (!mounted.current || fetchGeneration.current[account] !== generation) return
          setQuota((current) => ({
            ...current,
            [account]: {
              status: 'failed',
              message: error instanceof Error ? error.message : 'Usage could not be read.'
            }
          }))
        })
    },
    [service]
  )

  const readRegistry = useCallback(
    (options?: { thenFetchQuota?: boolean }) => {
      void service
        .readRegistry()
        .then((snapshot) => {
          if (!mounted.current) return
          setRegistry(snapshot)
          setRegistryStatus('ready')
          // Drop cached quota for accounts that no longer exist.
          setQuota((current) => {
            const next: Record<string, QuotaState> = {}
            for (const record of snapshot.accounts) {
              next[record.account] = current[record.account] ?? { status: 'idle' }
            }
            return next
          })
          if (options?.thenFetchQuota) {
            for (const record of snapshot.accounts) refreshQuota(record.account)
          }
        })
        .catch(() => {
          if (!mounted.current) return
          setRegistryStatus('failed')
        })
    },
    [refreshQuota, service]
  )

  useEffect(() => {
    readRegistry({ thenFetchQuota: true })
  }, [readRegistry])

  const runAction = useCallback(
    (action: AccountActionId, account: string) => {
      setJobs((current) => [...current, { account, action, startedAt: Date.now() }])

      const finish = (): void => {
        if (!mounted.current) return
        setJobs((current) =>
          current.filter((job) => !(job.account === account && job.action === action))
        )
      }

      void callAction(service, action, account)
        .then((outcome) => {
          if (!mounted.current) return
          pushToast({
            ok: outcome.ok,
            title: outcome.title,
            detail: outcome.detail,
            backupPath: outcome.backupPath
          })
          readRegistry()
          if (REFETCH_AFTER.includes(action)) refreshQuota(account)
        })
        .catch((error: unknown) => {
          if (!mounted.current) return
          pushToast({
            ok: false,
            title: `Could not complete "${action.replace('-', ' ')}" for ${account}`,
            detail: error instanceof Error ? error.message : undefined
          })
        })
        .finally(finish)
    },
    [pushToast, readRegistry, refreshQuota, service]
  )

  const addAccount = useCallback(
    async (input: AddAccountInput): Promise<boolean> => {
      try {
        const outcome = await service.addAccount(input)
        pushToast({ ok: outcome.ok, title: outcome.title, detail: outcome.detail })
        readRegistry()
        return outcome.ok
      } catch {
        pushToast({ ok: false, title: 'Could not create the account' })
        return false
      }
    },
    [pushToast, readRegistry, service]
  )

  const refreshAll = useCallback(() => {
    readRegistry({ thenFetchQuota: true })
  }, [readRegistry])

  const accounts = useMemo<AccountView[]>(
    () =>
      (registry?.accounts ?? []).map((record) => ({
        ...record,
        quota: quota[record.account] ?? { status: 'idle' }
      })),
    [quota, registry]
  )

  const jobFor = useCallback(
    (account: string) => jobs.find((job) => job.account === account),
    [jobs]
  )

  return {
    accounts,
    environment: registry?.environment ?? null,
    registryReadAt: registry?.readAt ?? null,
    registryStatus,
    quotaPending: accounts.filter((account) => account.quota.status === 'loading').length,
    jobs,
    toasts,
    jobFor,
    refreshAll,
    refreshQuota,
    runAction,
    addAccount,
    dismissToast
  }
}

function callAction(
  service: CodexQuotaService,
  action: AccountActionId,
  account: string
): ReturnType<CodexQuotaService['activate']> {
  switch (action) {
    case 'activate':
      return service.activate(account, { force: true })
    case 'import-active':
      return service.importActive(account)
    case 'login':
      return service.login(account)
    case 'start-window':
      return service.startQuotaWindow(account)
    case 'logout':
      return service.logout(account)
    case 'delete-auth':
      return service.deleteStoredAuth(account)
    case 'remove':
      return service.removeAccount(account)
  }
}
