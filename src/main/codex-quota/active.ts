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

import { validateAccountName, type ProfileMode } from '../../shared/codex-quota'
import { writeFileAtomic } from './atomic'
import { readAuthSnapshot } from './auth-file'
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

export type ActiveReconciliation = 'none' | 'matched' | 'adopted' | 'drift'

/**
 * Adopt a live credential rewritten by Codex only when the stored profile is
 * still exactly the copy recorded in active.json and both documents expose the
 * same stable account id. Any ambiguity remains drift.
 */
/** Caller must hold the live credential-state lock through its subsequent read. */
export async function reconcileActiveCredentialUnderLock(
  paths: CodexQuotaPaths,
  registeredAccounts: readonly string[]
): Promise<ActiveReconciliation> {
  const active = await readActive(paths)
  if (active === null) return 'none'

  const canonicalProfilePath = accountAuthPath(paths, active.account)
  if (
    validateAccountName(active.account) !== null ||
    !registeredAccounts.includes(active.account) ||
    active.profileAuthPath !== canonicalProfilePath
  ) {
    return 'drift'
  }

  const [live, profile] = await Promise.all([
    readAuthSnapshot(paths.liveAuth),
    readAuthSnapshot(canonicalProfilePath)
  ])
  if (live !== null && profile !== null) {
    if (
      live.sha256 === active.activeAuthSha256 &&
      profile.sha256 === active.profileAuthSha256 &&
      live.sha256 === profile.sha256
    ) {
      return 'matched'
    }
  }

  // The stored profile is the recorded identity witness. If it also moved,
  // there is no trusted copy left from which to infer ownership.
  if (
    live === null ||
    profile === null ||
    active.profileAuthSha256 === null ||
    profile.sha256 !== active.profileAuthSha256
  ) {
    return 'drift'
  }

  const liveAccountId = live.credentials.accountId
  const profileAccountId = profile.credentials.accountId
  if (
    liveAccountId === null ||
    profileAccountId === null ||
    liveAccountId !== profileAccountId
  ) {
    return 'drift'
  }

  await writeFileAtomic(canonicalProfilePath, live.body)
  await writeActive(paths, {
    account: active.account,
    source: active.source,
    profileMode: active.profileMode
  })
  return 'adopted'
}
