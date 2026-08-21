import { readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { copyFileAtomic, writeFileAtomic } from '../atomic'
import { listDir, scratchHome, type Scratch } from './helpers'

describe('atomic writes', () => {
  let scratch: Scratch

  beforeEach(async () => {
    scratch = await scratchHome()
  })

  afterEach(async () => {
    await scratch.cleanup()
  })

  async function mode(path: string): Promise<string> {
    return ((await stat(path)).mode & 0o777).toString(8)
  }

  it('writes through a temp file and leaves only the destination', async () => {
    const target = join(scratch.home, 'nested', 'auth.json')
    await writeFileAtomic(target, '{"a":1}')

    expect(await readFile(target, 'utf8')).toBe('{"a":1}')
    if (process.platform !== 'win32') expect(await mode(target)).toBe('600')
    expect(await listDir(join(scratch.home, 'nested'))).toEqual(['auth.json'])
  })

  it('copies byte for byte and leaves no temp file', async () => {
    const source = join(scratch.home, 'source.json')
    const target = join(scratch.home, 'accounts', 'work', 'auth.json')
    await writeFile(source, '{"tokens":{"access_token":"x"}}', { mode: 0o644 })

    await copyFileAtomic(source, target)

    expect(await readFile(target, 'utf8')).toBe(await readFile(source, 'utf8'))
    if (process.platform !== 'win32') expect(await mode(target)).toBe('600')
    expect(await listDir(join(scratch.home, 'accounts', 'work'))).toEqual(['auth.json'])
  })

  it('refuses a missing source and leaves the destination untouched', async () => {
    const target = join(scratch.home, 'auth.json')
    await writeFile(target, 'original', { mode: 0o600 })

    await expect(copyFileAtomic(join(scratch.home, 'absent.json'), target)).rejects.toThrow(
      /not found/i
    )
    expect(await readFile(target, 'utf8')).toBe('original')
  })
})
