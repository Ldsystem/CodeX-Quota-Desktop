/**
 * Mapping of the Codex usage endpoint onto the domain model.
 *
 * The endpoint is undocumented, so every field is treated as optional and a
 * missing or malformed one degrades to null rather than to a zero the UI would
 * render as fact.
 *
 * Both API slots are optional. Every populated window is kept, and its own
 * `limit_window_seconds` says what to call it rather than the slot name.
 */

import type { QuotaWindow } from '../../shared/codex-quota'

export interface MappedUsage {
  plan: string | null
  windows: QuotaWindow[]
  availableResetCredits: number | null
  /** False when the response reported no allowance at all. */
  usable: boolean
}

type Json = Record<string, unknown>

function asRecord(value: unknown): Json | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Json)
    : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function readWindow(value: unknown): QuotaWindow {
  const window = asRecord(value)
  return {
    usedPercent: asNumber(window?.used_percent),
    resetAt: asNumber(window?.reset_at),
    limitWindowSeconds: asNumber(window?.limit_window_seconds),
    exhausted: false
  }
}

export function mapUsageResponse(body: unknown): MappedUsage {
  const root = asRecord(body) ?? {}
  const rateLimit = asRecord(root.rate_limit)
  const windows = [readWindow(rateLimit?.primary_window), readWindow(rateLimit?.secondary_window)]
    .filter((window) => window.usedPercent !== null || window.limitWindowSeconds !== null)

  if (rateLimit?.limit_reached === true && windows.length > 0) {
    const limiting = windows.reduce((most, window, index) =>
      (window.usedPercent ?? -1) > (windows[most]?.usedPercent ?? -1) ? index : most
    , 0)
    windows[limiting] = { ...windows[limiting], exhausted: true }
  }

  windows.sort(
    (a, b) => (a.limitWindowSeconds ?? Number.POSITIVE_INFINITY) -
      (b.limitWindowSeconds ?? Number.POSITIVE_INFINITY)
  )
  const plan = asText(root.plan_type)

  return {
    plan: plan === null ? null : plan.toLowerCase(),
    windows,
    availableResetCredits: asNumber(asRecord(root.rate_limit_reset_credits)?.available_count),
    usable: windows.length > 0
  }
}
