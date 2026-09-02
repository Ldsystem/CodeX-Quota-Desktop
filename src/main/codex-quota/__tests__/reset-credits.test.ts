import { describe, expect, it } from 'vitest'

import {
  mapConsumeOutcome,
  mapResetCreditsList,
  resetCreditsConsumeUrl,
  resetCreditsListUrl,
  resetCreditsOrigin,
  selectConsumableCredit,
  selectCreditForConsume
} from '../reset-credits'

const listSample = {
  credits: [
    {
      id: 'RateLimitResetCredit_late',
      reset_type: 'codex_rate_limits',
      status: 'available',
      granted_at: '2026-06-17T00:00:00Z',
      expires_at: '2026-08-01T00:00:00Z'
    },
    {
      id: 'RateLimitResetCredit_soon',
      reset_type: 'codex_rate_limits',
      status: 'available',
      granted_at: '2026-06-17T00:00:00Z',
      expires_at: '2026-07-01T00:00:00Z'
    },
    {
      id: 'RateLimitResetCredit_spent',
      reset_type: 'codex_rate_limits',
      status: 'redeemed',
      granted_at: '2026-05-01T00:00:00Z',
      expires_at: '2026-06-01T00:00:00Z'
    }
  ],
  available_count: 2
}

describe('reset credit URLs', () => {
  it('derives the WHAM origin from the configured usage URL', () => {
    expect(resetCreditsOrigin('https://chatgpt.com/backend-api/wham/usage')).toBe(
      'https://chatgpt.com/backend-api/wham'
    )
    expect(resetCreditsListUrl('https://chatgpt.com/backend-api/wham/usage')).toBe(
      'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits'
    )
    expect(resetCreditsConsumeUrl('https://chatgpt.com/backend-api/wham/usage')).toBe(
      'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume'
    )
  })

  it('fails closed on a malformed usage URL instead of falling back to ChatGPT', () => {
    expect(resetCreditsOrigin('not a url')).toBeNull()
    expect(resetCreditsOrigin('ftp://chatgpt.com/backend-api/wham/usage')).toBeNull()
    expect(resetCreditsListUrl('::::')).toBeNull()
    expect(resetCreditsConsumeUrl('not a url')).toBeNull()
  })
})

describe('mapResetCreditsList', () => {
  it('keeps official credit fields and the reported available_count', () => {
    const mapped = mapResetCreditsList(listSample)
    expect(mapped.availableCount).toBe(2)
    expect(mapped.credits).toEqual([
      {
        id: 'RateLimitResetCredit_late',
        status: 'available',
        expiresAt: '2026-08-01T00:00:00Z'
      },
      {
        id: 'RateLimitResetCredit_soon',
        status: 'available',
        expiresAt: '2026-07-01T00:00:00Z'
      },
      {
        id: 'RateLimitResetCredit_spent',
        status: 'redeemed',
        expiresAt: '2026-06-01T00:00:00Z'
      }
    ])
  })

  it('degrades missing or malformed fields to empty or null rather than invented zeros', () => {
    expect(mapResetCreditsList({})).toEqual({ credits: [], availableCount: null })
    expect(mapResetCreditsList({ credits: 'nope', available_count: '2' })).toEqual({
      credits: [],
      availableCount: null
    })
    expect(mapResetCreditsList({ credits: [{ id: 1, status: 'available' }] }).credits).toEqual([])
  })

  it('degrades a malformed expires_at to null rather than keeping the raw string', () => {
    expect(
      mapResetCreditsList({
        credits: [{ id: 'credit', status: 'available', expires_at: 'not-a-date' }]
      }).credits
    ).toEqual([{ id: 'credit', status: 'available', expiresAt: null }])
  })
})

describe('selectConsumableCredit', () => {
  it('consumes the earliest-expiring available credit', () => {
    const mapped = mapResetCreditsList(listSample)
    expect(selectConsumableCredit(mapped.credits)?.id).toBe('RateLimitResetCredit_soon')
  })

  it('uses API order when available credits have no expiry', () => {
    const mapped = mapResetCreditsList({
      credits: [
        { id: 'first', status: 'available' },
        { id: 'second', status: 'available' }
      ]
    })
    expect(selectConsumableCredit(mapped.credits)?.id).toBe('first')
  })

  it('returns null when no available credit id can be parsed', () => {
    expect(selectConsumableCredit(mapResetCreditsList({ available_count: 2 }).credits)).toBeNull()
    expect(
      selectConsumableCredit(
        mapResetCreditsList({
          credits: [{ id: 'gone', status: 'redeemed' }]
        }).credits
      )
    ).toBeNull()
  })

  it('uses API order when any available credit is missing a usable expiry', () => {
    const mapped = mapResetCreditsList({
      credits: [
        { id: 'first-undated', status: 'available' },
        { id: 'dated', status: 'available', expires_at: '2026-07-01T00:00:00Z' }
      ]
    })
    expect(selectConsumableCredit(mapped.credits)?.id).toBe('first-undated')
  })
})

describe('selectCreditForConsume', () => {
  it('does not POST when available_count is present and not greater than zero', () => {
    const mapped = mapResetCreditsList({
      credits: [{ id: 'stale', status: 'available', expires_at: '2026-07-01T00:00:00Z' }],
      available_count: 0
    })
    expect(selectCreditForConsume(mapped)).toBeNull()
  })

  it('still selects a credit when available_count is absent', () => {
    const mapped = mapResetCreditsList({
      credits: [{ id: 'only', status: 'available', expires_at: '2026-07-01T00:00:00Z' }]
    })
    expect(selectCreditForConsume(mapped)?.id).toBe('only')
  })
})

describe('mapConsumeOutcome', () => {
  it('treats reset and already_redeemed as success', () => {
    expect(mapConsumeOutcome({ code: 'reset' }, 200)).toEqual({ ok: true, code: 'reset' })
    expect(mapConsumeOutcome({ code: 'already_redeemed' }, 200)).toEqual({
      ok: true,
      code: 'already_redeemed'
    })
  })

  it('treats no_credit and nothing_to_reset as failure', () => {
    expect(mapConsumeOutcome({ code: 'no_credit' }, 200)).toEqual({ ok: false, code: 'no_credit' })
    expect(mapConsumeOutcome({ code: 'nothing_to_reset' }, 200)).toEqual({
      ok: false,
      code: 'nothing_to_reset'
    })
  })

  it('does not treat HTTP 200 plus an unknown code as success', () => {
    expect(mapConsumeOutcome({ code: 'surprise' }, 200)).toEqual({ ok: false, code: 'surprise' })
    expect(mapConsumeOutcome({}, 200).ok).toBe(false)
    expect(mapConsumeOutcome({ code: 'reset' }, 401).ok).toBe(false)
  })
})
