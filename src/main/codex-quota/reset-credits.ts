/**
 * Mapping of the Codex reset-credit list and consume endpoints.
 *
 * Paths match the official ChatGptApi WHAM contract: GET/POST under the same
 * usage origin this app already calls for allowance. Missing fields degrade to
 * null or empty rather than invented zeros or guessed credit ids.
 */

export interface ResetCredit {
  id: string
  status: string
  expiresAt: string | null
}

export interface MappedResetCreditsList {
  credits: ResetCredit[]
  availableCount: number | null
}

export interface MappedConsumeOutcome {
  ok: boolean
  code: string | null
}

type Json = Record<string, unknown>

const SUCCESS_CODES = new Set(['reset', 'already_redeemed'])
const FAILURE_CODES = new Set(['no_credit', 'nothing_to_reset'])

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

function asIsoTimestamp(value: unknown): string | null {
  const text = asText(value)
  if (text === null) return null
  const parsed = Date.parse(text)
  return Number.isFinite(parsed) ? text : null
}

export function resetCreditsOrigin(usageUrl: string): string | null {
  try {
    const url = new URL(usageUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.hostname.length === 0) return null
    const path = url.pathname.replace(/\/usage\/?$/, '')
    return `${url.origin}${path}`
  } catch {
    return null
  }
}

export function resetCreditsListUrl(usageUrl: string): string | null {
  const origin = resetCreditsOrigin(usageUrl)
  return origin === null ? null : `${origin}/rate-limit-reset-credits`
}

export function resetCreditsConsumeUrl(usageUrl: string): string | null {
  const origin = resetCreditsOrigin(usageUrl)
  return origin === null ? null : `${origin}/rate-limit-reset-credits/consume`
}

function readCredit(value: unknown): ResetCredit | null {
  const credit = asRecord(value)
  const id = asText(credit?.id)
  const status = asText(credit?.status)
  if (id === null || status === null) return null
  return {
    id,
    status,
    expiresAt: asIsoTimestamp(credit?.expires_at)
  }
}

export function mapResetCreditsList(body: unknown): MappedResetCreditsList {
  const root = asRecord(body) ?? {}
  const credits = Array.isArray(root.credits)
    ? root.credits.map(readCredit).filter((credit): credit is ResetCredit => credit !== null)
    : []
  return {
    credits,
    availableCount: asNumber(root.available_count)
  }
}

export function selectConsumableCredit(credits: readonly ResetCredit[]): ResetCredit | null {
  const available = credits.filter((credit) => credit.status === 'available')
  if (available.length === 0) return null
  if (available.some((credit) => credit.expiresAt === null)) return available[0] ?? null

  return [...available].sort((a, b) => String(a.expiresAt).localeCompare(String(b.expiresAt)))[0] ?? null
}

/** `available_count` is enablement authority when present; missing count still uses credit ids. */
export function selectCreditForConsume(list: MappedResetCreditsList): ResetCredit | null {
  if (list.availableCount !== null && !(list.availableCount > 0)) return null
  return selectConsumableCredit(list.credits)
}

export function mapConsumeOutcome(body: unknown, status: number): MappedConsumeOutcome {
  const code = asText(asRecord(body)?.code)
  if (status !== 200) return { ok: false, code }
  if (code !== null && SUCCESS_CODES.has(code)) return { ok: true, code }
  if (code !== null && FAILURE_CODES.has(code)) return { ok: false, code }
  return { ok: false, code }
}
