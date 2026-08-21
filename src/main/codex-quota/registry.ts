/**
 * The local read: which accounts exist, what each one stores, and which one the
 * live credential belongs to. No network, so this is what the workbench paints
 * on first frame.
 */

import { readFile } from 'node:fs/promises'

import type {
  AccountRecord,
  EnvironmentSnapshot,
  ProfileMode,
  RegistrySnapshot,
  TriState,
  WarningLabel
} from '../../shared/codex-quota'
import { reconcileActiveCredentialUnderLock } from './active'
import { inspectAuthFile } from './auth-file'
import { sha256File } from './checksum'
import { withCredentialStateLock } from './credential-state-lock'
import { accountAuthPath, accountProfilePath, type CodexQuotaPaths } from './paths'

export interface RegistryOptions {
  /** Observed by the caller, since detection shells out. */
  desktopRunning: boolean
  /** Resolved by the caller, since the search order lives with the spawner. */
  codexBinary?: string | null
}

interface ActiveRecord {
  account: string
  activeAuthSha256: string | null
  profileAuthSha256: string | null
}

type Json = Record<string, unknown>

const PROFILE_MODES: readonly ProfileMode[] = ['desktop_preserving', 'cli_isolated']

function asRecord(value: unknown): Json | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Json)
    : null
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

async function readJson(path: string): Promise<Json | null> {
  try {
    return asRecord(JSON.parse(await readFile(path, 'utf8')))
  } catch {
    return null
  }
}

async function readAccountNames(registry: string): Promise<string[]> {
  let body: string
  try {
    body = await readFile(registry, 'utf8')
  } catch {
    return []
  }

  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

async function readProfileMode(path: string): Promise<ProfileMode> {
  const mode = asText((await readJson(path))?.profileMode)
  return PROFILE_MODES.find((candidate) => candidate === mode) ?? 'desktop_preserving'
}

async function readActiveRecord(path: string): Promise<ActiveRecord | null> {
  const active = await readJson(path)
  const account = asText(active?.account)
  if (account === null) return null

  return {
    account,
    activeAuthSha256: asText(active?.activeAuthSha256),
    profileAuthSha256: asText(active?.profileAuthSha256)
  }
}

/**
 * `active.json` is only believed when both digests it recorded still hold and
 * agree with each other. Anything else is drift: something moved the credential
 * behind the app's back, and claiming an account is live would be a lie.
 */
function resolveActive(
  account: string,
  active: ActiveRecord | null,
  liveSha: string | null,
  profileSha: string | null
): { state: TriState; drifted: boolean } {
  if (active === null) {
    const shared = liveSha !== null && profileSha !== null && liveSha === profileSha
    return { state: shared ? 'yes' : 'no', drifted: false }
  }

  if (active.account !== account) return { state: 'no', drifted: false }

  const matched =
    liveSha !== null &&
    profileSha !== null &&
    liveSha === active.activeAuthSha256 &&
    profileSha === active.profileAuthSha256 &&
    liveSha === profileSha

  return matched ? { state: 'yes', drifted: false } : { state: 'unknown', drifted: true }
}

/**
 * Cheap enough to repeat on its own, which is how the workbench keeps the
 * Desktop indicator honest: Codex can be opened or quit at any moment, with
 * nothing in the registry changing to announce it.
 */
export async function readEnvironmentSnapshot(
  paths: CodexQuotaPaths,
  options: RegistryOptions,
  active?: ActiveRecord | null
): Promise<EnvironmentSnapshot> {
  const record = active === undefined ? await readActiveRecord(paths.activeJson) : active

  return {
    desktopRunning: options.desktopRunning,
    storageRoot: paths.home,
    liveAuthPath: paths.liveAuth,
    backupsPath: paths.backupsDir,
    activeAccount: record?.account ?? null,
    codexBinary: options.codexBinary ?? null,
    proxyUrl: paths.proxyUrl,
    usageApiUrl: paths.usageUrl,
    windowStartModel: paths.windowStartModel,
    windowStartReasoningEffort: paths.windowStartReasoningEffort
  }
}

export async function readRegistrySnapshot(
  paths: CodexQuotaPaths,
  options: RegistryOptions
): Promise<RegistrySnapshot> {
  return withCredentialStateLock(paths.liveAuth, async () => {
    const names = await readAccountNames(paths.registry)
    // Codex may legitimately rotate the live OAuth credential between reads.
    // Reconcile only a provable same-account update, then observe the resulting
    // files before another in-process credential mutation can begin.
    await reconcileActiveCredentialUnderLock(paths, names)

    const [active, liveSha] = await Promise.all([
      readActiveRecord(paths.activeJson),
      sha256File(paths.liveAuth)
    ])
    const accounts = await Promise.all(
      names.map((account) => readAccount(paths, account, active, liveSha))
    )
    const environment = await readEnvironmentSnapshot(paths, options, active)

    return { readAt: new Date().toISOString(), environment, accounts }
  })
}

async function readAccount(
  paths: CodexQuotaPaths,
  account: string,
  active: ActiveRecord | null,
  liveSha: string | null
): Promise<AccountRecord> {
  const authPath = accountAuthPath(paths, account)
  const [profileMode, inspection, profileSha] = await Promise.all([
    readProfileMode(accountProfilePath(paths, account)),
    inspectAuthFile(authPath),
    sha256File(authPath)
  ])

  const unreadable = inspection.exists && !inspection.parsable
  const { state, drifted } = resolveActive(account, active, liveSha, profileSha)
  const warnings: WarningLabel[] = []
  if (unreadable) warnings.push('corrupt-auth')
  else if (!inspection.authenticated) warnings.push('no-auth')
  if (drifted) warnings.push('active-drift')

  const token = (present: boolean): TriState => (unreadable ? 'unknown' : present ? 'yes' : 'no')

  return {
    account,
    profileMode,
    active: state,
    hasStoredAuth: inspection.exists,
    hasAccessToken: token(inspection.hasAccessToken),
    hasRefreshToken: token(inspection.hasRefreshToken),
    authenticated: inspection.authenticated,
    warnings
  }
}
