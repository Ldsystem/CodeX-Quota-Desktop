/**
 * Mapping of the Codex usage endpoint onto the domain model.
 *
 * The endpoint is undocumented, so every field is treated as optional and a
 * missing or malformed one degrades to null rather than to a zero the UI would
 * render as fact.
 *
 * Live responses now carry the whole allowance in `primary_window` and leave
 * `secondary_window` null, which is the reverse of what the bash CLI assumed
 * back when a 5-hour window existed alongside a weekly one. Whichever window is
 * populated wins, and its `limit_window_seconds` says what to call it.
 */

import type { QuotaWindow } from '../../shared/codex-quota'

export interface MappedUsage {
  plan: string | null
  window: QuotaWindow
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

function readWindow(value: unknown, exhausted: boolean): QuotaWindow {
  const window = asRecord(value)
  return {
    usedPercent: asNumber(window?.used_percent),
    resetAt: asNumber(window?.reset_at),
    limitWindowSeconds: asNumber(window?.limit_window_seconds),
    exhausted
  }
}

export function mapUsageResponse(body: unknown): MappedUsage {
  const root = asRecord(body) ?? {}
  const rateLimit = asRecord(root.rate_limit)
  const exhausted = rateLimit?.limit_reached === true
  const primary = readWindow(rateLimit?.primary_window, exhausted)
  const secondary = readWindow(rateLimit?.secondary_window, exhausted)
  const window = primary.usedPercent === null && secondary.usedPercent !== null ? secondary : primary
  const plan = asText(root.plan_type)

  return {
    plan: plan === null ? null : plan.toLowerCase(),
    window,
    availableResetCredits: asNumber(asRecord(root.rate_limit_reset_credits)?.available_count),
    usable: window.usedPercent !== null
  }
}

