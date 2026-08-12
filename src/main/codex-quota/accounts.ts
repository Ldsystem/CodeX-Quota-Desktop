/**
 * The account registry: `accounts.txt`, one directory per account, and the
 * `profile.json` that records how each one is meant to be used.
 *
 * The on-disk shapes stay byte-compatible with the bash CLI, including the
 * pretty-printed JSON, because both tools may be pointed at the same
 * `~/.codex-quota` and the CLI parses these files line by line.
 */

import { mkdir, readFile, rm, stat } from 'node:fs/promises'

import { validateAccountName, type ProfileMode } from '../../shared/codex-quota'
import { writeFileAtomic } from './atomic'
import { readAuthCredentials } from './auth-file'
import { ActionError } from './errors'
import { decodeJwtClaims } from './jwt'
import {
  accountAuthPath,
  accountDir,
  accountProfilePath,
  type CodexQuotaPaths
} from './paths'

const PROFILE_MODES: readonly ProfileMode[] = ['desktop_preserving', 'cli_isolated']

export interface AddAccountOptions {
  account: string
  profileMode?: ProfileMode
}

function ensureName(account: string): string {
  const problem = validateAccountName(account)
  if (problem !== null) {
    throw new ActionError(`Invalid account name: ${JSON.stringify(account)}`, problem)
  }
  return account.trim()
}

function ensureProfileMode(mode: ProfileMode | undefined): ProfileMode {
  const resolved = mode ?? 'desktop_preserving'
  if (!PROFILE_MODES.includes(resolved)) {
    throw new ActionError(
      `Invalid profile mode: ${String(resolved)}`,
      'Use desktop_preserving or cli_isolated.'
    )
  }
  return resolved
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function initBaseDirs(paths: CodexQuotaPaths): Promise<void> {
  for (const directory of [paths.home, paths.accountsDir, paths.backupsDir]) {
    await mkdir(directory, { recursive: true, mode: 0o700 })
  }
}

export async function listAccounts(paths: CodexQuotaPaths): Promise<string[]> {
  let body: string
  try {
    body = await readFile(paths.registry, 'utf8')
  } catch {
    return []
  }

  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

export async function accountExists(paths: CodexQuotaPaths, account: string): Promise<boolean> {
  return (await listAccounts(paths)).includes(account)
}

export async function requireAccount(paths: CodexQuotaPaths, account: string): Promise<string> {
  const name = ensureName(account)
  if (!(await accountExists(paths, name))) {
    throw new ActionError(`Account not found: ${name}`, 'Pick an account that is registered here.')
  }
  return name
}

async function writeRegistry(paths: CodexQuotaPaths, names: readonly string[]): Promise<void> {
  await initBaseDirs(paths)
  await writeFileAtomic(paths.registry, names.length === 0 ? '' : `${names.join('\n')}\n`)
}

function profileDocument(
  paths: CodexQuotaPaths,
  account: string,
  profileMode: ProfileMode,
  createdAt: string
): string {
  return `${JSON.stringify(
    {
      name: account,
      codexHome: accountDir(paths, account),
      createdAt,
      displayName: account,
      profileMode,
      activeCredentialPath: paths.liveAuth
    },
    null,
    2
  )}\n`
}

export async function writeProfile(
  paths: CodexQuotaPaths,
  account: string,
  profileMode: ProfileMode,
  createdAt: string = new Date().toISOString()
): Promise<void> {
  await writeFileAtomic(
    accountProfilePath(paths, account),
    profileDocument(paths, account, profileMode, createdAt)
  )
}

export async function addAccount(
  paths: CodexQuotaPaths,
  options: AddAccountOptions
): Promise<string> {
  const account = ensureName(options.account)
  const profileMode = ensureProfileMode(options.profileMode)

  const names = await listAccounts(paths)
  if (names.includes(account)) {
    throw new ActionError(
      `Account already exists: ${account}`,
      'Choose a different name, or remove the existing account first.'
    )
  }

  await initBaseDirs(paths)

  const directory = accountDir(paths, account)
  if (await exists(directory)) {
    throw new ActionError(
      `Account path already exists: ${directory}`,
      'Remove the conflicting directory, or choose a different account name.'
    )
  }

  await mkdir(directory, { recursive: true, mode: 0o700 })

  try {
    await writeRegistry(paths, [...names, account])
    await writeProfile(paths, account, profileMode)
  } catch (error) {
    // Never leave a half-registered account behind.
    await writeRegistry(paths, names).catch(() => undefined)
    await rm(directory, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }

  return account
}

export async function removeAccount(paths: CodexQuotaPaths, account: string): Promise<void> {
  const name = await requireAccount(paths, account)
  const names = await listAccounts(paths)

  await writeRegistry(
    paths,
    names.filter((candidate) => candidate !== name)
  )
  await rm(accountDir(paths, name), { recursive: true, force: true })
}

export async function readProfileMode(
  paths: CodexQuotaPaths,
  account: string
): Promise<ProfileMode> {
  const path = accountProfilePath(paths, account)

  let document: unknown
  try {
    document = JSON.parse(await readFile(path, 'utf8'))
  } catch {
    throw new ActionError(
      `Profile metadata not found for ${account}`,
      'Recreate the account, or restore its profile.json.'
    )
  }

  const mode = (document as { profileMode?: unknown } | null)?.profileMode
  const resolved = PROFILE_MODES.find((candidate) => candidate === mode)
  if (resolved === undefined) {
    throw new ActionError(
      `Profile mode missing for ${account}`,
      'Repair profile.json, or recreate the account.'
    )
  }

  return resolved
}

/**
 * Best effort: the email is a display convenience, so a credential that does
 * not carry one leaves the profile exactly as it was.
 */
export async function syncProfileEmail(paths: CodexQuotaPaths, account: string): Promise<void> {
  const credentials = await readAuthCredentials(accountAuthPath(paths, account))
  const email = credentials?.idToken ? decodeJwtClaims(credentials.idToken)?.email : null
  if (!email) return

  const path = accountProfilePath(paths, account)
  let document: Record<string, unknown>
  try {
    document = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
  } catch {
    return
  }

  if (document.email === email) return
  await writeFileAtomic(path, `${JSON.stringify({ ...document, email }, null, 2)}\n`)
}

export { ensureName as ensureAccountName, initBaseDirs as ensureStorage }
