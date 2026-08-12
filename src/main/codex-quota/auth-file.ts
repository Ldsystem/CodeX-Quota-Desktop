/**
 * Reading `auth.json`, in both the shapes Codex has written over time: fields
 * at the root, or nested under `tokens`, in snake or camel case.
 *
 * Nothing here returns a token to the renderer. `inspectAuthFile` answers
 * presence questions only; `readAuthCredentials` stays inside the main process
 * and exists solely to build the usage request.
 */

import { readFile } from 'node:fs/promises'

export interface AuthInspection {
  exists: boolean
  parsable: boolean
  hasAccessToken: boolean
  hasRefreshToken: boolean
  authenticated: boolean
}

export interface AuthCredentials {
  accessToken: string | null
  refreshToken: string | null
  idToken: string | null
  accountId: string | null
}

type Json = Record<string, unknown>

const ABSENT: AuthInspection = {
  exists: false,
  parsable: false,
  hasAccessToken: false,
  hasRefreshToken: false,
  authenticated: false
}

function asRecord(value: unknown): Json | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Json)
    : null
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function pick(root: Json, keys: readonly string[]): string | null {
  const tokens = asRecord(root.tokens)
  for (const key of keys) {
    const found = asText(root[key]) ?? asText(tokens?.[key])
    if (found !== null) return found
  }
  return null
}

function readCredentials(root: Json): AuthCredentials {
  return {
    accessToken: pick(root, ['access_token', 'accessToken']),
    refreshToken: pick(root, ['refresh_token', 'refreshToken']),
    idToken: pick(root, ['id_token', 'idToken']),
    accountId: pick(root, ['account_id', 'accountId'])
  }
}

async function parse(path: string): Promise<{ exists: boolean; root: Json | null }> {
  let body: string
  try {
    body = await readFile(path, 'utf8')
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === 'ENOENT'
    return { exists: !missing, root: null }
  }

  try {
    return { exists: true, root: asRecord(JSON.parse(body)) }
  } catch {
    return { exists: true, root: null }
  }
}

export async function inspectAuthFile(path: string): Promise<AuthInspection> {
  const { exists, root } = await parse(path)
  if (!exists) return ABSENT
  if (!root) return { ...ABSENT, exists: true }

  const credentials = readCredentials(root)
  // An API key is not an OAuth token, but it does mean the profile can talk to
  // the API, so the CLI counts it as one for the authenticated column.
  const hasAccessToken =
    credentials.accessToken !== null || asText(root.OPENAI_API_KEY) !== null

  return {
    exists: true,
    parsable: true,
    hasAccessToken,
    hasRefreshToken: credentials.refreshToken !== null,
    authenticated: hasAccessToken
  }
}

export async function readAuthCredentials(path: string): Promise<AuthCredentials | null> {
  const { root } = await parse(path)
  return root ? readCredentials(root) : null
}

/**
 * The whole document, token values included. Only the refresh path needs this,
 * because it has to rewrite the file without discarding fields it does not
 * understand. It must never leave the main process.
 */
export async function readAuthDocument(path: string): Promise<Json | null> {
  return (await parse(path)).root
}
