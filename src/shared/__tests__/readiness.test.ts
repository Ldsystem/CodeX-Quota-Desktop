import { describe, expect, it } from 'vitest'
import {
  isQuotaSpent,
  isReadyToSwitch,
  quotaPercentLeft,
  resolveActionAvailability,
  weeklyAllowanceRemains,
  type AccountView,
  type EnvironmentSnapshot,
  type QuotaReport,
  type QuotaState
} from '../codex-quota'

function ready(
  usedPercent: number | null,
  exhausted = false,
  additionalUsedPercent?: number
): QuotaState {
  const report: QuotaReport = {
    email: null,
    plan: 'plus',
    subscriptionExpiresOn: null,
    windows: [
      { usedPercent, resetAt: null, limitWindowSeconds: 18_000, exhausted },
      ...(additionalUsedPercent === undefined
        ? []
        : [
            {
              usedPercent: additionalUsedPercent,
              resetAt: null,
              limitWindowSeconds: 604_800,
              exhausted: false
            }
          ])
    ],
    availableResetCredits: null,
    tokenUsage: null,
    source: 'codex-oauth',
    warnings: [],
    fetchedAt: new Date().toISOString()
  }
  return { status: 'ready', report }
}

function account(quota: QuotaState, overrides: Partial<AccountView> = {}): AccountView {
  return {
    account: 'work',
    profileMode: 'desktop_preserving',
    active: 'no',
    hasStoredAuth: true,
    hasAccessToken: 'yes',
    hasRefreshToken: 'yes',
    authenticated: true,
    warnings: [],
    quota,
    ...overrides
  }
}

describe('quota headroom', () => {
  it('reports what the meter shows, rounded and clamped', () => {
    expect(quotaPercentLeft({ usedPercent: 6, resetAt: null, limitWindowSeconds: null, exhausted: false })).toBe(94)
    expect(quotaPercentLeft({ usedPercent: 0, resetAt: null, limitWindowSeconds: null, exhausted: false })).toBe(100)
    expect(quotaPercentLeft({ usedPercent: 140, resetAt: null, limitWindowSeconds: null, exhausted: false })).toBe(0)
    expect(quotaPercentLeft({ usedPercent: null, resetAt: null, limitWindowSeconds: null, exhausted: false })).toBeNull()
  })

  it('shows no headroom once the API says the limit is reached', () => {
    expect(quotaPercentLeft({ usedPercent: 94, resetAt: null, limitWindowSeconds: null, exhausted: true })).toBe(0)
  })

  it('counts a window as spent once nothing is left to show', () => {
    expect(isQuotaSpent(ready(100))).toBe(true)
    expect(isQuotaSpent(ready(99.7))).toBe(true)
    expect(isQuotaSpent(ready(94, true))).toBe(true)
    expect(isQuotaSpent(ready(99))).toBe(false)
  })

  it('counts the account as spent when either reported window is exhausted', () => {
    expect(isQuotaSpent(ready(20, false, 100))).toBe(true)
    expect(isQuotaSpent(ready(20, false, 40))).toBe(false)
  })

  it('treats an unfetched window as unknown rather than spent', () => {
    expect(isQuotaSpent({ status: 'idle' })).toBe(false)
    expect(isQuotaSpent({ status: 'loading' })).toBe(false)
    expect(isQuotaSpent({ status: 'failed', message: 'nope' })).toBe(false)
  })
})

describe('readiness to switch', () => {
  it('excludes an account with nothing left in its window', () => {
    expect(isReadyToSwitch(account(ready(100)))).toBe(false)
    expect(isReadyToSwitch(account(ready(6)))).toBe(true)
  })

  it('still requires a stored credential and a desktop-switching profile', () => {
    expect(isReadyToSwitch(account(ready(10), { hasStoredAuth: false }))).toBe(false)
    expect(isReadyToSwitch(account(ready(10), { profileMode: 'cli_isolated' }))).toBe(false)
  })

  it('counts an account whose quota has not been read yet', () => {
    // Withholding it would make the count shrink and grow as fetches land.
    expect(isReadyToSwitch(account({ status: 'loading' }))).toBe(true)
  })
})

const environment: EnvironmentSnapshot = {
  desktopRunning: false,
  storageRoot: '~/.codex-quota',
  liveAuthPath: '~/.codex/auth.json',
  backupsPath: '~/.codex-quota/backups',
  activeAccount: null,
  codexBinary: '/usr/local/bin/codex',
  proxyUrl: null,
  usageApiUrl: 'https://chatgpt.com/backend-api/wham/usage',
  windowStartModel: 'gpt-5-codex',
  windowStartReasoningEffort: 'minimal'
}

function withCredits(count: number | null): QuotaState {
  const state = ready(10)
  if (state.status !== 'ready') return state
  return { status: 'ready', report: { ...state.report, availableResetCredits: count } }
}

function withCreditsAndWeekly(
  count: number | null,
  weeklyUsedPercent: number | null,
  weeklyExhausted = false
): QuotaState {
  const state = withCredits(count)
  if (state.status !== 'ready') return state
  return {
    status: 'ready',
    report: {
      ...state.report,
      windows: [
        ...state.report.windows,
        {
          usedPercent: weeklyUsedPercent,
          resetAt: null,
          limitWindowSeconds: 604_800,
          exhausted: weeklyExhausted
        }
      ]
    }
  }
}

describe('weeklyAllowanceRemains', () => {
  it('is false when no weekly window is present', () => {
    const state = ready(10)
    expect(state.status).toBe('ready')
    if (state.status !== 'ready') return
    expect(weeklyAllowanceRemains(state.report.windows)).toBe(false)
  })

  it('is true when weekly headroom is still positive or unknown', () => {
    const remaining = withCreditsAndWeekly(1, 40)
    const unknown = withCreditsAndWeekly(1, null)
    expect(remaining.status).toBe('ready')
    expect(unknown.status).toBe('ready')
    if (remaining.status !== 'ready' || unknown.status !== 'ready') return
    expect(weeklyAllowanceRemains(remaining.report.windows)).toBe(true)
    expect(weeklyAllowanceRemains(unknown.report.windows)).toBe(true)
  })

  it('is false when the weekly window is spent', () => {
    const spent = withCreditsAndWeekly(1, 100)
    const reached = withCreditsAndWeekly(1, 94, true)
    expect(spent.status).toBe('ready')
    expect(reached.status).toBe('ready')
    if (spent.status !== 'ready' || reached.status !== 'ready') return
    expect(weeklyAllowanceRemains(spent.report.windows)).toBe(false)
    expect(weeklyAllowanceRemains(reached.report.windows)).toBe(false)
  })
})

describe('invoke-reset availability', () => {
  it('enables only a ready report with a finite count greater than zero and a stored credential', () => {
    expect(resolveActionAvailability('invoke-reset', account(withCredits(2)), environment).enabled).toBe(
      true
    )
    expect(resolveActionAvailability('invoke-reset', account(withCredits(1)), environment).enabled).toBe(
      true
    )
  })

  it('disables when weekly quota allowance still remains, even if a reset credit is available', () => {
    const availability = resolveActionAvailability(
      'invoke-reset',
      account(withCreditsAndWeekly(2, 40)),
      environment
    )
    expect(availability.enabled).toBe(false)
    expect(availability.reason).toMatch(/weekly/i)
  })

  it('stays enabled when a reset credit is available and the weekly window is spent', () => {
    expect(
      resolveActionAvailability('invoke-reset', account(withCreditsAndWeekly(1, 100)), environment)
        .enabled
    ).toBe(true)
  })

  it('treats zero, unknown, unread, failed, and missing credentials as disabled', () => {
    expect(resolveActionAvailability('invoke-reset', account(withCredits(0)), environment).enabled).toBe(
      false
    )
    expect(
      resolveActionAvailability('invoke-reset', account(withCredits(null)), environment).enabled
    ).toBe(false)
    expect(resolveActionAvailability('invoke-reset', account({ status: 'idle' }), environment).enabled).toBe(
      false
    )
    expect(
      resolveActionAvailability('invoke-reset', account({ status: 'loading' }), environment).enabled
    ).toBe(false)
    expect(
      resolveActionAvailability('invoke-reset', account({ status: 'failed', message: 'nope' }), environment)
        .enabled
    ).toBe(false)
    expect(
      resolveActionAvailability(
        'invoke-reset',
        account(withCredits(3), { hasStoredAuth: false }),
        environment
      ).enabled
    ).toBe(false)
  })
})
