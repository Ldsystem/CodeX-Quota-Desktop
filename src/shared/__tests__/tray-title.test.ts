import { describe, expect, it } from 'vitest'

import type { AccountView, QuotaReport, QuotaState } from '../codex-quota'
import { trayTitle } from '../codex-quota'

function report(usedPercent: number | null, exhausted = false): QuotaReport {
  return {
    email: null,
    plan: 'plus',
    subscriptionExpiresOn: null,
    window: { usedPercent, resetAt: null, limitWindowSeconds: 604_800, exhausted },
    availableResetCredits: null,
    tokenUsage: null,
    source: 'codex-oauth',
    warnings: [],
    fetchedAt: '2026-08-13T00:00:00.000Z'
  }
}

function account(name: string, quota: QuotaState, active: AccountView['active'] = 'no'): AccountView {
  return {
    account: name,
    profileMode: 'desktop_preserving',
    active,
    hasStoredAuth: true,
    hasAccessToken: 'yes',
    hasRefreshToken: 'yes',
    authenticated: true,
    warnings: [],
    quota
  }
}

const ready = (percentUsed: number): QuotaState => ({ status: 'ready', report: report(percentUsed) })

describe('trayTitle', () => {
  it('shows the headroom of the account in use', () => {
    const accounts = [
      account('spare', ready(10)),
      account('live', ready(77), 'yes')
    ]

    expect(trayTitle(accounts)).toBe('23%')
  })

  it('marks the figure as a stand-in when no account is in use', () => {
    // Nothing is live, so the number describes the best account to switch to
    // rather than what is being spent right now, and must not read as the
    // former.
    const accounts = [account('spare', ready(40)), account('other', ready(90))]

    expect(trayTitle(accounts)).toBe('↑60%')
  })

  it('ignores an exhausted account when picking the stand-in', () => {
    const spent: QuotaState = { status: 'ready', report: report(4, true) }

    expect(trayTitle([account('spent', spent), account('usable', ready(70))])).toBe('↑30%')
  })

  it('is empty while no quota has been read, leaving the icon alone', () => {
    expect(trayTitle([account('pending', { status: 'loading' })])).toBe('')
    expect(trayTitle([])).toBe('')
  })

  it('is empty when the account in use has no readable quota', () => {
    // Falling back to another account's headroom here would attribute someone
    // else's numbers to the account actually in use.
    const accounts = [
      account('live', { status: 'failed', message: 'no' }, 'yes'),
      account('spare', ready(20))
    ]

    expect(trayTitle(accounts)).toBe('')
  })
})
