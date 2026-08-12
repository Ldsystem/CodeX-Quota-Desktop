/**
 * Whether Codex Desktop is running, which decides whether switching the live
 * credential can take effect. Matching is exact so this app, whose process is
 * named differently, is never mistaken for Desktop itself.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

const PROBES: readonly string[][] = [
  ['-x', 'Codex'],
  ['-f', '/Applications/Codex.app/Contents/MacOS/']
]

export async function isDesktopRunning(): Promise<boolean> {
  if (process.platform !== 'darwin') return false

  for (const args of PROBES) {
    try {
      // pgrep exits 1 when nothing matches, which promisify turns into a throw.
      await run('pgrep', args, { timeout: 2_000 })
      return true
    } catch {
      continue
    }
  }
  return false
}
