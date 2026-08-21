import { createServer, type Server } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { addAccount } from '../accounts'
import { readActive, writeActive } from '../active'
import { sha256File } from '../checksum'
import { refreshAuthFile, refreshIfExpired } from '../oauth'
import { accountAuthPath } from '../paths'
import { readRegistrySnapshot } from '../registry'
import { scratchHome, type Scratch } from './helpers'

function jwt(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `header.${encoded}.signature`
}

describe('OAuth refresh credential state', () => {
  let scratch: Scratch
  let server: Server | undefined
  let refreshRequests = 0

  beforeEach(async () => {
    refreshRequests = 0
    scratch = await scratchHome()
    await addAccount(scratch.paths, { account: 'work' })
    await mkdir(scratch.paths.codexHome, { recursive: true })
  })

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server?.close((error) => (error ? reject(error) : resolve()))
      )
      server = undefined
    }
    await scratch.cleanup()
  })

  async function listen(beforeResponse?: () => Promise<void>): Promise<void> {
    server = createServer((_request, response) => {
      void (async () => {
        refreshRequests += 1
        await beforeResponse?.()
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(
          JSON.stringify({
            access_token: jwt({ exp: Math.floor(Date.now() / 1000) + 3_600 }),
            refresh_token: `refresh-${refreshRequests}`
          })
        )
      })()
    })
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('missing test port')
    scratch.paths.tokenUrl = `http://127.0.0.1:${address.port}`
    scratch.paths.proxyUrl = null
  }

  async function seed(accessToken: string): Promise<string> {
    const body = JSON.stringify({
      tokens: {
        access_token: accessToken,
        refresh_token: 'refresh-original',
        account_id: 'acct_1'
      }
    })
    const profilePath = accountAuthPath(scratch.paths, 'work')
    await writeFile(profilePath, body, { mode: 0o600 })
    await writeFile(scratch.paths.liveAuth, body, { mode: 0o600 })
    await writeActive(scratch.paths, {
      account: 'work',
      profileMode: 'desktop_preserving',
      source: 'activate'
    })
    return profilePath
  }

  it('keeps live, profile, and active metadata synchronized after expiry refresh', async () => {
    const profilePath = await seed(jwt({ exp: 1 }))
    await listen()

    expect(await refreshIfExpired(scratch.paths, scratch.paths.liveAuth)).toBe(true)

    const live = await readFile(scratch.paths.liveAuth, 'utf8')
    const profile = await readFile(profilePath, 'utf8')
    const active = await readActive(scratch.paths)
    const refreshedSha = await sha256File(scratch.paths.liveAuth)
    expect(active?.activeAuthSha256).toBe(refreshedSha)
    expect(active?.profileAuthSha256).toBe(refreshedSha)
    const [account] = (
      await readRegistrySnapshot(scratch.paths, { desktopRunning: false })
    ).accounts
    expect(profile).toBe(live)
    expect(account?.active).toBe('yes')
    expect(account?.warnings).not.toContain('active-drift')
    expect(refreshRequests).toBe(1)
  })

  it('single-flights concurrent refreshes of the same credential', async () => {
    const profilePath = await seed(jwt({ exp: 1 }))
    await listen()

    const results = await Promise.all([
      refreshAuthFile(scratch.paths, scratch.paths.liveAuth),
      refreshAuthFile(scratch.paths, scratch.paths.liveAuth)
    ])

    expect(results).toEqual([true, true])
    expect(refreshRequests).toBe(1)
    expect(await readFile(profilePath, 'utf8')).toBe(await readFile(scratch.paths.liveAuth, 'utf8'))
    const [account] = (
      await readRegistrySnapshot(scratch.paths, { desktopRunning: false })
    ).accounts
    expect(account?.active).toBe('yes')
  })

  it('does not overwrite a live credential replaced during the token request', async () => {
    const profilePath = await seed(jwt({ exp: 1 }))
    const replacement = JSON.stringify({
      tokens: {
        access_token: 'other-access',
        refresh_token: 'other-refresh',
        account_id: 'acct_2'
      }
    })
    await listen(() => writeFile(scratch.paths.liveAuth, replacement, { mode: 0o600 }))

    expect(await refreshAuthFile(scratch.paths, scratch.paths.liveAuth)).toBe(false)
    expect(await readFile(scratch.paths.liveAuth, 'utf8')).toBe(replacement)
    expect(await readFile(profilePath, 'utf8')).not.toBe(replacement)
    const [account] = (
      await readRegistrySnapshot(scratch.paths, { desktopRunning: false })
    ).accounts
    expect(account?.active).toBe('unknown')
    expect(account?.warnings).toContain('active-drift')
  })

  it('refuses refresh when active metadata redirects the profile path', async () => {
    const profilePath = await seed(jwt({ exp: 1 }))
    const redirected = `${scratch.home}/redirected-auth.json`
    const original = await readFile(profilePath, 'utf8')
    const active = await readActive(scratch.paths)
    await writeFile(redirected, original, { mode: 0o600 })
    await writeFile(
      scratch.paths.activeJson,
      `${JSON.stringify({ ...active, profileAuthPath: redirected })}\n`,
      { mode: 0o600 }
    )
    await listen()

    expect(await refreshIfExpired(scratch.paths, scratch.paths.liveAuth)).toBe(false)
    expect(await readFile(profilePath, 'utf8')).toBe(original)
    expect(await readFile(scratch.paths.liveAuth, 'utf8')).toBe(original)
    expect(await readFile(redirected, 'utf8')).toBe(original)
    expect(refreshRequests).toBe(0)
  })
})
