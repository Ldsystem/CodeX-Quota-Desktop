/**
 * Domain model for Codex account management.
 *
 * The shapes here are the port target of the legacy bash CLI: every command,
 * profile mode, warning label and status column it produces has a typed
 * counterpart. The renderer consumes only `CodexQuotaService`, so the native
 * implementation can replace the fixture one without UI changes.
 *
 * Reads are split in two on purpose. `readRegistry` answers from local files
 * and is expected to be instant; `fetchQuota` talks to the network for one
 * account at a time. The UI renders the first without waiting for the second,
 * so a slow or unreachable usage API never holds the workbench hostage.
 */

export type ProfileMode = 'desktop_preserving' | 'cli_isolated'

/** The CLI prints `yes` / `no` / `?` for facts it cannot determine. */
export type TriState = 'yes' | 'no' | 'unknown'

export type WarningLabel =
  | 'no-auth'
  | 'corrupt-auth'
  | 'active-drift'
  | 'desktop-running'
  | 'quota-unavailable'
  | 'quota-partial'
  | 'quota-stub'

export type QuotaSource = 'codex-oauth' | 'codex-oauth-partial' | 'unknown'

/** One allowance window. Its duration travels with the values from the API. */
export interface QuotaWindow {
  /** 0-100, or null when the usage API did not return a figure. */
  usedPercent: number | null
  /** Epoch seconds, or null when unknown. */
  resetAt: number | null
  /** Window length in seconds: 604800 weekly, 2592000 monthly. */
  limitWindowSeconds: number | null
  /** Reported by the API rather than inferred from the percentage. */
  exhausted: boolean
}

/** Everything readable from disk without touching the network. */
export interface AccountRecord {
  account: string
  profileMode: ProfileMode
  active: TriState
  hasStoredAuth: boolean
  hasAccessToken: TriState
  hasRefreshToken: TriState
  authenticated: boolean
  warnings: WarningLabel[]
}

export interface TokenUsageDay {
  /** yyyy-mm-dd, local date of the bucket. */
  date: string
  tokens: number
}

/**
 * Account token history, from the profile endpoint rather than the usage one.
 * Optional throughout: an account can answer usage but not profile, and every
 * consumer must hide itself rather than show a blank or an invented zero.
 */
export interface TokenUsage {
  lifetimeTokens: number
  peakDailyTokens: number | null
  currentStreakDays: number | null
  longestStreakDays: number | null
  totalThreads: number | null
  /** Longest single turn, in seconds. */
  longestTurnSeconds: number | null
  /** ISO date of the earliest bucket, or null when the series has no start. */
  since: string | null
  /** The day the server last recomputed these; it can lag behind live usage. */
  statsAsOf: string | null
  /** Oldest to newest, one entry per day, gaps allowed. */
  daily: TokenUsageDay[]
}

/** Everything that requires a token refresh or a usage API call. */
export interface QuotaReport {
  email: string | null
  plan: string | null
  /** ISO date (yyyy-mm-dd) parsed from the id_token subscription claim. */
  subscriptionExpiresOn: string | null
  /** Shortest to longest; normally the 5-hour window followed by the weekly one. */
  windows: QuotaWindow[]
  /** Codex Desktop calls these "available resets". */
  availableResetCredits: number | null
  /** Null when the account reports no token history. */
  tokenUsage: TokenUsage | null
  source: QuotaSource
  warnings: WarningLabel[]
  fetchedAt: string
}

export type QuotaState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; report: QuotaReport; refreshing?: boolean }
  | { status: 'failed'; message: string }

export type RegistryStatus = 'loading' | 'ready' | 'failed'

export interface RegistryView {
  status: RegistryStatus
  snapshot: RegistrySnapshot | null
}

/** A record joined with whatever its background fetch has produced so far. */
export interface AccountView extends AccountRecord {
  quota: QuotaState
}

export interface EnvironmentSnapshot {
  /** Activation is refused while Codex Desktop holds the credential, unless forced. */
  desktopRunning: boolean
  storageRoot: string
  liveAuthPath: string
  backupsPath: string
  /** The account `active.json` claims is live, or null when nothing is recorded. */
  activeAccount: string | null
  /** The `codex` the app would spawn, or null when it found none to spawn. */
  codexBinary: string | null
  /** Null when proxying is disabled. */
  proxyUrl: string | null
  usageApiUrl: string
  /** Model and effort used by the priming request. */
  windowStartModel: string
  windowStartReasoningEffort: string
}

export interface RegistrySnapshot {
  readAt: string
  environment: EnvironmentSnapshot
  accounts: AccountRecord[]
}

export type AccountActionId =
  | 'activate'
  | 'import-active'
  | 'login'
  | 'start-window'
  | 'invoke-reset'
  | 'logout'
  | 'delete-auth'
  | 'remove'

export interface ActionOutcome {
  ok: boolean
  title: string
  detail?: string
  /** Activation always backs up the live credential first; this is the restore path. */
  backupPath?: string
}

export interface AddAccountInput {
  account: string
  profileMode: ProfileMode
}

export interface CodexQuotaService {
  /** Local read. Expected to resolve fast enough to render on first paint. */
  readRegistry(): Promise<RegistrySnapshot>
  /** Local-only re-read for state that changes without the registry changing. */
  readEnvironment(): Promise<EnvironmentSnapshot>
  /** Network read for a single account. Safe to run for several accounts at once. */
  fetchQuota(account: string): Promise<QuotaReport>
  addAccount(input: AddAccountInput): Promise<ActionOutcome>
  importActive(account: string, options?: { create?: boolean }): Promise<ActionOutcome>
  activate(account: string, options?: { force?: boolean }): Promise<ActionOutcome>
  login(account: string): Promise<ActionOutcome>
  /** Sends one minimal billed request so the quota window starts counting. */
  startQuotaWindow(account: string): Promise<ActionOutcome>
  /** Consumes one currently available rate-limit reset credit. */
  invokeResetCredits(account: string): Promise<ActionOutcome>
  logout(account: string): Promise<ActionOutcome>
  deleteStoredAuth(account: string): Promise<ActionOutcome>
  removeAccount(account: string): Promise<ActionOutcome>
}

export const ACTION_CATALOG: Record<
  AccountActionId,
  { label: string; short: string; running: string }
> = {
  activate: {
    label: 'Switch Codex Desktop to this account',
    short: 'Switch',
    running: 'Switching'
  },
  'import-active': {
    label: 'Import the live credential',
    short: 'Import live',
    running: 'Importing'
  },
  login: { label: 'Sign in to this account', short: 'Sign in', running: 'Signing in' },
  'start-window': {
    label: 'Start the quota window',
    short: 'Start window',
    running: 'Starting window'
  },
  'invoke-reset': {
    label: 'Invoke an available reset',
    short: 'Reset',
    running: 'Invoking reset'
  },
  logout: { label: 'Sign out', short: 'Sign out', running: 'Signing out' },
  'delete-auth': {
    label: 'Delete stored credential',
    short: 'Delete credential',
    running: 'Deleting'
  },
  remove: { label: 'Remove account', short: 'Remove', running: 'Removing' }
}

export const WARNING_CATALOG: Record<WarningLabel, { label: string; meaning: string; fix: string }> = {
  'no-auth': {
    label: 'No credentials',
    meaning: 'This profile has no usable access token.',
    fix: 'Log in, or import the credential that Codex Desktop is currently using.'
  },
  'corrupt-auth': {
    label: 'Corrupt credentials',
    meaning: 'The stored credential file is not valid JSON.',
    fix: 'Restore from a backup or log in again.'
  },
  'active-drift': {
    label: 'Active drift',
    meaning: 'This account is recorded as active, but the live credential no longer matches it.',
    fix: 'Import active if Desktop is on this account, or activate it to switch intentionally.'
  },
  'desktop-running': {
    label: 'Desktop running',
    meaning: 'Codex Desktop is running and holds the live credential.',
    fix: 'Quit Codex Desktop before activating, then reopen it afterwards.'
  },
  'quota-unavailable': {
    label: 'Quota unavailable',
    meaning: 'The usage API could not be reached or rejected the credential.',
    fix: 'Check the network or proxy, then sign in again.'
  },
  'quota-partial': {
    label: 'Quota partial',
    meaning: 'Plan and expiry were read from the token, but usage numbers are missing.',
    fix: 'Sign in again, then import the refreshed credential.'
  },
  'quota-stub': {
    label: 'No quota source',
    meaning: 'There is no stored credential to query usage with.',
    fix: 'Log in or import a credential for this account.'
  }
}

export const PROFILE_MODE_COPY: Record<ProfileMode, { label: string; description: string }> = {
  desktop_preserving: {
    label: 'Desktop switching',
    description: 'Stores credentials separately so you can swap which account Codex Desktop uses.'
  },
  cli_isolated: {
    label: 'CLI isolated',
    description: 'Keeps an isolated home for command-line use only. Not used for Desktop switching.'
  }
}

const ACCOUNT_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/

export function validateAccountName(name: string, existing: readonly string[] = []): string | null {
  const trimmed = name.trim()
  if (trimmed.length === 0) return 'Enter an account name.'
  if (trimmed === '.' || trimmed === '..') return 'That name is reserved.'
  if (!ACCOUNT_NAME_PATTERN.test(trimmed)) {
    return 'Use letters, numbers, and the characters . _ - only.'
  }
  if (existing.includes(trimmed)) return `"${trimmed}" already exists.`
  return null
}

export const FIVE_HOUR_WINDOW_SECONDS = 18_000
export const WEEKLY_WINDOW_SECONDS = 604_800

export function fiveHourWindow(
  source: readonly QuotaWindow[] | Pick<QuotaReport, 'windows'>
): QuotaWindow | null {
  const windows = 'windows' in source ? source.windows : source
  return windows.find((window) => window.limitWindowSeconds === FIVE_HOUR_WINDOW_SECONDS) ?? null
}

export function weeklyWindow(
  source: readonly QuotaWindow[] | Pick<QuotaReport, 'windows'>
): QuotaWindow | null {
  const windows = 'windows' in source ? source.windows : source
  return windows.find((window) => window.limitWindowSeconds === WEEKLY_WINDOW_SECONDS) ?? null
}

/**
 * Weekly headroom still to spend. Unknown remaining is treated as remaining so
 * a reset is not offered or consumed while weekly allowance cannot be shown as
 * spent. No weekly window means there is no weekly allowance to protect.
 */
export function weeklyAllowanceRemains(
  source: readonly QuotaWindow[] | Pick<QuotaReport, 'windows'>
): boolean {
  const weekly = weeklyWindow(source)
  if (weekly === null) return false
  const left = quotaPercentLeft(weekly)
  return left === null || left > 0
}

/**
 * Headroom as the meter shows it: percent of the window still available.
 *
 * A reached limit wins over the percentage. The API flips `limit_reached` the
 * moment requests start being refused, while `used_percent` has been observed
 * lagging a few points behind, and showing headroom that cannot be spent is
 * worse than showing none.
 */
export function quotaPercentLeft(window: QuotaWindow): number | null {
  if (window.exhausted) return 0
  if (window.usedPercent === null) return null
  return Math.min(100, Math.max(0, Math.round(100 - window.usedPercent)))
}

/** A window with nothing left in it. */
export function isQuotaSpent(quota: QuotaState): boolean {
  // An unread window is unknown, not empty; assuming the worst would make
  // counts jump around as background fetches land.
  if (quota.status !== 'ready') return false
  return quota.report.windows.some((window) => quotaPercentLeft(window) === 0)
}

/** First-ever fetches and in-flight refetches both count as pending. */
export function isQuotaPending(quota: QuotaState): boolean {
  return quota.status === 'loading' || (quota.status === 'ready' && quota.refreshing === true)
}

export function beginQuotaRefresh(current: QuotaState | undefined): QuotaState {
  if (current?.status === 'ready') {
    return { status: 'ready', report: current.report, refreshing: true }
  }
  return { status: 'loading' }
}

export function completeQuotaRefresh(report: QuotaReport): QuotaState {
  return { status: 'ready', report }
}

export function failQuotaRefresh(current: QuotaState | undefined, message: string): QuotaState {
  if (current?.status === 'ready') {
    return { status: 'ready', report: current.report }
  }
  return { status: 'failed', message }
}

export function beginRegistryRefresh(current: RegistryView): RegistryView {
  if (current.snapshot !== null) return { status: 'ready', snapshot: current.snapshot }
  return { status: 'loading', snapshot: null }
}

export function failRegistryRefresh(current: RegistryView): RegistryView {
  if (current.snapshot !== null) return { status: current.status === 'failed' ? 'ready' : current.status, snapshot: current.snapshot }
  return { status: 'failed', snapshot: null }
}

/** The tightest readable limit is the headroom the account can actually spend. */
export function quotaReportPercentLeft(report: QuotaReport): number | null {
  const readable = report.windows
    .map(quotaPercentLeft)
    .filter((percent): percent is number => percent !== null)
  return readable.length === 0 ? null : Math.min(...readable)
}

/**
 * Switching to an account only helps if it can actually serve a session, so a
 * spent window disqualifies it however healthy its credential is.
 */
export function isReadyToSwitch(account: AccountView): boolean {
  return (
    account.profileMode === 'desktop_preserving' &&
    account.hasStoredAuth &&
    !isQuotaSpent(account.quota)
  )
}

/**
 * The text beside the menu bar icon.
 *
 * It answers "how much is left on what I am using", so it reports the account
 * in use. With nothing in use there is no such figure, and the best account to
 * switch to is shown instead, marked so the two can never be confused. An
 * unread quota yields no text at all: the icon alone is better than a
 * placeholder that looks like a measurement.
 */
export function trayTitle(accounts: readonly AccountView[]): string {
  const live = accounts.find((account) => account.active === 'yes')
  if (live) {
    const percent = readPercentLeft(live)
    return percent === null ? '' : `${percent}%`
  }

  const best = accounts
    .filter(isReadyToSwitch)
    .map(readPercentLeft)
    .filter((percent): percent is number => percent !== null)
    .reduce<number | null>((most, percent) => (most === null || percent > most ? percent : most), null)

  return best === null ? '' : `↑${best}%`
}

function readPercentLeft(account: AccountView): number | null {
  if (account.quota.status !== 'ready') return null
  const window = fiveHourWindow(account.quota.report)
  return window === null ? null : quotaPercentLeft(window)
}

export interface ActionAvailability {
  enabled: boolean
  /** Why the action is unavailable, or the caution to show before running it. */
  reason?: string
  /** True when the action destroys credentials or registry state. */
  destructive?: boolean
}

/**
 * Guards mirrored from the CLI so the UI refuses the same operations it would.
 * Most actions take only local registry state so an in-flight quota fetch never
 * decides whether a button works. `invoke-reset` is the exception: enablement
 * depends on the last reported reset count and weekly remaining, and unread
 * quota disables it.
 */
export function resolveActionAvailability(
  action: AccountActionId,
  account: AccountRecord | AccountView,
  environment: EnvironmentSnapshot
): ActionAvailability {
  switch (action) {
    case 'activate':
      if (!account.hasStoredAuth) {
        return { enabled: false, reason: 'No stored credential to activate. Log in or import first.' }
      }
      if (account.active === 'yes') {
        return { enabled: false, reason: 'Codex Desktop is already using this account.' }
      }
      if (environment.desktopRunning) {
        return {
          enabled: true,
          reason: 'Codex Desktop is running. Quit it first, or force the switch and restart Desktop.'
        }
      }
      return { enabled: true }

    case 'import-active':
      return {
        enabled: true,
        reason: 'Copies the credential Codex Desktop is using right now into this profile.'
      }

    case 'login':
      return { enabled: true }

    case 'start-window':
      if (!account.hasStoredAuth) {
        return { enabled: false, reason: 'Sign in to this account before starting its window.' }
      }
      return {
        enabled: true,
        reason: 'Sends one minimal billed request so the quota window starts counting now.'
      }

    case 'invoke-reset': {
      if (!account.hasStoredAuth) {
        return { enabled: false, reason: 'Sign in to this account before invoking a reset.' }
      }
      const quota = 'quota' in account ? account.quota : undefined
      if (quota === undefined || quota.status !== 'ready') {
        return { enabled: false, reason: 'Quota has not been read yet, so available resets are unknown.' }
      }
      const count = quota.report.availableResetCredits
      if (count === null) {
        return { enabled: false, reason: 'Available resets are unknown for this account.' }
      }
      if (!(count > 0)) {
        return { enabled: false, reason: 'No reset credits are available.' }
      }
      if (weeklyAllowanceRemains(quota.report.windows)) {
        return {
          enabled: false,
          reason: 'Weekly quota is still available. Invoke a reset after that window is spent.'
        }
      }
      return {
        enabled: true,
        reason: 'Spends one available reset so this account’s rate-limit windows reset now.'
      }
    }

    case 'logout':
      if (!account.hasStoredAuth) {
        return { enabled: false, reason: 'Nothing stored to sign out of.' }
      }
      return { enabled: true, destructive: true }

    case 'delete-auth':
      if (account.profileMode !== 'desktop_preserving') {
        return {
          enabled: false,
          destructive: true,
          reason: 'Only available for Desktop-switching profiles. Use sign out instead.'
        }
      }
      if (!account.hasStoredAuth) {
        return { enabled: false, destructive: true, reason: 'No stored credential to delete.' }
      }
      return { enabled: true, destructive: true }

    case 'remove':
      return { enabled: true, destructive: true }

    default:
      return { enabled: false }
  }
}
