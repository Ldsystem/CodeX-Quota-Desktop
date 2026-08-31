/**
 * Automatic sync: keeping the figure honest, and starting windows that never
 * started.
 *
 * A weekly allowance does not begin when the week begins; it begins with the
 * first billed request, and until then the usage API reports a reset time that
 * simply slides along with the clock. That gives a way to tell the two apart
 * without a second endpoint: sample the reset time twice. If it moved by about
 * as much as the clock did, nothing has started it. If it held still, it is
 * counting down towards a fixed moment.
 *
 * Everything here is a pure decision over samples the sync already collected,
 * which is what keeps the window check a consequence of syncing rather than a
 * second thing running in the background.
 */

import { FIVE_HOUR_WINDOW_SECONDS } from './codex-quota'

export type WindowState =
  /** Not enough evidence yet; one more sample decides it. */
  | 'unknown'
  /** Counting down towards a fixed reset. */
  | 'running'
  /** No billed request has started the allowance. */
  | 'not-started'

export interface WindowSample {
  /** Epoch seconds as the usage API reported, or null when it reported none. */
  resetAt: number | null
  /** 0-100, or null when the API returned no figure. */
  usedPercent: number | null
  /** Local clock in epoch milliseconds when this sample was taken. */
  at: number
}

/** While any window is still undecided or waiting to be started. */
export const SYNC_INTERVAL_MS = 120_000

/** Once every window is known to be counting; keeps displayed budgets at most five minutes old. */
export const IDLE_SYNC_INTERVAL_MS = 300_000

/** Below this the two samples cannot be told apart from rounding. */
export const MIN_SAMPLE_GAP_MS = 30_000

/**
 * How far the reset time may drift from the elapsed time and still count as
 * sliding. It absorbs request latency and the API's one-second resolution,
 * while staying far below the jump a genuinely new window produces.
 */
const SLIDE_TOLERANCE_MS = 30_000
const FIVE_HOUR_MS = FIVE_HOUR_WINDOW_SECONDS * 1_000
/** How far a resetAt jump may miss 18000 seconds and still count as a five-hour reset. */
const RESET_JUMP_TOLERANCE_MS = 120_000

/** Long enough that a window which refuses to start is not retried all day. */
export const PRIME_COOLDOWN_MS = 6 * 60 * 60_000

function isFiveHourResetJump(previous: WindowSample, current: WindowSample): boolean {
  if (current.usedPercent !== 0) return false
  if (previous.resetAt === null || current.resetAt === null) return false
  const moved = (current.resetAt - previous.resetAt) * 1_000
  return Math.abs(Math.abs(moved) - FIVE_HOUR_MS) <= RESET_JUMP_TOLERANCE_MS
}

export function classifyWindow(previous: WindowSample | null, current: WindowSample): WindowState {
  // Something has been billed, so the window is unambiguously under way. This
  // spares every account in normal use from waiting on a second sample.
  if (current.usedPercent !== null && current.usedPercent > 0) return 'running'

  if (current.resetAt === null) return 'not-started'
  if (previous === null || previous.resetAt === null) return 'unknown'

  if (isFiveHourResetJump(previous, current)) return 'not-started'

  const elapsed = current.at - previous.at
  if (elapsed < MIN_SAMPLE_GAP_MS) return 'unknown'

  const moved = (current.resetAt - previous.resetAt) * 1_000
  return Math.abs(moved - elapsed) <= SLIDE_TOLERANCE_MS ? 'not-started' : 'running'
}

export interface PrimeContext {
  autoSync: boolean
  hasStoredAuth: boolean
  state: WindowState
  /** Something is already running for this account. */
  busy: boolean
  lastPrimedAt: number | null
  now: number
}

/**
 * Whether this account's window should be started on its owner's behalf. The
 * guards matter more than the rule: this spends real money, quietly, so it
 * happens only for an account that can be billed, only when the evidence is in,
 * and never twice in a row for one that did not take.
 */
export function shouldPrime(context: PrimeContext): boolean {
  if (!context.autoSync) return false
  if (!context.hasStoredAuth) return false
  if (context.state !== 'not-started') return false
  if (context.busy) return false
  if (context.lastPrimedAt !== null && context.now - context.lastPrimedAt <= PRIME_COOLDOWN_MS) {
    return false
  }
  return true
}

/**
 * How long to wait before the next sync. Sampling every couple of minutes is
 * only worth it while a verdict is still pending; once every window is counting
 * there is nothing to detect and the interval only has to keep the menu bar
 * figure current.
 */
export function syncIntervalMs(states: readonly WindowState[]): number {
  const undecided = states.some((state) => state === 'unknown' || state === 'not-started')
  return undecided ? SYNC_INTERVAL_MS : IDLE_SYNC_INTERVAL_MS
}

/** Enabling the switch is itself a request for a fresh reading. */
export function syncDelayMs(
  states: readonly WindowState[],
  wasEnabled: boolean,
  enabled: boolean,
  fiveHourResetAt: number | null = null,
  now: number = Date.now()
): number {
  if (enabled && !wasEnabled) return 0
  const cadence = syncIntervalMs(states)
  if (fiveHourResetAt === null) return cadence
  const untilResetMs = fiveHourResetAt * 1_000 - now
  if (untilResetMs <= 0) return MIN_SAMPLE_GAP_MS
  return Math.max(MIN_SAMPLE_GAP_MS, Math.min(cadence, untilResetMs))
}

/**
 * Which sample to keep as the next comparison baseline. A five-hour reset
 * always replaces the expired window, even if the pair is closer together
 * than the usual gap.
 */
export function recordWindowSample(
  previous: WindowSample | null,
  current: WindowSample
): WindowSample {
  if (previous === null) return current
  if (isFiveHourResetJump(previous, current)) return current
  if (current.at - previous.at >= MIN_SAMPLE_GAP_MS) return current
  return previous
}
