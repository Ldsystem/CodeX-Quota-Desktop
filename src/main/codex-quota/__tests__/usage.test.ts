import { describe, expect, it } from 'vitest'

import { mapUsageResponse } from '../usage'

/** Shaped after a real response: one populated window, the other null. */
const sample = {
  plan_type: 'Plus',
  rate_limit: {
    limit_reached: true,
    primary_window: {
      used_percent: 77.4,
      limit_window_seconds: 604_800,
      reset_at: 1_800_600_000
    },
    secondary_window: null
  },
  rate_limit_reset_credits: { available_count: 2 }
}

describe('mapUsageResponse', () => {
  it('takes the allowance from the primary window', () => {
    const mapped = mapUsageResponse(sample)
    expect(mapped.plan).toBe('plus')
    expect(mapped.window).toEqual({
      usedPercent: 77.4,
      resetAt: 1_800_600_000,
      limitWindowSeconds: 604_800,
      exhausted: true
    })
    expect(mapped.availableResetCredits).toBe(2)
  })

  it('falls back to the secondary window when only that one is populated', () => {
    const mapped = mapUsageResponse({
      rate_limit: {
        primary_window: null,
        secondary_window: { used_percent: 12, limit_window_seconds: 2_592_000, reset_at: 17 }
      }
    })
    expect(mapped.window).toEqual({
      usedPercent: 12,
      resetAt: 17,
      limitWindowSeconds: 2_592_000,
      exhausted: false
    })
  })

  it('reports nothing usable when the rate limit block is absent', () => {
    const mapped = mapUsageResponse({ plan_type: 'pro' })
    expect(mapped.window).toEqual({
      usedPercent: null,
      resetAt: null,
      limitWindowSeconds: null,
      exhausted: false
    })
    expect(mapped.availableResetCredits).toBeNull()
    expect(mapped.usable).toBe(false)
  })

  it('is usable as soon as a window reports a percentage', () => {
    expect(mapUsageResponse(sample).usable).toBe(true)
  })

  it('treats a fully spent window as usable data, not as missing data', () => {
    const mapped = mapUsageResponse({
      rate_limit: { limit_reached: true, primary_window: { used_percent: 0 } }
    })
    expect(mapped.usable).toBe(true)
    expect(mapped.window.exhausted).toBe(true)
  })

  it('ignores a non numeric percentage instead of rendering NaN', () => {
    const mapped = mapUsageResponse({ rate_limit: { primary_window: { used_percent: null } } })
    expect(mapped.window.usedPercent).toBeNull()
  })
})