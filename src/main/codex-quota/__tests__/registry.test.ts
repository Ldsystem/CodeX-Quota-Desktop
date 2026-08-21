import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resolvePaths, type CodexQuotaPaths } from '../paths'
import { readActive, writeActive } from '../active'
import { readEnvironmentSnapshot, readRegistrySnapshot } from '../registry'

let root = ''
let paths: CodexQuotaPaths

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cq-home-'))
  paths = resolvePaths({}, root)
  await mkdir(paths.accountsDir, { recursive: true })
  await mkdir(paths.codexHome, { recursive: true })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function addAccount(
  name: string,
  options: { mode?: string; auth?: string } = {}
): Promise<void> {
  const dir = join(paths.accountsDir, name)
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'profile.json'),
    JSON.stringify({ name, profileMode: options.mode ?? 'desktop_preserving' }),
    'utf8'
  )
  if (options.auth !== undefined) {
    await writeFile(join(dir, 'auth.json'), options.auth, 'utf8')
  }
  await writeFile(paths.registry, `${name}\n`, { flag: 'a' })
}

const snapshot = async (): Promise<Awaited<ReturnType<typeof readRegistrySnapshot>>> =>
  readRegistrySnapshot(paths, { desktopRunning: false })

describe('readEnvironmentSnapshot', () => {
  it('reports the Desktop state and active claim without reading any account', async () => {
    await addAccount('plus_01', { auth: '{"tokens":{"access_token":"a"}}' })
    await writeFile(paths.activeJson, JSON.stringify({ account: 'plus_01' }), 'utf8')

    const idle = await readEnvironmentSnapshot(paths, { desktopRunning: false })
    expect(idle).toMatchObject({ desktopRunning: false, activeAccount: 'plus_01' })

    const running = await readEnvironmentSnapshot(paths, { desktopRunning: true })
    expect(running.desktopRunning).toBe(true)
  })

  it('reports no active account when nothing claims one', async () => {
    const result = await readEnvironmentSnapshot(paths, { desktopRunning: false })
    expect(result.activeAccount).toBeNull()
  })
})

describe('readRegistrySnapshot', () => {
  it('returns no accounts when the registry file does not exist', async () => {
    const result = await snapshot()
    expect(result.accounts).toEqual([])
    expect(result.environment.storageRoot).toBe(paths.home)
    expect(result.environment.liveAuthPath).toBe(paths.liveAuth)
  })

  it('reads the profile mode and credential presence of each account', async () => {
    await addAccount('plus_01', { auth: '{"tokens":{"access_token":"a","refresh_token":"r"}}' })
    await addAccount('sandbox', { mode: 'cli_isolated' })

    const { accounts } = await snapshot()
    expect(accounts.map((entry) => entry.account)).toEqual(['plus_01', 'sandbox'])

    const [first, second] = accounts
    expect(first).toMatchObject({
      profileMode: 'desktop_preserving',
      hasStoredAuth: true,
      hasAccessToken: 'yes',
      hasRefreshToken: 'yes',
      authenticated: true,
      warnings: []
    })
    expect(second).toMatchObject({
      profileMode: 'cli_isolated',
      hasStoredAuth: false,
      hasAccessToken: 'no',
      authenticated: false,
      warnings: ['no-auth']
    })
  })

  it('marks a corrupt credential unreadable rather than missing', async () => {
    await addAccount('broken', { auth: '{oops' })
    const [account] = (await snapshot()).accounts
    expect(account?.hasAccessToken).toBe('unknown')
    expect(account?.hasRefreshToken).toBe('unknown')
    expect(account?.warnings).toEqual(['corrupt-auth'])
  })

  it('treats the account as in use when active.json agrees with both checksums', async () => {
    const body = '{"tokens":{"access_token":"a","refresh_token":"r"}}'
    await addAccount('plus_01', { auth: body })
    await writeFile(paths.liveAuth, body, 'utf8')
    await writeFile(
      paths.activeJson,
      JSON.stringify({
        account: 'plus_01',
        profileMode: 'desktop_preserving',
        activeAuthSha256: sha256(body),
        profileAuthSha256: sha256(body)
      }),
      'utf8'
    )

    const { accounts, environment } = await snapshot()
    expect(accounts[0]?.active).toBe('yes')
    expect(accounts[0]?.warnings).toEqual([])
    expect(environment.activeAccount).toBe('plus_01')
  })

  it('reports drift when active.json names the account but a checksum moved', async () => {
    await addAccount('plus_01', { auth: '{"tokens":{"access_token":"a"}}' })
    await writeFile(paths.liveAuth, '{"tokens":{"access_token":"different"}}', 'utf8')
    await writeFile(
      paths.activeJson,
      JSON.stringify({ account: 'plus_01', activeAuthSha256: 'stale', profileAuthSha256: 'stale' }),
      'utf8'
    )

    const [account] = (await snapshot()).accounts
    expect(account?.active).toBe('unknown')
    expect(account?.warnings).toContain('active-drift')
  })

  it('adopts a refreshed live credential when its stable account identity matches', async () => {
    const original = '{"tokens":{"access_token":"old","account_id":"acct_1"}}'
    const refreshed = '{"tokens":{"access_token":"new","account_id":"acct_1"}}'
    await addAccount('plus_01', { auth: original })
    await writeFile(paths.liveAuth, original, 'utf8')
    await writeActive(paths, {
      account: 'plus_01',
      profileMode: 'desktop_preserving',
      source: 'activate'
    })

    await writeFile(paths.liveAuth, refreshed, 'utf8')

    const [account] = (await snapshot()).accounts
    const active = await readActive(paths)
    expect(account?.active).toBe('yes')
    expect(account?.warnings).not.toContain('active-drift')
    expect(await readFile(join(paths.accountsDir, 'plus_01', 'auth.json'), 'utf8')).toBe(refreshed)
    expect(active?.activeAuthSha256).toBe(sha256(refreshed))
    expect(active?.profileAuthSha256).toBe(sha256(refreshed))
  })

  it('preserves a newer recorded profile when the live credential did not move', async () => {
    const live = '{"tokens":{"access_token":"old","account_id":"acct_1"}}'
    const newerProfile = '{"tokens":{"access_token":"new","account_id":"acct_1"}}'
    const profilePath = join(paths.accountsDir, 'plus_01', 'auth.json')
    await addAccount('plus_01', { auth: newerProfile })
    await writeFile(paths.liveAuth, live, 'utf8')
    await writeFile(
      paths.activeJson,
      JSON.stringify({
        account: 'plus_01',
        profileMode: 'desktop_preserving',
        activeAuthSha256: sha256(live),
        profileAuthSha256: sha256(newerProfile),
        source: 'activate'
      }),
      'utf8'
    )

    const [account] = (await snapshot()).accounts

    expect(account?.active).toBe('unknown')
    expect(account?.warnings).toContain('active-drift')
    expect(await readFile(profilePath, 'utf8')).toBe(newerProfile)
    expect(await readFile(paths.liveAuth, 'utf8')).toBe(live)
  })

  it('preserves drift when the live credential belongs to a different account', async () => {
    const original = '{"tokens":{"access_token":"old","account_id":"acct_1"}}'
    const replacement = '{"tokens":{"access_token":"new","account_id":"acct_2"}}'
    await addAccount('plus_01', { auth: original })
    await writeFile(paths.liveAuth, original, 'utf8')
    await writeActive(paths, {
      account: 'plus_01',
      profileMode: 'desktop_preserving',
      source: 'activate'
    })

    await writeFile(paths.liveAuth, replacement, 'utf8')

    const [account] = (await snapshot()).accounts
    expect(account?.active).toBe('unknown')
    expect(account?.warnings).toContain('active-drift')
    expect(await readFile(join(paths.accountsDir, 'plus_01', 'auth.json'), 'utf8')).toBe(original)
  })

  it('preserves drift when stable account identity cannot be verified', async () => {
    const original = '{"tokens":{"access_token":"old"}}'
    const replacement = '{"tokens":{"access_token":"new"}}'
    await addAccount('plus_01', { auth: original })
    await writeFile(paths.liveAuth, original, 'utf8')
    await writeActive(paths, {
      account: 'plus_01',
      profileMode: 'desktop_preserving',
      source: 'activate'
    })

    await writeFile(paths.liveAuth, replacement, 'utf8')

    const [account] = (await snapshot()).accounts
    expect(account?.active).toBe('unknown')
    expect(account?.warnings).toContain('active-drift')
    expect(await readFile(join(paths.accountsDir, 'plus_01', 'auth.json'), 'utf8')).toBe(original)
  })

  it('preserves drift and refuses a non-canonical active profile path', async () => {
    const original = '{"tokens":{"access_token":"old","account_id":"acct_1"}}'
    const refreshed = '{"tokens":{"access_token":"new","account_id":"acct_1"}}'
    const redirected = join(root, 'redirected-auth.json')
    await addAccount('plus_01', { auth: original })
    await writeFile(paths.liveAuth, original, 'utf8')
    await writeFile(redirected, original, 'utf8')
    await writeFile(
      paths.activeJson,
      JSON.stringify({
        account: 'plus_01',
        profileMode: 'desktop_preserving',
        profileAuthPath: redirected,
        activeAuthSha256: sha256(original),
        profileAuthSha256: sha256(original),
        source: 'activate'
      }),
      'utf8'
    )
    await writeFile(paths.liveAuth, refreshed, 'utf8')

    const [account] = (await snapshot()).accounts
    expect(account?.active).toBe('unknown')
    expect(account?.warnings).toContain('active-drift')
    expect(await readFile(redirected, 'utf8')).toBe(original)
  })

  it('falls back to comparing the live credential when active.json is absent', async () => {
    const body = '{"tokens":{"access_token":"a"}}'
    await addAccount('plus_01', { auth: body })
    await addAccount('plus_02', { auth: '{"tokens":{"access_token":"b"}}' })
    await writeFile(paths.liveAuth, body, 'utf8')

    const { accounts } = await snapshot()
    expect(accounts.find((entry) => entry.account === 'plus_01')?.active).toBe('yes')
    expect(accounts.find((entry) => entry.account === 'plus_02')?.active).toBe('no')
  })

  it('passes the desktop running observation through to the environment', async () => {
    const running = await readRegistrySnapshot(paths, { desktopRunning: true })
    expect(running.environment.desktopRunning).toBe(true)
  })
})

function sha256(body: string): string {
  return createHash('sha256').update(body).digest('hex')
}
