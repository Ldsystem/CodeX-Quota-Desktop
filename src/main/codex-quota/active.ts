/**
 * `active.json`: which account the live credential is supposed to belong to,
 * plus the digest of both copies at the moment the claim was made.
 *
 * The digests are the whole point. Codex, the CLI, and this app all write
 * `~/.codex/auth.json`, so the only way to know the record still holds is to
 * re-hash both files and compare. Written pretty-printed, one field per line,
 * because the bash CLI parses it with a per-line regex.
 */

import { readFile } from 'node:fs/promises'

import type { ProfileMode } from '../../shared/codex-quota'
import { writeFileAtomic } from './atomic'
import { sha256File } from './checksum'
import { accountAuthPath, type CodexQuotaPaths } from './paths'

export interface ActiveRecord {
  account: string
  profileMode: ProfileMode
  activeCredentialPath: string
  profileAuthPath: string
  /** Digest of `~/.codex/auth.json` when the claim was recorded. */
  activeAuthSha256: string | null
  /** Digest of the account's stored copy at the same moment. */
  profileAuthSha256: string | null
  updatedAt: string
  /** What caused the switch: `activate`, `import-active`, `login`. */
  source: string
}

export interface WriteActiveInput {
  account: string
  source: string
  profileMode: ProfileMode
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

export async function readActive(paths: CodexQuotaPaths): Promise<ActiveRecord | null> {
  let document: Record<string, unknown>
  try {
    document = JSON.parse(await readFile(paths.activeJson, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }

  const account = asText(document?.account)
  if (account === null) return null

  return {
    account,
    profileMode: document.profileMode === 'cli_isolated' ? 'cli_isolated' : 'desktop_preserving',
    activeCredentialPath: asText(document.activeCredentialPath) ?? paths.liveAuth,
    profileAuthPath: asText(document.profileAuthPath) ?? accountAuthPath(paths, account),
    activeAuthSha256: asText(document.activeAuthSha256),
    profileAuthSha256: asText(document.profileAuthSha256),
    updatedAt: asText(document.updatedAt) ?? '',
    source: asText(document.source) ?? 'unknown'
  }
}

export async function writeActive(
  paths: CodexQuotaPaths,
  input: WriteActiveInput
): Promise<ActiveRecord> {
  const profileAuthPath = accountAuthPath(paths, input.account)
  const [activeAuthSha256, profileAuthSha256] = await Promise.all([
    sha256File(paths.liveAuth),
    sha256File(profileAuthPath)
  ])

  const record: ActiveRecord = {
    account: input.account,
    profileMode: input.profileMode,
    activeCredentialPath: paths.liveAuth,
    profileAuthPath,
    activeAuthSha256,
    profileAuthSha256,
    updatedAt: new Date().toISOString(),
    source: input.source
  }

  // Missing digests are written as empty strings, matching what the CLI does
  // when `shasum` has no file to read.
  await writeFileAtomic(
    paths.activeJson,
    `${JSON.stringify(
      {
        account: record.account,
        profileMode: record.profileMode,
        activeCredentialPath: record.activeCredentialPath,
        profileAuthPath: record.profileAuthPath,
        activeAuthSha256: record.activeAuthSha256 ?? '',
        profileAuthSha256: record.profileAuthSha256 ?? '',
        updatedAt: record.updatedAt,
        source: record.source
      },
      null,
      2
    )}\n`
  )

  return record
}

/**
 * True only when the record still describes reality: both files present, both
 * matching what was recorded, and identical to each other.
 */
export async function activeMatchesAccount(
  paths: CodexQuotaPaths,
  account: string
): Promise<boolean> {
  const active = await readActive(paths)
  if (active === null || active.account !== account) return false

  const [liveSha, profileSha] = await Promise.all([
    sha256File(paths.liveAuth),
    sha256File(accountAuthPath(paths, account))
  ])

  return (
    liveSha !== null &&
    profileSha !== null &&
    liveSha === active.activeAuthSha256 &&
    profileSha === active.profileAuthSha256 &&
    liveSha === profileSha
  )
}
