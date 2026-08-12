/**
 * Token history from the Codex profile endpoint.
 *
 * This is the same data the Codex Desktop profile screen shows, and it is a
 * separate pipeline from the rate-limit numbers: `metadata.stats_as_of` can lag
 * a day or more behind live usage, so it is carried through rather than
 * presented as up-to-the-minute truth.
 */

import type { TokenUsage, TokenUsageDay } from '../../shared/codex-quota'

export const PROFILE_URL = 'https://chatgpt.com/backend-api/wham/profiles/me'

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

function readDay(value: unknown): TokenUsageDay | null {
  const bucket = asRecord(value)
  const date = asText(bucket?.start_date) ?? asText(bucket?.date)
  const tokens = asNumber(bucket?.tokens)
  if (date === null || tokens === null) return null
  return { date, tokens }
}

export function mapProfileResponse(body: unknown): TokenUsage | null {
  const stats = asRecord(asRecord(body)?.stats)
  if (!stats) return null

  const daily = (Array.isArray(stats.daily_usage_buckets) ? stats.daily_usage_buckets : [])
    .map(readDay)
    .filter((day): day is TokenUsageDay => day !== null)
    .sort((a, b) => a.date.localeCompare(b.date))

  const lifetimeTokens = asNumber(stats.lifetime_tokens) ?? 0
  // An account that has never spent a token has no history worth a panel.
  if (lifetimeTokens === 0 && daily.length === 0) return null

  return {
    lifetimeTokens,
    peakDailyTokens: asNumber(stats.peak_daily_tokens),
    currentStreakDays: asNumber(stats.current_streak_days),
    longestStreakDays: asNumber(stats.longest_streak_days),
    totalThreads: asNumber(stats.total_threads),
    longestTurnSeconds: asNumber(stats.longest_running_turn_sec),
    since: daily[0]?.date ?? null,
    statsAsOf: asText(asRecord(asRecord(body)?.metadata)?.stats_as_of),
    daily
  }
}
