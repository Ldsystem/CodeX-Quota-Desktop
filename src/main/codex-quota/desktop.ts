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

/** Image names recorded by task-001 / OQ-001; tasklist filters on these. */
const WIN32_PROBES: readonly string[][] = [['ChatGPT.exe'], ['Codex.exe']]

export interface DesktopProbeOptions {
  platform?: NodeJS.Platform | string
  run?: ProcessProbe
}

const defaultProbe: ProcessProbe = async (args) => {
  await execFileAsync('pgrep', [...args], { timeout: 2_000 })
}

/** tasklist exits 0 with an INFO line when nothing matches, so stdout is the oracle. */
const defaultWin32Probe: ProcessProbe = async (args) => {
  const image = args[0] ?? ''
  const { stdout } = await execFileAsync('tasklist', ['/FI', `IMAGENAME eq ${image}`, '/NH'], {
    timeout: 2_000,
    windowsHide: true
  })
  const matched = stdout
    .split(/\r?\n/)
    .some((line) => line.trim().toLowerCase().startsWith(image.toLowerCase()))
  if (!matched) throw new Error('no process matched')
}

export async function isDesktopRunning(options: DesktopProbeOptions = {}): Promise<boolean> {
  const platform = options.platform ?? process.platform
  if (platform !== 'darwin' && platform !== 'win32') return false

  const run = options.run ?? (platform === 'win32' ? defaultWin32Probe : defaultProbe)
  const probes = platform === 'win32' ? WIN32_PROBES : PROBES

  for (const args of probes) {
    try {
      await run(args)
      return true
    } catch {
      continue
    }
  }
  return false
}
