import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addAccount, listAccounts, readProfileMode, removeAccount, syncProfileEmail } from '../accounts'
import { readActive, writeActive } from '../active'
import { accountAuthPath, accountDir, accountProfilePath } from '../paths'
import { listDir, scratchHome, type Scratch } from './helpers'

/** `{"email":"ada@example.com"}` as an unsigned JWT body. */
function idToken(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `header.${body}.signature`
}

describe('accounts', () => {
  let scratch: Scratch

  beforeEach(async () => {
    scratch = await scratchHome()
  })

  afterEach(async () => {
    await scratch.cleanup()
  })

  it('registers an account with a private directory and profile metadata', async () => {
    await addAccount(scratch.paths, { account: 'work', profileMode: 'cli_isolated' })

    expect(await listAccounts(scratch.paths)).toEqual(['work'])

    const directory = accountDir(scratch.paths, 'work')
    expect(((await stat(directory)).mode & 0o777).toString(8)).toBe('700')

    const profile = JSON.parse(await readFile(accountProfilePath(scratch.paths, 'work'), 'utf8'))
    expect(profile).toMatchObject({
      name: 'work',
      displayName: 'work',
      profileMode: 'cli_isolated',
      codexHome: directory,
      activeCredentialPath: scratch.paths.liveAuth
    })
    expect(typeof profile.createdAt).toBe('string')
  })

  it('defaults to the desktop-switching profile mode', async () => {
    await addAccount(scratch.paths, { account: 'personal' })
    expect(await readProfileMode(scratch.paths, 'personal')).toBe('desktop_preserving')
  })

  it.each(['', ' ', '.', '..', 'has space', 'slash/name'])('rejects the name %o', async (name) => {
    await expect(addAccount(scratch.paths, { account: name })).rejects.toThrow(/name/i)
    expect(await listAccounts(scratch.paths)).toEqual([])
  })

  it('refuses a duplicate account and leaves the first one intact', async () => {
    await addAccount(scratch.paths, { account: 'work' })
    await writeFile(accountAuthPath(scratch.paths, 'work'), '{"kept":true}', { mode: 0o600 })

    await expect(addAccount(scratch.paths, { account: 'work' })).rejects.toThrow(/already exists/i)
    expect(await listAccounts(scratch.paths)).toEqual(['work'])
    expect(await readFile(accountAuthPath(scratch.paths, 'work'), 'utf8')).toBe('{"kept":true}')
  })

  it('refuses when a stray directory already occupies the account path', async () => {
    await mkdir(accountDir(scratch.paths, 'work'), { recursive: true })

    await expect(addAccount(scratch.paths, { account: 'work' })).rejects.toThrow(/path already exists/i)
    expect(await listAccounts(scratch.paths)).toEqual([])
  })

  it('removes an account from the registry and deletes its directory', async () => {
    await addAccount(scratch.paths, { account: 'work' })
    await addAccount(scratch.paths, { account: 'personal' })

    await removeAccount(scratch.paths, 'work')

    expect(await listAccounts(scratch.paths)).toEqual(['personal'])
    expect(await listDir(scratch.paths.accountsDir)).toEqual(['personal'])
  })

  it('refuses to remove an account it does not know', async () => {
    await expect(removeAccount(scratch.paths, 'ghost')).rejects.toThrow(/not found/i)
  })

  it('drops the active claim when the account it named is removed', async () => {
    await addAccount(scratch.paths, { account: 'work' })
    await mkdir(scratch.paths.codexHome, { recursive: true })
    await writeFile(scratch.paths.liveAuth, '{"tokens":{"access_token":"a"}}', { mode: 0o600 })
    await writeFile(accountAuthPath(scratch.paths, 'work'), '{"tokens":{"access_token":"a"}}', {
      mode: 0o600
    })
    await writeActive(scratch.paths, {
      account: 'work',
      source: 'import-active',
      profileMode: 'desktop_preserving'
    })

    await removeAccount(scratch.paths, 'work')

    // A claim naming a deleted account would hide the account that really is
    // live, since every remaining one compares against a name that is gone.
    expect(await readActive(scratch.paths)).toBeNull()
  })

  it('keeps the active claim when a different account is removed', async () => {
    await addAccount(scratch.paths, { account: 'keep' })
    await addAccount(scratch.paths, { account: 'other' })
    await writeActive(scratch.paths, {
      account: 'keep',
      source: 'activate',
      profileMode: 'desktop_preserving'
    })

    await removeAccount(scratch.paths, 'other')

    expect(await readActive(scratch.paths)).toMatchObject({ account: 'keep' })
  })

  it('copies the email out of the stored credential into the profile', async () => {
    await addAccount(scratch.paths, { account: 'work' })
    await writeFile(
      accountAuthPath(scratch.paths, 'work'),
      JSON.stringify({ tokens: { id_token: idToken({ email: 'ada@example.com' }) } }),
      { mode: 0o600 }
    )

    await syncProfileEmail(scratch.paths, 'work')

    const profile = JSON.parse(await readFile(accountProfilePath(scratch.paths, 'work'), 'utf8'))
    expect(profile.email).toBe('ada@example.com')
    expect(profile.profileMode).toBe('desktop_preserving')
  })

  it('reports a missing profile rather than guessing a mode', async () => {
    await expect(readProfileMode(scratch.paths, 'ghost')).rejects.toThrow(/profile/i)
  })
})
