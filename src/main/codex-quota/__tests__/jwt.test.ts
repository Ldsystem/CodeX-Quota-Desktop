import { describe, expect, it } from 'vitest'

import { decodeJwtClaims, isJwtExpired } from '../jwt'

/** Mirrors how the CLI reads claims: base64url payload, no signature check. */
function makeJwt(payload: Record<string, unknown>): string {
  const encode = (value: object): string =>
    Buffer.from(JSON.stringify(value))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  return `${encode({ alg: 'none' })}.${encode(payload)}.signature`
}

describe('decodeJwtClaims', () => {
  it('reads plan and subscription expiry from the namespaced auth claim', () => {
    const jwt = makeJwt({
      'https://api.openai.com/auth': {
        chatgpt_plan_type: 'Plus',
        chatgpt_subscription_active_until: '2026-11-04T00:00:00Z'
      },
      email: 'someone@example.com',
      exp: 1_800_000_000
    })

    expect(decodeJwtClaims(jwt)).toEqual({
      plan: 'plus',
      subscriptionExpiresOn: '2026-11-04',
      email: 'someone@example.com',
      exp: 1_800_000_000
    })
  })

  it('falls back to top level claims', () => {
    const jwt = makeJwt({ chatgpt_plan_type: 'PRO', chatgpt_subscription_active_until: '2027-02-28' })
    const claims = decodeJwtClaims(jwt)
    expect(claims?.plan).toBe('pro')
    expect(claims?.subscriptionExpiresOn).toBe('2027-02-28')
  })

  it('returns null for a token that is not decodable', () => {
    expect(decodeJwtClaims('not-a-jwt')).toBeNull()
    expect(decodeJwtClaims('')).toBeNull()
  })
})

describe('isJwtExpired', () => {
  it('compares exp against the supplied instant', () => {
    const jwt = makeJwt({ exp: 1_000 })
    expect(isJwtExpired(jwt, 1_001)).toBe(true)
    expect(isJwtExpired(jwt, 999)).toBe(false)
  })

  it('treats a missing exp as not expired, matching the CLI', () => {
    expect(isJwtExpired(makeJwt({}), 1_000)).toBe(false)
  })
})
