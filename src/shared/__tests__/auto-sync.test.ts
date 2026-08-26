import { describe, expect, it } from 'vitest'

import {
  IDLE_SYNC_INTERVAL_MS,
  PRIME_COOLDOWN_MS,
  SYNC_INTERVAL_MS,
  classifyWindow,
  shouldPrime,
  syncDelayMs,
  syncIntervalMs
} from '../auto-sync'
import type { WindowSample } from '../auto-sync'

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

  it('reads a jump far larger than the elapsed time as a fresh window, not a slide', () => {
    const previous = sample({ resetAt: 1_800_000_000, at: 0 })
    const current = sample({ resetAt: 1_800_000_000 + 604_800, at: 2 * MINUTE })

    expect(classifyWindow(previous, current)).toBe('running')
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
})
