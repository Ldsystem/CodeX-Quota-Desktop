import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requestJson: vi.fn() }))
vi.mock('../http', () => ({ requestJson: mocks.requestJson }))

import { addAccount } from '../accounts'
import { readActive, writeActive } from '../active'
import { sha256File } from '../checksum'
import { accountAuthPath } from '../paths'
import { readRegistrySnapshot } from '../registry'
import { createCodexQuotaService } from '../service'
import { scratchHome, type Scratch } from './helpers'

describe('quota 401 refresh', () => {
  let scratch: Scratch

  beforeEach(async () => {
    scratch = await scratchHome()
    scratch.paths.proxyUrl = null
    await addAccount(scratch.paths, { account: 'work' })
    await mkdir(scratch.paths.codexHome, { recursive: true })
    const body = JSON.stringify({
      tokens: {
        access_token: 'old-access',
        refresh_token: 'refresh-original',
        account_id: 'acct_1'
      }
    })
    await writeFile(accountAuthPath(scratch.paths, 'work'), body, { mode: 0o600 })
    await writeFile(scratch.paths.liveAuth, body, { mode: 0o600 })
    await writeActive(scratch.paths, {
      account: 'work',
      profileMode: 'desktop_preserving',
      source: 'activate'
    })

    mocks.requestJson.mockImplementation(async (url: string, options?: { headers?: Record<string, string> }) => {
      if (url === scratch.paths.tokenUrl) {
        return { status: 200, body: { access_token: 'new-access', refresh_token: 'refresh-new' } }
      }
      if (url === scratch.paths.usageUrl) {
        const token = options?.headers?.authorization
        if (token === 'Bearer old-access') return { status: 401, body: {} }
        return {
          status: 200,
          body: {
            plan_type: 'plus',
            rate_limit: {
              primary_window: {
                used_percent: 8,
                reset_at: 1_800_000_000,
                limit_window_seconds: 604_800
              }
            }
          }
        }
      }
      return { status: 500, body: {} }
    })
  })

  afterEach(async () => {
    mocks.requestJson.mockReset()
    await scratch.cleanup()
  })

  it('keeps active state verified after refreshing and retrying a 401', async () => {
    const service = createCodexQuotaService(scratch.paths, { allowTokenRefresh: true })

    const report = await service.fetchQuota('work')

    expect(report.windows[0]?.usedPercent).toBe(8)
    expect(await readFile(accountAuthPath(scratch.paths, 'work'), 'utf8')).toBe(
      await readFile(scratch.paths.liveAuth, 'utf8')
    )
    const active = await readActive(scratch.paths)
    const refreshedSha = await sha256File(scratch.paths.liveAuth)
    expect(active?.activeAuthSha256).toBe(refreshedSha)
    expect(active?.profileAuthSha256).toBe(refreshedSha)
    const [account] = (
      await readRegistrySnapshot(scratch.paths, { desktopRunning: false })
    ).accounts
    expect(account?.active).toBe('yes')
    expect(account?.warnings).not.toContain('active-drift')
    expect(
      mocks.requestJson.mock.calls.filter(([url]) => url === scratch.paths.tokenUrl)
    ).toHaveLength(1)
  })
})
