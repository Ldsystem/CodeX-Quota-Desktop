import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolvePaths, type CodexQuotaPaths } from '../paths'

export interface Scratch {
  home: string
  paths: CodexQuotaPaths
  cleanup: () => Promise<void>
}

/** A throwaway `$HOME` so the real `~/.codex-quota` is never in play. */
export async function scratchHome(): Promise<Scratch> {
  const home = await mkdtemp(join(tmpdir(), 'codex-quota-test-'))
  return {
    home,
    paths: resolvePaths({}, home),
    cleanup: () => rm(home, { recursive: true, force: true })
  }
}

export async function listDir(path: string): Promise<string[]> {
  try {
    return (await readdir(path)).sort()
  } catch {
    return []
  }
}
