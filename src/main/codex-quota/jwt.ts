/**
 * Claim reading for Codex id and access tokens.
 *
 * Signatures are never verified, exactly as the CLI does not verify them: the
 * token was written by Codex itself and is only read here to label a plan and
 * decide whether a refresh is due.
 */

export interface JwtClaims {
  /** Lower-cased, e.g. `plus`, `pro`. */
  plan: string | null
  /** yyyy-mm-dd when the claim carries a parseable date, else the raw value. */
  subscriptionExpiresOn: string | null
  email: string | null
  /** Epoch seconds. */
  exp: number | null
}

const AUTH_CLAIM = 'https://api.openai.com/auth'
const ISO_DATE = /^(\d{4}-\d{2}-\d{2})/

type Claims = Record<string, unknown>

function asRecord(value: unknown): Claims | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Claims)
    : null
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function decodePayload(jwt: string): Claims | null {
  const parts = jwt.split('.')
  if (parts.length < 2) return null

  const payload = parts[1]
  if (!payload) return null

  try {
    return asRecord(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')))
  } catch {
    return null
  }
}

function normalizeExpiry(raw: string | null): string | null {
  if (raw === null) return null
  return ISO_DATE.exec(raw)?.[1] ?? raw
}

export function decodeJwtClaims(jwt: string): JwtClaims | null {
  const payload = decodePayload(jwt)
  if (!payload) return null

  const scoped = asRecord(payload[AUTH_CLAIM])
  const tokens = asRecord(payload.tokens)
  const plan = asText(scoped?.chatgpt_plan_type) ?? asText(payload.chatgpt_plan_type)
  const expires =
    asText(scoped?.chatgpt_subscription_active_until) ??
    asText(payload.chatgpt_subscription_active_until)

  return {
    plan: plan === null ? null : plan.toLowerCase(),
    subscriptionExpiresOn: normalizeExpiry(expires),
    email: asText(payload.email) ?? asText(tokens?.email),
    exp: typeof payload.exp === 'number' ? payload.exp : null
  }
}

/** A token without an `exp` is treated as live, matching the CLI's refresh check. */
export function isJwtExpired(jwt: string, nowSeconds: number = Date.now() / 1000): boolean {
  const exp = decodeJwtClaims(jwt)?.exp
  if (exp === null || exp === undefined) return false
  return nowSeconds >= exp
}
