/**
 * Fixture data source for UI development.
 *
 * Every value here is invented sample data, not a reading of the machine. It
 * exists so the interface can be designed and reviewed against realistic
 * states before the native account and quota implementation lands.
 *
 * Latencies are deliberately uneven and one account always fails its quota
 * fetch, because the interface has to stay usable while slow work is still in
 * flight. Swap this for the real `CodexQuotaService` without touching
 * components.
 *
 * Token usage is speculative: the CLI never read token counts and the usage
 * endpoint is undocumented. Set TOKEN_USAGE_AVAILABLE to false to see how the
 * interface looks when the real service cannot provide it.
 */

import type {
  AccountRecord,
  ActionOutcome,
  AddAccountInput,
  CodexQuotaService,
  EnvironmentSnapshot,
  QuotaReport,
  RegistrySnapshot,
  TokenUsage
} from '../../../shared/codex-quota'

const HOUR = 3600
const WEEK = 604_800
const MONTH = 2_592_000
const TOKEN_USAGE_AVAILABLE = true

function inHours(hours: number): number {
  return Math.floor(Date.now() / 1000) + Math.round(hours * HOUR)
}

function delay<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

function fail(message: string, ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
}

const environment: EnvironmentSnapshot = {
  desktopRunning: true,
  storageRoot: '~/.codex-quota',
  liveAuthPath: '~/.codex/auth.json',
  backupsPath: '~/.codex-quota/backups',
  activeAccount: 'plus_01',
  proxyUrl: 'http://127.0.0.1:7897',
  usageApiUrl: 'https://chatgpt.com/backend-api/wham/usage',
  windowStartModel: 'gpt-5-codex',
  windowStartReasoningEffort: 'minimal'
}

function seedRecords(): AccountRecord[] {
  return [
    {
      account: 'plus_01',
      profileMode: 'desktop_preserving',
      active: 'yes',
      hasStoredAuth: true,
      hasAccessToken: 'yes',
      hasRefreshToken: 'yes',
      authenticated: true,
      warnings: []
    },
    {
      account: 'plus_02',
      profileMode: 'desktop_preserving',
      active: 'no',
      hasStoredAuth: true,
      hasAccessToken: 'yes',
      hasRefreshToken: 'yes',
      authenticated: true,
      warnings: []
    },
    {
      account: 'pro_main',
      profileMode: 'desktop_preserving',
      active: 'no',
      hasStoredAuth: true,
      hasAccessToken: 'yes',
      hasRefreshToken: 'yes',
      authenticated: true,
      warnings: []
    },
    {
      account: 'oncall',
      profileMode: 'desktop_preserving',
      active: 'unknown',
      hasStoredAuth: true,
      hasAccessToken: 'yes',
      hasRefreshToken: 'no',
      authenticated: true,
      warnings: ['active-drift']
    },
    {
      account: 'sandbox_cli',
      profileMode: 'cli_isolated',
      active: 'no',
      hasStoredAuth: false,
      hasAccessToken: 'no',
      hasRefreshToken: 'no',
      authenticated: false,
      warnings: ['no-auth']
    }
  ]
}

/**
 * Deterministic pseudo-random daily series: recent months busy, older months
 * mostly idle, weekends lighter. Enough shape to judge the layout by.
 */
function seedTokenUsage(seed: number, activeDays: number): TokenUsage | null {
  if (!TOKEN_USAGE_AVAILABLE) return null

  const daily: TokenUsage['daily'] = []
  let lifetimeTokens = 0
  let state = seed * 7919

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let offset = 364; offset >= 0; offset -= 1) {
    const day = new Date(today)
    day.setDate(day.getDate() - offset)

    state = (state * 1103515245 + 12345) % 2147483648
    const roll = state / 2147483648
    const withinActiveWindow = offset < activeDays
    const weekend = day.getDay() === 0 || day.getDay() === 6
    const chance = withinActiveWindow ? (weekend ? 0.35 : 0.8) : 0.04

    if (roll > chance) continue

    const scale = withinActiveWindow ? 1 : 0.3
    const tokens = Math.round((40_000 + roll * 900_000) * scale)
    lifetimeTokens += tokens
    daily.push({ date: isoDate(day), tokens })
  }

  if (daily.length === 0) return null

  return {
    lifetimeTokens,
    peakDailyTokens: daily.reduce((max, day) => Math.max(max, day.tokens), 0),
    currentStreakDays: seed % 5,
    longestStreakDays: 8 + (seed % 21),
    totalThreads: 40 + seed * 7,
    longestTurnSeconds: 900 + seed * 137,
    since: daily[0]!.date,
    statsAsOf: isoDate(today),
    daily
  }
}

function isoDate(value: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}

interface QuotaSeed {
  latencyMs: number
  report?: Omit<QuotaReport, 'fetchedAt'>
  error?: string
}

function seedQuota(): Record<string, QuotaSeed> {
  return {
    plus_01: {
      latencyMs: 900,
      report: {
        email: 'codex.plus01@hey.com',
        plan: 'plus',
        subscriptionExpiresOn: '2026-11-04',
        window: { usedPercent: 77, resetAt: inHours(69), limitWindowSeconds: WEEK, exhausted: false },
        availableResetCredits: 1,
        tokenUsage: seedTokenUsage(3, 96),
        source: 'codex-oauth',
        warnings: []
      }
    },
    plus_02: {
      latencyMs: 2400,
      report: {
        email: 'codex.plus02@hey.com',
        plan: 'plus',
        subscriptionExpiresOn: '2026-09-19',
        window: { usedPercent: 41, resetAt: inHours(102), limitWindowSeconds: WEEK, exhausted: false },
        availableResetCredits: 0,
        tokenUsage: seedTokenUsage(11, 58),
        source: 'codex-oauth',
        warnings: []
      }
    },
    pro_main: {
      latencyMs: 1500,
      report: {
        email: 'rui.tan@northloop.dev',
        plan: 'pro',
        subscriptionExpiresOn: '2027-02-28',
        window: { usedPercent: 8, resetAt: inHours(121), limitWindowSeconds: WEEK, exhausted: false },
        availableResetCredits: 3,
        tokenUsage: seedTokenUsage(23, 180),
        source: 'codex-oauth',
        warnings: []
      }
    },
    oncall: {
      latencyMs: 3600,
      error: 'The usage API did not respond in time.'
    }
  }
}

export class FixtureCodexQuotaService implements CodexQuotaService {
  private records = seedRecords()
  private environment = { ...environment }
  private quota = seedQuota()

  async readRegistry(): Promise<RegistrySnapshot> {
    return delay(
      {
        readAt: new Date().toISOString(),
        environment: { ...this.environment },
        accounts: this.records.map((record) => ({ ...record, warnings: [...record.warnings] }))
      },
      180
    )
  }

  async readEnvironment(): Promise<EnvironmentSnapshot> {
    return delay({ ...this.environment }, 60)
  }

  async fetchQuota(account: string): Promise<QuotaReport> {
    const seed = this.quota[account]
    const record = this.records.find((entry) => entry.account === account)

    if (!record?.hasStoredAuth) {
      return delay(
        {
          email: null,
          plan: null,
          subscriptionExpiresOn: null,
          window: { usedPercent: null, resetAt: null, limitWindowSeconds: null, exhausted: false },
          availableResetCredits: null,
          tokenUsage: null,
          source: 'unknown' as const,
          warnings: ['quota-stub' as const],
          fetchedAt: new Date().toISOString()
        },
        260
      )
    }

    if (!seed || seed.error) {
      return fail(seed?.error ?? 'No usage data for this account.', seed?.latencyMs ?? 1200)
    }

    return delay({ ...seed.report!, fetchedAt: new Date().toISOString() }, seed.latencyMs)
  }

  async addAccount({ account, profileMode }: AddAccountInput): Promise<ActionOutcome> {
    this.records = [
      ...this.records,
      {
        account,
        profileMode,
        active: 'no',
        hasStoredAuth: false,
        hasAccessToken: 'no',
        hasRefreshToken: 'no',
        authenticated: false,
        warnings: ['no-auth']
      }
    ]
    return delay(
      {
        ok: true,
        title: `Created ${account}`,
        detail: 'No credentials yet. Sign in, or import the account Codex Desktop is using.'
      },
      380
    )
  }

  async importActive(account: string): Promise<ActionOutcome> {
    this.patch(account, {
      hasStoredAuth: true,
      hasAccessToken: 'yes',
      hasRefreshToken: 'yes',
      authenticated: true,
      warnings: []
    })
    this.setActive(account)
    this.quota[account] = {
      latencyMs: 800,
      report: {
        email: 'codex.plus01@hey.com',
        plan: 'plus',
        subscriptionExpiresOn: '2026-11-04',
        window: { usedPercent: 77, resetAt: inHours(69), limitWindowSeconds: WEEK, exhausted: false },
        availableResetCredits: 1,
        tokenUsage: seedTokenUsage(3, 96),
        source: 'codex-oauth',
        warnings: []
      }
    }
    return delay({ ok: true, title: `Imported the live credential into ${account}` }, 900)
  }

  async activate(account: string): Promise<ActionOutcome> {
    this.setActive(account)
    return delay(
      {
        ok: true,
        title: `Codex Desktop now uses ${account}`,
        detail: 'Reopen or refresh Codex Desktop to confirm the account changed.',
        backupPath: `~/.codex-quota/backups/${backupStamp()}-auth.json`
      },
      1400
    )
  }

  async login(account: string): Promise<ActionOutcome> {
    this.patch(account, {
      hasStoredAuth: true,
      hasAccessToken: 'yes',
      hasRefreshToken: 'yes',
      authenticated: true,
      warnings: []
    })
    this.quota[account] = {
      latencyMs: 700,
      report: {
        email: `${account}@example.com`,
        plan: 'plus',
        subscriptionExpiresOn: '2027-01-15',
        window: { usedPercent: 0, resetAt: null, limitWindowSeconds: MONTH, exhausted: false },
        availableResetCredits: 0,
        tokenUsage: null,
        source: 'codex-oauth',
        warnings: []
      }
    }
    return delay(
      {
        ok: true,
        title: `Signed in to ${account}`,
        detail: 'Credentials are stored in this profile only. Switch to it to change Codex Desktop.'
      },
      4200
    )
  }

  async startQuotaWindow(account: string): Promise<ActionOutcome> {
    const seed = this.quota[account]
    if (seed?.report) {
      seed.report = { ...seed.report, window: { ...seed.report.window, resetAt: inHours(168) } }
    }
    return delay(
      {
        ok: true,
        title: `Quota window started for ${account}`,
        detail: 'One minimal request was billed. The weekly window now counts from this moment.'
      },
      3100
    )
  }

  async logout(account: string): Promise<ActionOutcome> {
    this.clearCredentials(account)
    return delay({ ok: true, title: `Signed out of ${account}` }, 1200)
  }

  async deleteStoredAuth(account: string): Promise<ActionOutcome> {
    this.clearCredentials(account)
    return delay(
      {
        ok: true,
        title: `Deleted the stored credential for ${account}`,
        detail: 'The live Codex Desktop credential was left untouched.'
      },
      620
    )
  }

  async removeAccount(account: string): Promise<ActionOutcome> {
    this.records = this.records.filter((entry) => entry.account !== account)
    delete this.quota[account]
    return delay({ ok: true, title: `Removed ${account}` }, 720)
  }

  private setActive(account: string): void {
    this.records = this.records.map((entry) => ({
      ...entry,
      active: entry.account === account ? 'yes' : 'no',
      warnings: entry.warnings.filter((warning) => warning !== 'active-drift')
    }))
    this.environment = { ...this.environment, activeAccount: account }
  }

  private clearCredentials(account: string): void {
    this.patch(account, {
      hasStoredAuth: false,
      hasAccessToken: 'no',
      hasRefreshToken: 'no',
      authenticated: false,
      active: 'no',
      warnings: ['no-auth']
    })
    delete this.quota[account]
  }

  private patch(account: string, changes: Partial<AccountRecord>): void {
    this.records = this.records.map((entry) =>
      entry.account === account ? { ...entry, ...changes } : entry
    )
  }
}

function backupStamp(): string {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return (
    [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join('') +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  )
}
