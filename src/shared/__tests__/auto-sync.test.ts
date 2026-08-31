import { describe, expect, it } from 'vitest'

import {
  IDLE_SYNC_INTERVAL_MS,
  MIN_SAMPLE_GAP_MS,
  PRIME_COOLDOWN_MS,
  SYNC_INTERVAL_MS,
  classifyWindow,
  recordWindowSample,
  shouldPrime,
  syncDelayMs,
  syncIntervalMs
} from '../auto-sync'
import type { WindowSample } from '../auto-sync'
import { fiveHourWindow } from '../codex-quota'

const MINUTE = 60_000

function sample(overrides: Partial<WindowSample> = {}): WindowSample {
  return { resetAt: 1_800_000_000, usedPercent: 0, at: 0, ...overrides }
}

describe('classifyWindow', () => {
  it('reads a reset time that slides with the clock as a window that never started', () => {
    const previous = sample({ resetAt: 1_800_000_000, at: 0 })
    const current = sample({ resetAt: 1_800_000_120, at: 2 * MINUTE })

    expect(classifyWindow(previous, current)).toBe('not-started')
  })

  it('reads a reset time that holds still as a window already counting down', () => {
    const previous = sample({ resetAt: 1_800_000_000, at: 0 })
    const current = sample({ resetAt: 1_800_000_000, at: 2 * MINUTE })

    expect(classifyWindow(previous, current)).toBe('running')
  })

  it('reads a five-hour reset jump with used 0 as a window that has not started', () => {
    const previous = sample({ resetAt: 1_800_000_000, usedPercent: 97, at: 0 })
    const current = sample({ resetAt: 1_800_000_000 + 18_000, usedPercent: 0, at: 2 * MINUTE })

    expect(classifyWindow(previous, current)).toBe('not-started')
    expect(
      shouldPrime({
        autoSync: true,
        hasStoredAuth: true,
        state: 'not-started',
        busy: false,
        lastPrimedAt: null,
        now: 10 * PRIME_COOLDOWN_MS
      })
    ).toBe(true)
  })

  it('treats any recorded usage as proof the window is counting, with no history needed', () => {
    expect(classifyWindow(null, sample({ usedPercent: 3 }))).toBe('running')
  })

  it('treats a missing reset time as a window that has not started', () => {
    expect(classifyWindow(null, sample({ resetAt: null, usedPercent: 0 }))).toBe('not-started')
  })

  it('withholds a verdict until there is something to compare against', () => {
    expect(classifyWindow(null, sample())).toBe('unknown')
  })

  it('withholds a verdict when the two samples are too close together to tell apart', () => {
    const previous = sample({ resetAt: 1_800_000_000, at: 0 })
    const current = sample({ resetAt: 1_800_000_000, at: 900 })

    expect(classifyWindow(previous, current)).toBe('unknown')
  })

  it('tolerates the jitter between a sample and the request that produced it', () => {
    const previous = sample({ resetAt: 1_800_000_000, at: 0 })
    const current = sample({ resetAt: 1_800_000_123, at: 2 * MINUTE })

    expect(classifyWindow(previous, current)).toBe('not-started')
  })
})

describe('shouldPrime', () => {
  const eligible = {
    autoSync: true,
    hasStoredAuth: true,
    state: 'not-started' as const,
    busy: false,
    lastPrimedAt: null,
    now: 10 * PRIME_COOLDOWN_MS
  }

  it('primes an unstarted window on an account that can be billed', () => {
    expect(shouldPrime(eligible)).toBe(true)
  })

  it('never acts while the switch is off', () => {
    expect(shouldPrime({ ...eligible, autoSync: false })).toBe(false)
  })

  it('leaves a running window alone', () => {
    expect(shouldPrime({ ...eligible, state: 'running' })).toBe(false)
    expect(shouldPrime({ ...eligible, state: 'unknown' })).toBe(false)
  })

  it('skips an account with no credential to bill', () => {
    expect(shouldPrime({ ...eligible, hasStoredAuth: false })).toBe(false)
  })

  it('waits for whatever is already running on that account', () => {
    expect(shouldPrime({ ...eligible, busy: true })).toBe(false)
  })

  it('does not retry within the cooldown, so a refusal cannot become a loop', () => {
    const now = eligible.now
    expect(shouldPrime({ ...eligible, lastPrimedAt: now - 60_000 })).toBe(false)
    expect(shouldPrime({ ...eligible, lastPrimedAt: now - PRIME_COOLDOWN_MS - 1 })).toBe(true)
  })

  it('still blocks a failed prime that never reached running', () => {
    expect(
      shouldPrime({
        ...eligible,
        lastPrimedAt: eligible.now - 60_000,
        state: 'not-started'
      })
    ).toBe(false)
  })

  it('primes after lastPrimedAt is cleared once the window was observed running', () => {
    expect(shouldPrime({ ...eligible, lastPrimedAt: null, state: 'not-started' })).toBe(true)
  })
})

describe('syncIntervalMs', () => {
  it('refreshes immediately when automatic sync changes from off to on', () => {
    expect(syncDelayMs(['running'], false, true)).toBe(0)
    expect(syncDelayMs(['running'], true, true)).toBe(IDLE_SYNC_INTERVAL_MS)
  })

  it('samples often while any window is still undecided or waiting to be primed', () => {
    expect(syncIntervalMs(['running', 'unknown'])).toBe(SYNC_INTERVAL_MS)
    expect(syncIntervalMs(['running', 'not-started'])).toBe(SYNC_INTERVAL_MS)
  })

  it('backs off once every window is known to be counting', () => {
    expect(syncIntervalMs(['running', 'running'])).toBe(IDLE_SYNC_INTERVAL_MS)
    expect(IDLE_SYNC_INTERVAL_MS).toBe(5 * MINUTE)
  })

  it('does not poll eagerly with nothing to watch', () => {
    expect(syncIntervalMs([])).toBe(IDLE_SYNC_INTERVAL_MS)
  })

  it('aims the delay at a five-hour reset instead of the idle interval', () => {
    const now = 1_000_000
    const resetAt = Math.floor(now / 1000) + 90
    expect(syncDelayMs(['running'], true, true, resetAt, now)).toBe(90_000)
    expect(syncDelayMs(['running'], true, true, resetAt, now)).toBeLessThan(IDLE_SYNC_INTERVAL_MS)
  })

  it('does not arm sooner than the sample gap even when reset is imminent', () => {
    const now = 1_000_000
    const resetAt = Math.floor(now / 1000) + 10
    expect(syncDelayMs(['running'], true, true, resetAt, now)).toBe(MIN_SAMPLE_GAP_MS)
  })
})

describe('recordWindowSample', () => {
  it('replaces the stored baseline with the post-reset sample', () => {
    const previous = sample({ resetAt: 1_800_000_000, usedPercent: 97, at: 0 })
    const current = sample({ resetAt: 1_800_000_000 + 18_000, usedPercent: 0, at: 2 * MINUTE })
    expect(classifyWindow(previous, current)).toBe('not-started')
    expect(recordWindowSample(previous, current)).toEqual(current)
  })

  it('keeps the older sample when a non-reset pair is too close together', () => {
    const previous = sample({ resetAt: 1_800_000_000, usedPercent: 3, at: 0 })
    const current = sample({ resetAt: 1_800_000_000, usedPercent: 3, at: 900 })
    expect(recordWindowSample(previous, current)).toEqual(previous)
  })
})

describe('fiveHourWindow identity', () => {
  it('selects the 18000-second window even when weekly is first', () => {
    const weekly = {
      usedPercent: 72,
      resetAt: 1_800_604_800,
      limitWindowSeconds: 604_800,
      exhausted: false
    }
    const fiveHour = {
      usedPercent: 0,
      resetAt: 1_800_018_000,
      limitWindowSeconds: 18_000,
      exhausted: false
    }
    expect(fiveHourWindow([weekly, fiveHour])).toEqual(fiveHour)
  })

  it('does not substitute a weekly window', () => {
    expect(
      fiveHourWindow([
        { usedPercent: 20, resetAt: 1_800_604_800, limitWindowSeconds: 604_800, exhausted: false }
      ])
    ).toBeNull()
  })
})
