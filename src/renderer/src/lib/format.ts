import type { QuotaWindow } from '../../../shared/codex-quota'

export const EM_DASH_FREE_PLACEHOLDER = 'Unknown'

export function percentLeft(window: QuotaWindow): number | null {
  if (window.usedPercent === null) return null
  return Math.min(100, Math.max(0, Math.round(100 - window.usedPercent)))
}

export type QuotaLevel = 'healthy' | 'low' | 'critical' | 'unknown'

export function quotaLevel(left: number | null): QuotaLevel {
  if (left === null) return 'unknown'
  if (left <= 10) return 'critical'
  if (left <= 35) return 'low'
  return 'healthy'
}

export function formatPercent(left: number | null): string {
  return left === null ? EM_DASH_FREE_PLACEHOLDER : `${left}%`
}

// Pinned to en-US so dates read consistently with the rest of the copy.
const LOCALE = 'en-US'
const TIME_FORMAT = new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit' })
const WEEKDAY_TIME_FORMAT = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'short',
  hour: 'numeric',
  minute: '2-digit'
})
const DATE_FORMAT = new Intl.DateTimeFormat(LOCALE, { month: 'short', day: 'numeric' })

export function formatResetAt(resetAt: number | null, now: Date): string {
  if (resetAt === null) return EM_DASH_FREE_PLACEHOLDER
  const target = new Date(resetAt * 1000)
  const dayDelta = calendarDayDelta(now, target)
  if (dayDelta === 0) return `Today ${TIME_FORMAT.format(target)}`
  if (dayDelta === 1) return `Tomorrow ${TIME_FORMAT.format(target)}`
  if (dayDelta > 1 && dayDelta < 7) return WEEKDAY_TIME_FORMAT.format(target)
  return `${DATE_FORMAT.format(target)} ${TIME_FORMAT.format(target)}`
}

export function formatCountdown(resetAt: number | null, now: Date): string | null {
  if (resetAt === null) return null
  const seconds = resetAt - Math.floor(now.getTime() / 1000)
  if (seconds <= 0) return 'due now'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    return `in ${days}d ${hours % 24}h`
  }
  if (hours > 0) return `in ${hours}h ${minutes}m`
  return `in ${minutes}m`
}

export function formatFetchedAt(iso: string, now: Date): string {
  const fetched = new Date(iso)
  const seconds = Math.max(0, Math.floor((now.getTime() - fetched.getTime()) / 1000))
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  return TIME_FORMAT.format(fetched)
}

/**
 * Names the allowance window the API reported. Paid plans get a week, free
 * plans a month, so nothing may assume "weekly".
 */
export function describeWindow(seconds: number | null): string {
  if (seconds === null) return 'Quota'
  if (seconds === 604_800) return 'Weekly'
  if (seconds === 2_592_000) return 'Monthly'
  if (seconds === 86_400) return 'Daily'
  if (seconds % 86_400 === 0) return `${seconds / 86_400}-day`
  return `${Math.max(1, Math.round(seconds / 3600))}-hour`
}

export function formatDuration(seconds: number | null): string | null {
  if (seconds === null || seconds <= 0) return null
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.round((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

/** Token counts get large fast, so they are always abbreviated. */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000_000) return `${(tokens / 1_000_000_000).toFixed(1)}B`
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`
  return String(tokens)
}

export function formatPlan(plan: string | null): string {
  if (!plan) return EM_DASH_FREE_PLACEHOLDER
  return plan.charAt(0).toUpperCase() + plan.slice(1)
}

export function formatExpiry(isoDate: string | null): string {
  if (!isoDate) return EM_DASH_FREE_PLACEHOLDER
  const parsed = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return isoDate
  return `${DATE_FORMAT.format(parsed)}, ${parsed.getFullYear()}`
}

function calendarDayDelta(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime()
  return Math.round((b - a) / 86_400_000)
}
