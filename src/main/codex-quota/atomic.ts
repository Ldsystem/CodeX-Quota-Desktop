/**
 * Credential files are replaced, never edited in place: write a sibling temp
 * file at mode 600, then rename over the target. A crash mid-write leaves the
 * old credential intact instead of a truncated one.
 */

import { randomBytes } from 'node:crypto'
import { chmod, copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { ActionError } from './errors'

/** Stages `produce` into a sibling temp file, then renames it into place. */
async function replace(destination: string, produce: (temporary: string) => Promise<void>): Promise<void> {
  const directory = dirname(destination)
  await mkdir(directory, { recursive: true, mode: 0o700 })

  const temporary = join(directory, `.tmp.${randomBytes(6).toString('hex')}`)
  try {
    await produce(temporary)
    await chmod(temporary, 0o600)
    await rename(temporary, destination)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }

  await chmod(destination, 0o600)
}

export async function writeFileAtomic(destination: string, body: string): Promise<void> {
  await replace(destination, (temporary) => writeFile(temporary, body, { mode: 0o600 }))
}

/**
 * Copies a credential without ever leaving the destination half-written, which
 * matters most for `~/.codex/auth.json`: Codex may read it at any moment.
 */
export async function copyFileAtomic(source: string, destination: string): Promise<void> {
  try {
    await readFile(source)
  } catch {
    throw new ActionError(
      `Source credential not found: ${source}`,
      'Verify the path exists, then try again.'
    )
  }

  await replace(destination, (temporary) => copyFile(source, temporary))
}
