import { describe, expect, it } from 'vitest'

import {
  beginQuotaRefresh,
  beginRegistryRefresh,
  completeQuotaRefresh,
  failQuotaRefresh,
  failRegistryRefresh,
  isQuotaPending,
  type QuotaReport,
  type QuotaState,
  type RegistrySnapshot
} from '../codex-quota'

function report(usedPercent = 32): QuotaReport {
  return {
    email: 'a@example.com',
    plan: 'plus',
    subscriptionExpiresOn: null,
    windows: [{ usedPercent, resetAt: 1_800_000_000, limitWindowSeconds: 18_000, exhausted: false }],
    availableResetCredits: 1,
    tokenUsage: null,
    source: 'codex-oauth',
    warnings: [],
    fetchedAt: '2026-09-02T00:00:00.000Z'
  }
}

const snapshot: RegistrySnapshot = {
  readAt: '2026-09-02T00:00:00.000Z',
  environment: {
    desktopRunning: false,
    storageRoot: '~/.codex-quota',
    liveAuthPath: '~/.codex/auth.json',
    backupsPath: '~/.codex-quota/backups',
    activeAccount: 'work',
    codexBinary: '/usr/local/bin/codex',
    proxyUrl: null,
    usageApiUrl: 'https://chatgpt.com/backend-api/wham/usage',
    windowStartModel: 'gpt-5-codex',
    windowStartReasoningEffort: 'minimal'
  },
  accounts: []
}

describe('quota refresh overlay', () => {
  it('keeps a ready report visible while refetching', () => {
    const current: QuotaState = { status: 'ready', report: report(32) }
    const next = beginQuotaRefresh(current)
    expect(next).toEqual({ status: 'ready', report: report(32), refreshing: true })
    expect(isQuotaPending(next)).toBe(true)
  })

  it('uses loading only for a first-ever fetch', () => {
    expect(beginQuotaRefresh({ status: 'idle' })).toEqual({ status: 'loading' })
    expect(beginQuotaRefresh(undefined)).toEqual({ status: 'loading' })
    expect(isQuotaPending({ status: 'loading' })).toBe(true)
  })

  it('replaces the report on success and keeps the last-good report on failure', () => {
    const refreshing: QuotaState = { status: 'ready', report: report(32), refreshing: true }
    expect(completeQuotaRefresh(report(10))).toEqual({ status: 'ready', report: report(10) })
    expect(failQuotaRefresh(refreshing, 'usage down')).toEqual({ status: 'ready', report: report(32) })
    expect(failQuotaRefresh({ status: 'loading' }, 'usage down')).toEqual({
      status: 'failed',
      message: 'usage down'
    })
  })
})

describe('registry refresh overlay', () => {
  it('does not switch to loading or failed while a snapshot exists', () => {
    expect(beginRegistryRefresh({ status: 'ready', snapshot })).toEqual({
      status: 'ready',
      snapshot
    })
    expect(failRegistryRefresh({ status: 'ready', snapshot })).toEqual({
      status: 'ready',
      snapshot
    })
  })

  it('allows loading or failed only on the initial read', () => {
    expect(beginRegistryRefresh({ status: 'loading', snapshot: null })).toEqual({
      status: 'loading',
      snapshot: null
    })
    expect(failRegistryRefresh({ status: 'loading', snapshot: null })).toEqual({
      status: 'failed',
      snapshot: null
    })
  })
})
