import { describe, expect, it } from 'vitest'

import { isDesktopRunning } from '../desktop'

/** Stands in for pgrep: resolves for the patterns a machine would match. */
function pgrep(matching: readonly string[]) {
  return async (args: readonly string[]): Promise<void> => {
    const query = args[args.length - 1] ?? ''
    if (matching.some((pattern) => query === pattern)) return
    throw new Error('no process matched')
  }
}

describe('isDesktopRunning', () => {
  it('recognises the ChatGPT app, which is where Codex now lives', async () => {
    await expect(isDesktopRunning({ platform: 'darwin', run: pgrep(['ChatGPT']) })).resolves.toBe(
      true
    )
  })

  it('still recognises the standalone Codex app', async () => {
    await expect(isDesktopRunning({ platform: 'darwin', run: pgrep(['Codex']) })).resolves.toBe(true)
  })

  it('recognises either app by its bundle path when the process name does not match', async () => {
    const byPath = pgrep(['/Applications/ChatGPT.app/Contents/MacOS/'])
    await expect(isDesktopRunning({ platform: 'darwin', run: byPath })).resolves.toBe(true)
  })

  it('reports nothing running when no probe matches', async () => {
    await expect(isDesktopRunning({ platform: 'darwin', run: pgrep([]) })).resolves.toBe(false)
  })

  it('reports nothing running on Linux, where there is no such app to hold the credential', async () => {
    const everything = async (): Promise<void> => undefined
    await expect(isDesktopRunning({ platform: 'linux', run: everything })).resolves.toBe(false)
  })

  it('recognises ChatGPT.exe on Windows when the injected runner matches', async () => {
    await expect(
      isDesktopRunning({ platform: 'win32', run: pgrep(['ChatGPT.exe']) })
    ).resolves.toBe(true)
  })

  it('recognises Codex.exe on Windows when the injected runner matches', async () => {
    await expect(isDesktopRunning({ platform: 'win32', run: pgrep(['Codex.exe']) })).resolves.toBe(
      true
    )
  })

  it('reports nothing running on Windows when no probe matches', async () => {
    await expect(isDesktopRunning({ platform: 'win32', run: pgrep([]) })).resolves.toBe(false)
  })
})
