import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const hook = vi.hoisted(() => ({
  armed: false,
  livePath: '',
  profilePath: '',
  replacement: ''
}))

vi.mock('../atomic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../atomic')>()
  const interleave = async (destination: string): Promise<void> => {
    if (!hook.armed || destination !== hook.profilePath) return
    hook.armed = false
    await writeFile(hook.livePath, hook.replacement, { mode: 0o600 })
  }
  return {
    ...actual,
    copyFileAtomic: async (source: string, destination: string) => {
      await interleave(destination)
      return actual.copyFileAtomic(source, destination)
    },
    writeFileAtomic: async (destination: string, body: string) => {
      await interleave(destination)
      return actual.writeFileAtomic(destination, body)
    }
  }
})

import { addAccount } from '../accounts'
import { writeActive } from '../active'
import { accountAuthPath } from '../paths'
import { readRegistrySnapshot } from '../registry'
import { scratchHome, type Scratch } from './helpers'

describe('external reconciliation interleaving', () => {
  let scratch: Scratch

  beforeEach(async () => {
    scratch = await scratchHome()
    await addAccount(scratch.paths, { account: 'work' })
    await mkdir(scratch.paths.codexHome, { recursive: true })
  })

  afterEach(async () => {
    hook.armed = false
    await scratch.cleanup()
  })

  it('writes the verified snapshot rather than rereading a replaced live source', async () => {
    const original = '{"tokens":{"access_token":"old","account_id":"acct_1"}}'
    const refreshed = '{"tokens":{"access_token":"new","account_id":"acct_1"}}'
    const replacement = '{"tokens":{"access_token":"other","account_id":"acct_2"}}'
    const profilePath = accountAuthPath(scratch.paths, 'work')
    await writeFile(profilePath, original, { mode: 0o600 })
    await writeFile(scratch.paths.liveAuth, original, { mode: 0o600 })
    await writeActive(scratch.paths, {
      account: 'work',
      profileMode: 'desktop_preserving',
      source: 'activate'
    })
    await writeFile(scratch.paths.liveAuth, refreshed, { mode: 0o600 })
    Object.assign(hook, {
      armed: true,
      livePath: scratch.paths.liveAuth,
      profilePath,
      replacement
    })

    const [account] = (
      await readRegistrySnapshot(scratch.paths, { desktopRunning: false })
    ).accounts

    expect(await readFile(scratch.paths.liveAuth, 'utf8')).toBe(replacement)
    expect(await readFile(profilePath, 'utf8')).toBe(refreshed)
    expect(account?.active).toBe('unknown')
    expect(account?.warnings).toContain('active-drift')
  })
})
