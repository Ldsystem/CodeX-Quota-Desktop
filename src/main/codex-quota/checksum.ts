import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

/**
 * Credentials are compared by digest and never by content, so the value of a
 * token never has to be held or logged to answer "is this the live one?".
 * Null means the file is absent or unreadable.
 */
export async function sha256File(path: string): Promise<string | null> {
  try {
    return createHash('sha256')
      .update(await readFile(path))
      .digest('hex')
  } catch {
    return null
  }
}
