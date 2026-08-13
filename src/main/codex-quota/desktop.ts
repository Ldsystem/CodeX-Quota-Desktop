/**
 * Whether the app that holds the live credential is running, which decides
 * whether switching it can take effect.
 *
 * Codex used to ship as its own desktop app; it is now part of the ChatGPT app,
 * and machines exist with either or both. Both are probed, because the question
 * being asked is not "is Codex installed" but "is something holding the
 * credential I am about to overwrite". Matching is exact so this app, whose
 * process is named differently, is never mistaken for it.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** pgrep exits 1 when nothing matches, which the promise turns into a throw. */
export type ProcessProbe = (args: readonly string[]) => Promise<void>

const PROBES: readonly string[][] = [
  ['-x', 'ChatGPT'],
  ['-f', '/Applications/ChatGPT.app/Contents/MacOS/'],
  ['-x', 'Codex'],
  ['-f', '/Applications/Codex.app/Contents/MacOS/']
]

export interface DesktopProbeOptions {
  platform?: NodeJS.Platform | string
  run?: ProcessProbe
}

const defaultProbe: ProcessProbe = async (args) => {
  await execFileAsync('pgrep', [...args], { timeout: 2_000 })
}

export async function isDesktopRunning(options: DesktopProbeOptions = {}): Promise<boolean> {
  const platform = options.platform ?? process.platform
  if (platform !== 'darwin') return false

  const run = options.run ?? defaultProbe

  for (const args of PROBES) {
    try {
      await run(args)
      return true
    } catch {
      continue
    }
  }
  return false
}
