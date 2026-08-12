/**
 * Token refresh, using the same client id and endpoint as the Codex CLI.
 *
 * A stored profile credential is only refreshed when it is byte-identical to
 * the live one. Refreshing an idle profile would invalidate the copy Codex
 * Desktop is holding, so a profile that has drifted is left alone and reported
 * as stale instead.
 */

import { readAuthCredentials, readAuthDocument } from './auth-file'
import { writeFileAtomic } from './atomic'
import { sha256File } from './checksum'
import { requestJson } from './http'
import { isJwtExpired } from './jwt'
import type { CodexQuotaPaths } from './paths'

type Json = Record<string, unknown>

function asRecord(value: unknown): Json | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Json)
    : null
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** True when writing to this file cannot desynchronise anything else. */
export async function mayRefresh(paths: CodexQuotaPaths, authPath: string): Promise<boolean> {
  if (authPath === paths.liveAuth) return true

  const [liveSha, profileSha] = await Promise.all([
    sha256File(paths.liveAuth),
    sha256File(authPath)
  ])
  return liveSha !== null && profileSha !== null && liveSha === profileSha
}

export async function refreshAuthFile(
  paths: CodexQuotaPaths,
  authPath: string
): Promise<boolean> {
  const document = await readAuthDocument(authPath)
  const credentials = await readAuthCredentials(authPath)
  if (!document || !credentials?.refreshToken) return false

  const previousSha = await sha256File(authPath)

  let response: Awaited<ReturnType<typeof requestJson>>
  try {
    response = await requestJson(paths.tokenUrl, {
      method: 'POST',
      proxyUrl: paths.proxyUrl,
      json: {
        client_id: paths.oauthClientId,
        grant_type: 'refresh_token',
        refresh_token: credentials.refreshToken,
        scope: 'openid profile email'
      }
    })
  } catch {
    return false
  }

  const payload = asRecord(response.body)
  const accessToken = asText(payload?.access_token)
  if (response.status !== 200 || accessToken === null) return false

  const tokens = { ...(asRecord(document.tokens) ?? {}) }
  tokens.access_token = accessToken
  tokens.refresh_token = asText(payload?.refresh_token) ?? tokens.refresh_token
  tokens.id_token = asText(payload?.id_token) ?? tokens.id_token

  await writeFileAtomic(
    authPath,
    `${JSON.stringify({ ...document, tokens, last_refresh: new Date().toISOString() })}\n`
  )

  await syncLiveIfShared(paths, authPath, previousSha)
  return true
}

/** Keeps Codex Desktop on the token we just refreshed, if it was holding it. */
async function syncLiveIfShared(
  paths: CodexQuotaPaths,
  authPath: string,
  previousSha: string | null
): Promise<void> {
  if (authPath === paths.liveAuth || previousSha === null) return

  const liveSha = await sha256File(paths.liveAuth)
  if (liveSha !== previousSha) return

  const document = await readAuthDocument(authPath)
  if (!document) return
  await writeFileAtomic(paths.liveAuth, `${JSON.stringify(document)}\n`)
}

/** Refreshes only an expired token, and only when that is safe. */
export async function refreshIfExpired(
  paths: CodexQuotaPaths,
  authPath: string
): Promise<boolean> {
  const credentials = await readAuthCredentials(authPath)
  if (!credentials?.accessToken) return false
  if (!isJwtExpired(credentials.accessToken)) return false
  if (!(await mayRefresh(paths, authPath))) return false
  return refreshAuthFile(paths, authPath)
}
