import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { readCodexQuotaEnvFile, resolvePaths } from '../paths'

const scratch: string[] = []

afterEach(async () => {
  await Promise.all(scratch.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('proxy configuration', () => {
  it('uses a direct connection when no proxy is configured', () => {
    expect(resolvePaths({}, '/tmp/example', {}).proxyUrl).toBeNull()
  })

  it('reads HTTPS_PROXY from the quota env file', async () => {
    const home = await mkdtemp(join(tmpdir(), 'codex-quota-paths-'))
    scratch.push(home)
    await mkdir(join(home, '.codex-quota'))
    await writeFile(
      join(home, '.codex-quota', '.env'),
      '# local desktop settings\nHTTPS_PROXY="http://file-proxy:8443"\n'
    )

    const fileEnv = await readCodexQuotaEnvFile(home)
    expect(resolvePaths({}, home, fileEnv).proxyUrl).toBe('http://file-proxy:8443')
  })

  it('prefers process proxy variables over every proxy from the env file', () => {
    const fileEnv = {
      HTTPS_PROXY: 'http://file-https:8443',
      HTTP_PROXY: 'http://file-http:8080'
    }

    expect(resolvePaths({ HTTP_PROXY: 'http://process:9000' }, '/tmp/example', fileEnv).proxyUrl)
      .toBe('http://process:9000')
  })

  it('prefers HTTPS_PROXY to HTTP_PROXY within the same source', () => {
    expect(
      resolvePaths(
        { HTTPS_PROXY: 'http://secure:8443', HTTP_PROXY: 'http://plain:8080' },
        '/tmp/example',
        {}
      ).proxyUrl
    ).toBe('http://secure:8443')
  })
})
