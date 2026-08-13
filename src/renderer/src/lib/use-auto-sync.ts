/**
 * The background sync, and the one thing derived from it.
 *
 * Only the panel runs this. It is the window that outlives the workbench, so it
 * is the only surface that can promise the menu bar figure keeps moving while
 * everything else is closed. Running it in both windows would double every
 * request for no extra freshness.
 *
 * There is a single timer. Each pass re-reads what the workbench already knows
 * how to read; the question of whether an account's quota window ever started
 * is answered from those readings rather than from any traffic of its own, and
 * starting one goes through the ordinary action path so it surfaces as a toast
 * instead of happening invisibly.
 */

import { useEffect, useRef, useState } from 'react'

import {
  MIN_SAMPLE_GAP_MS,
  classifyWindow,
  shouldPrime,
  syncIntervalMs
} from '../../../shared/auto-sync'
import type { WindowSample, WindowState } from '../../../shared/auto-sync'
import type { WorkbenchState } from './use-workbench'

export function useAutoSync(bench: WorkbenchState, enabled: boolean): Record<string, WindowState> {
  const [states, setStates] = useState<Record<string, WindowState>>({})
  const samples = useRef<Record<string, WindowSample>>({})
  const primedAt = useRef<Record<string, number>>({})

  // The effects below drive the bench without depending on its identity, which
  // changes on every render and would restart the timer before it ever fired.
  const latest = useRef(bench)
  latest.current = bench

  useEffect(() => {
    const next: Record<string, WindowState> = {}

    for (const account of latest.current.accounts) {
      const known = states[account.account]

      if (account.quota.status !== 'ready') {
        // A reading in flight is not evidence of anything either way.
        if (known) next[account.account] = known
        continue
      }

      const report = account.quota.report
      const current: WindowSample = {
        resetAt: report.window.resetAt,
        usedPercent: report.window.usedPercent,
        // When the reading was taken, not when this ran: the comparison is
        // between two observations of the server, not two renders.
        at: Date.parse(report.fetchedAt)
      }
      const previous = samples.current[account.account] ?? null

      if (previous !== null && previous.at === current.at) {
        if (known) next[account.account] = known
        continue
      }

      const verdict = classifyWindow(previous, current)
      next[account.account] = verdict === 'unknown' ? (known ?? 'unknown') : verdict

      // A sample too close to the last one is kept out of the record, or the
      // baseline would keep being replaced by one too recent to compare with.
      if (previous === null || current.at - previous.at >= MIN_SAMPLE_GAP_MS) {
        samples.current[account.account] = current
      }
    }

    setStates((current) => (same(current, next) ? current : next))
  }, [bench.accounts, states])

  // Re-armed rather than repeating, so the cadence can follow the verdicts:
  // often while something is still undecided, sparingly once all is known.
  useEffect(() => {
    if (!enabled) return undefined

    const timer = window.setTimeout(
      () => latest.current.refreshAll(),
      syncIntervalMs(Object.values(states))
    )
    return () => window.clearTimeout(timer)
  }, [enabled, states])

  useEffect(() => {
    if (!enabled) return

    const now = Date.now()
    // One per pass. Several accounts starting their windows at once would be a
    // burst of billed requests off a single timer tick.
    const candidate = latest.current.accounts.find((account) =>
      shouldPrime({
        autoSync: enabled,
        hasStoredAuth: account.hasStoredAuth,
        state: states[account.account] ?? 'unknown',
        busy: latest.current.jobFor(account.account) !== undefined,
        lastPrimedAt: primedAt.current[account.account] ?? null,
        now
      })
    )
    if (!candidate) return

    primedAt.current[candidate.account] = now
    latest.current.runAction('start-window', candidate.account)
  }, [enabled, states])

  return states
}

function same(a: Record<string, WindowState>, b: Record<string, WindowState>): boolean {
  const keys = Object.keys(b)
  if (Object.keys(a).length !== keys.length) return false
  return keys.every((key) => a[key] === b[key])
}
