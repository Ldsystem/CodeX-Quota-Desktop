import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { inspectAuthFile, readAuthCredentials } from '../auth-file'

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cq-auth-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function write(name: string, body: string): Promise<string> {
  const path = join(dir, name)
  await writeFile(path, body, 'utf8')
  return path
}

describe('inspectAuthFile', () => {
  it('reports an absent file without inventing warnings', async () => {
    expect(await inspectAuthFile(join(dir, 'missing.json'))).toEqual({
      exists: false,
      parsable: false,
      hasAccessToken: false,
      hasRefreshToken: false,
      authenticated: false
    })
  })

  it.each([
    ['snake case at the root', '{"access_token":"a","refresh_token":"r"}'],
    ['camel case at the root', '{"accessToken":"a","refreshToken":"r"}'],
    ['nested snake case', '{"tokens":{"access_token":"a","refresh_token":"r"}}'],
    ['nested camel case', '{"tokens":{"accessToken":"a","refreshToken":"r"}}']
  ])('accepts %s', async (_label, body) => {
    const inspection = await inspectAuthFile(await write('auth.json', body))
    expect(inspection.hasAccessToken).toBe(true)
    expect(inspection.hasRefreshToken).toBe(true)
    expect(inspection.authenticated).toBe(true)
  })

  it('counts an API key as an access token, as the CLI does', async () => {
    const inspection = await inspectAuthFile(await write('auth.json', '{"OPENAI_API_KEY":"sk-x"}'))
    expect(inspection.hasAccessToken).toBe(true)
    expect(inspection.hasRefreshToken).toBe(false)
    expect(inspection.authenticated).toBe(true)
  })

  it('rejects empty string tokens', async () => {
    const inspection = await inspectAuthFile(await write('auth.json', '{"access_token":""}'))
    expect(inspection.hasAccessToken).toBe(false)
    expect(inspection.authenticated).toBe(false)
  })

  it('flags unparsable json as present but not parsable', async () => {
    const inspection = await inspectAuthFile(await write('auth.json', '{not json'))
    expect(inspection).toEqual({
      exists: true,
      parsable: false,
      hasAccessToken: false,
      hasRefreshToken: false,
      authenticated: false
    })
  })
})

describe('readAuthCredentials', () => {
  it('returns the credentials needed for the usage call', async () => {
    const path = await write(
      'auth.json',
      '{"tokens":{"access_token":"a","refresh_token":"r","id_token":"i","account_id":"acct_1"}}'
    )
    expect(await readAuthCredentials(path)).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      idToken: 'i',
      accountId: 'acct_1'
    })
  })

  it('returns null when the file cannot be parsed', async () => {
    expect(await readAuthCredentials(await write('auth.json', 'nope'))).toBeNull()
  })
})
