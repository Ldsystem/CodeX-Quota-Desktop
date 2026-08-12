import { mkdir, writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { activeMatchesAccount, readActive, writeActive } from '../active'
import { sha256File } from '../checksum'
import { accountAuthPath, accountDir } from '../paths'
import { scratchHome, type Scratch } from './helpers'

describe('active profile metadata', () => {
  let scratch: Scratch

  beforeEach(async () => {
    scratch = await scratchHome()
  })

  afterEach(async () => {
    await scratch.cleanup()
  })

  async function seed(account: string, body: string, live = body): Promise<void> {
    await mkdir(accountDir(scratch.paths, account), { recursive: true })
    await writeFile(accountAuthPath(scratch.paths, account), body, { mode: 0o600 })
    await mkdir(scratch.paths.codexHome, { recursive: true })
    await writeFile(scratch.paths.liveAuth, live, { mode: 0o600 })
  }

  it('records both checksums and the source that caused the switch', async () => {
    await seed('work', '{"tokens":{"access_token":"a"}}')

    await writeActive(scratch.paths, {
      account: 'work',
      source: 'activate',
      profileMode: 'desktop_preserving'
    })

    const active = await readActive(scratch.paths)
    const digest = await sha256File(scratch.paths.liveAuth)
    expect(active).toMatchObject({
      account: 'work',
      source: 'activate',
      profileMode: 'desktop_preserving',
      activeCredentialPath: scratch.paths.liveAuth,
      profileAuthPath: accountAuthPath(scratch.paths, 'work'),
      activeAuthSha256: digest,
      profileAuthSha256: digest
    })
    expect(typeof active?.updatedAt).toBe('string')
  })

  it('reads nothing when no account was ever activated', async () => {
    expect(await readActive(scratch.paths)).toBeNull()
  })

  it('confirms a match only while both files still hold the recorded digest', async () => {
    await seed('work', '{"tokens":{"access_token":"a"}}')
    await writeActive(scratch.paths, {
      account: 'work',
      source: 'import-active',
      profileMode: 'desktop_preserving'
    })

    expect(await activeMatchesAccount(scratch.paths, 'work')).toBe(true)
    expect(await activeMatchesAccount(scratch.paths, 'other')).toBe(false)

    await writeFile(scratch.paths.liveAuth, '{"tokens":{"access_token":"rotated"}}', { mode: 0o600 })
    expect(await activeMatchesAccount(scratch.paths, 'work')).toBe(false)
  })
})
