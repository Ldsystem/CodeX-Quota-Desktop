/**
 * A copy of the live credential, taken before anything overwrites it.
 *
 * Activation is the one operation that can lose a credential the user cannot
 * regenerate without signing in again, so the backup is mandatory and its path
 * is reported back to the UI as the restore instruction.
 */

import { join } from 'node:path'

import { copyFileAtomic } from './atomic'
import { ensureStorage } from './accounts'
import { sha256File } from './checksum'
import type { CodexQuotaPaths } from './paths'

function stamp(now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join('')
}

/** Returns the backup path, or null when there was no live credential to save. */
export async function backupLiveAuth(
  paths: CodexQuotaPaths,
  now: Date = new Date()
): Promise<string | null> {
  if ((await sha256File(paths.liveAuth)) === null) return null

  await ensureStorage(paths)
  const destination = join(paths.backupsDir, `${stamp(now)}-auth.json`)
  await copyFileAtomic(paths.liveAuth, destination)
  return destination
}
