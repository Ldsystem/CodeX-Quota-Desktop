import { describe, expect, it } from 'vitest'

import { mapProfileResponse } from '../profile'

/** Shaped after a real `/backend-api/wham/profiles/me` response. */
const sample = {
  profile: { username: 'someone', display_name: 'Someone', profile_picture_url: null },
  stats: {
    lifetime_tokens: 2_015_348_340,
    peak_daily_tokens: 242_658_420,
    current_streak_days: 0,
    longest_streak_days: 36,
    total_threads: 310,
    longest_running_turn_sec: 12_642,
    daily_usage_buckets: [
      { start_date: '2026-05-22', tokens: 8_504_209 },
      { start_date: '2026-05-23', tokens: 4_574_090 },
      { start_date: '2026-08-05', tokens: 2_099_402 }
    ],
    cumulative_daily_usage_buckets: [{ start_date: '2026-05-22', tokens: 8_504_209 }],
    weekly_usage_buckets: [{ start_date: '2026-05-18', tokens: 32_184_968 }]
  },
  metadata: { stats_as_of: '2026-08-12', generated_at: '2026-08-12T14:07:40Z', stats_error: null }
}

describe('mapProfileResponse', () => {
  it('reads the statistics and the daily series', () => {
    expect(mapProfileResponse(sample)).toEqual({
      lifetimeTokens: 2_015_348_340,
      peakDailyTokens: 242_658_420,
      currentStreakDays: 0,
      longestStreakDays: 36,
      totalThreads: 310,
      longestTurnSeconds: 12_642,
      since: '2026-05-22',
      statsAsOf: '2026-08-12',
      daily: [
        { date: '2026-05-22', tokens: 8_504_209 },
        { date: '2026-05-23', tokens: 4_574_090 },
        { date: '2026-08-05', tokens: 2_099_402 }
      ]
    })
  })

  it('keeps the totals when the series is missing', () => {
    const usage = mapProfileResponse({ stats: { lifetime_tokens: 12 } })
    expect(usage?.lifetimeTokens).toBe(12)
    expect(usage?.daily).toEqual([])
    expect(usage?.since).toBeNull()
    expect(usage?.peakDailyTokens).toBeNull()
  })

  it('returns null when the response carries no statistics at all', () => {
    expect(mapProfileResponse({ profile: { username: 'someone' } })).toBeNull()
    expect(mapProfileResponse(null)).toBeNull()
    expect(mapProfileResponse({ stats: { lifetime_tokens: 0, daily_usage_buckets: [] } })).toBeNull()
  })

  it('sorts the series oldest first and drops malformed buckets', () => {
    const usage = mapProfileResponse({
      stats: {
        lifetime_tokens: 3,
        daily_usage_buckets: [
          { start_date: '2026-08-02', tokens: 2 },
          { start_date: '2026-08-01', tokens: 1 },
          { tokens: 9 },
          { start_date: '2026-08-03' }
        ]
      }
    })
    expect(usage?.daily).toEqual([
      { date: '2026-08-01', tokens: 1 },
      { date: '2026-08-02', tokens: 2 }
    ])
    expect(usage?.since).toBe('2026-08-01')
  })
})
