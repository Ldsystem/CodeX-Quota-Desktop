import { mkdir, writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sha256File } from '../checksum'
import { accountAuthPath } from '../paths'
import { createCodexQuotaService } from '../service'
import { scratchHome, type Scratch } from './helpers'

const LIVE = JSON.stringify({ tokens: { access_token: 'live', account_id: 'acct_1' } })

describe('service actions on a scratch account', () => {
  let scratch: Scratch

  beforeEach(async () => {
    scratch = await scratchHome()
    await mkdir(scratch.paths.codexHome, { recursive: true })
    await writeFile(scratch.paths.liveAuth, LIVE, { mode: 0o600 })
  })

  afterEach(async () => {
    await scratch.cleanup()
  })

  it('runs add, import, delete and remove without disturbing the live credential', async () => {
    const service = createCodexQuotaService(scratch.paths)
    const before = await sha256File(scratch.paths.liveAuth)

    expect(await service.addAccount({ account: 'scratch', profileMode: 'desktop_preserving' })).toMatchObject({
      ok: true
    })
    expect(await service.importActive('scratch')).toMatchObject({ ok: true })
    expect(await sha256File(accountAuthPath(scratch.paths, 'scratch'))).toBe(before)

    const snapshot = await service.readRegistry()
    expect(snapshot.accounts).toHaveLength(1)
    expect(snapshot.accounts[0]).toMatchObject({
      account: 'scratch',
      hasStoredAuth: true,
      authenticated: true,
      active: 'yes'
    })

    expect(await service.deleteStoredAuth('scratch')).toMatchObject({ ok: true })
    expect(await service.removeAccount('scratch')).toMatchObject({ ok: true })
    expect((await service.readRegistry()).accounts).toEqual([])

    expect(await sha256File(scratch.paths.liveAuth)).toBe(before)
  })

  it('reports a refusal as an outcome with advice instead of throwing', async () => {
    const service = createCodexQuotaService(scratch.paths)

    const outcome = await service.removeAccount('ghost')
    expect(outcome.ok).toBe(false)
    expect(outcome.title).toMatch(/not found/i)
    expect(outcome.detail).toBeTruthy()
  })

  it('refuses a name the CLI would reject', async () => {
    const service = createCodexQuotaService(scratch.paths)

    const outcome = await service.addAccount({ account: 'bad name', profileMode: 'desktop_preserving' })
    expect(outcome.ok).toBe(false)
    expect(outcome.title).toMatch(/invalid account name/i)
  })
})
