/**
 * Moving credentials between the per-account store and `~/.codex/auth.json`.
 *
 * These are the operations that can destroy a credential, so each one is a
 * direct port of the bash CLI's rules rather than a simplification: refuse
 * ambiguous situations, save the outgoing credential before switching, and back
 * up the live file every single time.
 */

import { rm } from 'node:fs/promises'

import { addAccount, accountExists, readProfileMode, requireAccount, syncProfileEmail } from './accounts'
import { readActive, writeActive } from './active'
import { copyFileAtomic } from './atomic'
import { readAuthCredentials } from './auth-file'
import { backupLiveAuth } from './backup'
import { sha256File } from './checksum'
import { ActionError } from './errors'
import { accountAuthPath, type CodexQuotaPaths } from './paths'

export interface ActivateOptions {
  /** Observed by the caller; activation is refused while Desktop holds the file. */
  desktopRunning: boolean
  force?: boolean
}

export interface ActivateResult {
  backupPath: string | null
  warnings: string[]
}

async function accountIdOf(path: string): Promise<string | null> {
  return (await readAuthCredentials(path))?.accountId ?? null
}

/**
 * Before pointing the live credential at a different account, make sure the
 * account it currently belongs to keeps whatever Codex refreshed into it.
 * Anything this cannot explain is a refusal: silently overwriting would lose a
 * credential the user would have to sign in again to replace.
 */
export async function syncActiveProfileBeforeActivate(
  paths: CodexQuotaPaths,
  target: string
): Promise<string[]> {
  const active = await readActive(paths)
  if (active === null || active.account === target) return []

  const warnings: string[] = []
  const profileAuthPath = active.profileAuthPath
  const liveSha = await sha256File(paths.liveAuth)

  if (liveSha === null) {
    if (active.activeAuthSha256 !== null) {
      throw new ActionError(
        `Credential drift detected: ${paths.liveAuth} is missing, but ${active.account} is recorded as active.`,
        'Restore the live credential, or import the current one, before switching accounts.'
      )
    }
    return warnings
  }

  const profileSha = await sha256File(profileAuthPath)

  const [liveAccountId, profileAccountId] = await Promise.all([
    accountIdOf(paths.liveAuth),
    accountIdOf(profileAuthPath)
  ])
  if (liveAccountId !== null && profileAccountId !== null && liveAccountId !== profileAccountId) {
    warnings.push(
      `The live credential belongs to a different account than ${active.account}, so it was left as it is.`
    )
    return warnings
  }

  if (active.profileAuthSha256 !== null && profileSha !== null && profileSha !== active.profileAuthSha256) {
    if (active.activeAuthSha256 !== null && liveSha === active.activeAuthSha256) {
      // The stored copy moved ahead on its own; the live file still matches the
      // record, so re-recording is enough to make both consistent again.
      warnings.push(`Refreshed the active record for ${active.account} before switching.`)
      await writeActive(paths, {
        account: active.account,
        source: active.source,
        profileMode: active.profileMode
      })
      return warnings
    }

    throw new ActionError(
      `Credential drift detected for account ${active.account}.`,
      `Activate ${active.account} to reconcile it, or import the live credential again, before switching.`
    )
  }

  if (active.profileAuthSha256 !== null && profileSha === null) {
    throw new ActionError(
      `Stored profile credential missing for account ${active.account}.`,
      'Restore it, or import the live credential into that account, before switching.'
    )
  }

  if (active.activeAuthSha256 !== null && liveSha !== active.activeAuthSha256) {
    if (active.profileAuthSha256 === null) {
      throw new ActionError(
        `Credential drift detected, and no stored checksum for ${active.account} to compare against.`,
        'Import the current live credential before switching accounts.'
      )
    }

    // Codex refreshed the token in place. Save it back so the outgoing account
    // does not silently revert to an expired copy.
    warnings.push(`Saved the refreshed credential back to ${active.account}.`)
    await copyFileAtomic(paths.liveAuth, profileAuthPath)
    return warnings
  }

  if (liveSha !== profileSha) {
    await copyFileAtomic(paths.liveAuth, profileAuthPath)
  }

  return warnings
}

export async function activateAccount(
  paths: CodexQuotaPaths,
  account: string,
  options: ActivateOptions
): Promise<ActivateResult> {
  const name = await requireAccount(paths, account)
  const authPath = accountAuthPath(paths, name)

  if ((await sha256File(authPath)) === null) {
    throw new ActionError(
      `No stored credential for ${name}.`,
      'Sign in to this account, or import the live credential, before switching to it.'
    )
  }

  const profileMode = await readProfileMode(paths, name)
  const warnings: string[] = []

  if (options.desktopRunning) {
    if (options.force !== true) {
      throw new ActionError(
        'Codex Desktop appears to be running.',
        'Quit Codex Desktop and try again, or force the switch and restart Desktop afterwards.'
      )
    }
    warnings.push(
      'Codex Desktop is running; it may keep using the previous account until you restart it.'
    )
  }

  warnings.push(...(await syncActiveProfileBeforeActivate(paths, name)))

  const backupPath = await backupLiveAuth(paths)
  await copyFileAtomic(authPath, paths.liveAuth)
  await writeActive(paths, { account: name, source: 'activate', profileMode })

  return { backupPath, warnings }
}

export async function importActive(
  paths: CodexQuotaPaths,
  account: string,
  options: { create?: boolean } = {}
): Promise<void> {
  let name = account
  if (!(await accountExists(paths, account))) {
    if (options.create !== true) {
      throw new ActionError(
        `Account not found: ${account}`,
        'Create the account first, or import with the create option.'
      )
    }
    name = await addAccount(paths, { account })
  }

  if ((await sha256File(paths.liveAuth)) === null) {
    throw new ActionError(
      `No live credential to import: ${paths.liveAuth} does not exist.`,
      'Sign in through Codex Desktop or the CLI first.'
    )
  }

  const profileMode = await readProfileMode(paths, name)
  await copyFileAtomic(paths.liveAuth, accountAuthPath(paths, name))
  await syncProfileEmail(paths, name).catch(() => undefined)
  await writeActive(paths, { account: name, source: 'import-active', profileMode })
}

export async function deleteStoredAuth(paths: CodexQuotaPaths, account: string): Promise<void> {
  const name = await requireAccount(paths, account)
  const profileMode = await readProfileMode(paths, name)

  if (profileMode !== 'desktop_preserving') {
    throw new ActionError(
      `Deleting the stored credential is only supported for desktop_preserving profiles, and ${name} is ${profileMode}.`,
      'Sign out of this account instead.'
    )
  }

  const authPath = accountAuthPath(paths, name)
  if ((await sha256File(authPath)) === null) {
    throw new ActionError(`No stored credential for ${name}; nothing to delete.`, null)
  }

  await rm(authPath, { force: true })
}
