import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addAccount } from '../accounts'
import { readActive, writeActive } from '../active'
import { activateAccount, deleteStoredAuth, importActive } from '../activate'
import { accountAuthPath, accountProfilePath } from '../paths'
import { listDir, scratchHome, type Scratch } from './helpers'

const CREDENTIAL = (value: string): string =>
  JSON.stringify({ tokens: { access_token: value, account_id: 'acct_1' } })

describe('credential moves', () => {
  let scratch: Scratch

  beforeEach(async () => {
    scratch = await scratchHome()
  })

  afterEach(async () => {
    await scratch.cleanup()
  })

  async function live(body: string): Promise<void> {
    await mkdir(scratch.paths.codexHome, { recursive: true })
    await writeFile(scratch.paths.liveAuth, body, { mode: 0o600 })
  }

  async function stored(account: string, body: string): Promise<void> {
    await writeFile(accountAuthPath(scratch.paths, account), body, { mode: 0o600 })
  }

  async function readLive(): Promise<string> {
    return readFile(scratch.paths.liveAuth, 'utf8')
  }

  describe('activate', () => {
    it('backs up the live credential before replacing it', async () => {
      await addAccount(scratch.paths, { account: 'work' })
      await stored('work', CREDENTIAL('work-token'))
      await live(CREDENTIAL('desktop-token'))

      const result = await activateAccount(scratch.paths, 'work', { desktopRunning: false })

      expect(result.backupPath).toMatch(/backups[/\\]\d{8}-\d{6}-auth\.json$/)
      expect(await readFile(result.backupPath as string, 'utf8')).toBe(CREDENTIAL('desktop-token'))
      expect(await readLive()).toBe(CREDENTIAL('work-token'))
      expect(await readActive(scratch.paths)).toMatchObject({
        account: 'work',
        source: 'activate'
      })
    })

    it('refuses without a stored credential and leaves the live one alone', async () => {
      await addAccount(scratch.paths, { account: 'work' })
      await live(CREDENTIAL('desktop-token'))

      await expect(activateAccount(scratch.paths, 'work', { desktopRunning: false })).rejects.toThrow(
        /stored/i
      )
      expect(await readLive()).toBe(CREDENTIAL('desktop-token'))
      expect(await listDir(scratch.paths.backupsDir)).toEqual([])
    })

    it('refuses while Codex Desktop is running unless forced', async () => {
      await addAccount(scratch.paths, { account: 'work' })
      await stored('work', CREDENTIAL('work-token'))
      await live(CREDENTIAL('desktop-token'))

      await expect(activateAccount(scratch.paths, 'work', { desktopRunning: true })).rejects.toThrow(
        /Desktop/i
      )
      expect(await readLive()).toBe(CREDENTIAL('desktop-token'))

      const forced = await activateAccount(scratch.paths, 'work', {
        desktopRunning: true,
        force: true
      })
      expect(forced.warnings.join(' ')).toMatch(/Desktop/i)
      expect(await readLive()).toBe(CREDENTIAL('work-token'))
    })

    it('saves a refreshed live credential back to the outgoing account first', async () => {
      await addAccount(scratch.paths, { account: 'first' })
      await addAccount(scratch.paths, { account: 'second' })
      await stored('first', CREDENTIAL('v1'))
      await stored('second', CREDENTIAL('second-token'))
      await live(CREDENTIAL('v1'))
      await writeActive(scratch.paths, {
        account: 'first',
        source: 'activate',
        profileMode: 'desktop_preserving'
      })

      // Codex refreshed the token in place while "first" was active.
      await live(CREDENTIAL('v2'))

      await activateAccount(scratch.paths, 'second', { desktopRunning: false })

      expect(await readFile(accountAuthPath(scratch.paths, 'first'), 'utf8')).toBe(CREDENTIAL('v2'))
      expect(await readLive()).toBe(CREDENTIAL('second-token'))
    })

    it('refuses when both the stored and live credentials drifted', async () => {
      await addAccount(scratch.paths, { account: 'first' })
      await addAccount(scratch.paths, { account: 'second' })
      await stored('first', CREDENTIAL('v1'))
      await stored('second', CREDENTIAL('second-token'))
      await live(CREDENTIAL('v1'))
      await writeActive(scratch.paths, {
        account: 'first',
        source: 'activate',
        profileMode: 'desktop_preserving'
      })

      await stored('first', CREDENTIAL('edited-by-hand'))
      await live(CREDENTIAL('also-changed'))

      await expect(
        activateAccount(scratch.paths, 'second', { desktopRunning: false })
      ).rejects.toThrow(/drift|reconcile/i)
      expect(await readLive()).toBe(CREDENTIAL('also-changed'))
    })

    it('refuses when the outgoing account lost its stored credential', async () => {
      await addAccount(scratch.paths, { account: 'first' })
      await addAccount(scratch.paths, { account: 'second' })
      await stored('first', CREDENTIAL('v1'))
      await stored('second', CREDENTIAL('second-token'))
      await live(CREDENTIAL('v1'))
      await writeActive(scratch.paths, {
        account: 'first',
        source: 'activate',
        profileMode: 'desktop_preserving'
      })

      await rm(accountAuthPath(scratch.paths, 'first'))

      await expect(
        activateAccount(scratch.paths, 'second', { desktopRunning: false })
      ).rejects.toThrow(/stored profile|restore/i)
      expect(await readLive()).toBe(CREDENTIAL('v1'))
    })
  })

  describe('import-active', () => {
    it('copies the live credential into the profile and records it as active', async () => {
      await addAccount(scratch.paths, { account: 'work' })
      await live(CREDENTIAL('desktop-token'))

      await importActive(scratch.paths, 'work')

      expect(await readFile(accountAuthPath(scratch.paths, 'work'), 'utf8')).toBe(
        CREDENTIAL('desktop-token')
      )
      expect(await readActive(scratch.paths)).toMatchObject({
        account: 'work',
        source: 'import-active'
      })
    })

    it('creates the account on request and refuses otherwise', async () => {
      await live(CREDENTIAL('desktop-token'))

      await expect(importActive(scratch.paths, 'fresh')).rejects.toThrow(/not found/i)

      await importActive(scratch.paths, 'fresh', { create: true })
      expect(await readFile(accountProfilePath(scratch.paths, 'fresh'), 'utf8')).toMatch(/fresh/)
    })

    it('refuses when there is no live credential to import', async () => {
      await addAccount(scratch.paths, { account: 'work' })

      await expect(importActive(scratch.paths, 'work')).rejects.toThrow(/live|not found/i)
    })
  })

  describe('delete stored credential', () => {
    it('deletes only the profile copy and never the live one', async () => {
      await addAccount(scratch.paths, { account: 'work' })
      await stored('work', CREDENTIAL('work-token'))
      await live(CREDENTIAL('desktop-token'))

      await deleteStoredAuth(scratch.paths, 'work')

      expect(await listDir(scratch.paths.accountsDir)).toEqual(['work'])
      expect(await readLive()).toBe(CREDENTIAL('desktop-token'))
      await expect(readFile(accountAuthPath(scratch.paths, 'work'), 'utf8')).rejects.toThrow()
    })

    it('refuses for CLI-isolated profiles', async () => {
      await addAccount(scratch.paths, { account: 'cli', profileMode: 'cli_isolated' })
      await stored('cli', CREDENTIAL('cli-token'))

      await expect(deleteStoredAuth(scratch.paths, 'cli')).rejects.toThrow(/desktop_preserving|sign out/i)
      expect(await readFile(accountAuthPath(scratch.paths, 'cli'), 'utf8')).toBe(CREDENTIAL('cli-token'))
    })

    it('refuses when nothing is stored', async () => {
      await addAccount(scratch.paths, { account: 'work' })
      await expect(deleteStoredAuth(scratch.paths, 'work')).rejects.toThrow(/not found|nothing/i)
    })
  })
})
