import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveCodexBinary, startedBilledTurn } from '../codex-cli'
import { scratchHome, type Scratch } from './helpers'

describe('codex binary resolution', () => {
  let scratch: Scratch

  beforeEach(async () => {
    scratch = await scratchHome()
  })

  afterEach(async () => {
    await scratch.cleanup()
  })

  async function fakeBinary(directory: string, name = 'codex'): Promise<string> {
    await mkdir(directory, { recursive: true })
    const path = join(directory, name)
    await writeFile(path, '#!/bin/sh\nexit 0\n')
    await chmod(path, 0o755)
    return path
  }

  /** Nothing installed anywhere unless a test puts it there. */
  function resolve(
    overrides: Parameters<typeof resolveCodexBinary>[0] = {}
  ): ReturnType<typeof resolveCodexBinary> {
    return resolveCodexBinary({
      env: { PATH: join(scratch.home, 'empty') },
      home: scratch.home,
      knownDirectories: [],
      bundledPath: null,
      ...overrides
    })
  }

  it("prefers the user's own codex on PATH", async () => {
    const onPath = await fakeBinary(join(scratch.home, 'bin'))
    const bundled = await fakeBinary(join(scratch.home, 'bundled'))

    expect(await resolve({ env: { PATH: join(scratch.home, 'bin') }, bundledPath: bundled })).toEqual(
      { path: onPath, origin: 'path' }
    )
  })

  it('searches the usual install directories, which a GUI launch leaves off PATH', async () => {
    const installed = await fakeBinary(join(scratch.home, '.local', 'bin'))

    expect(await resolve({ knownDirectories: ['~/.local/bin'] })).toEqual({
      path: installed,
      origin: 'known-location'
    })
  })

  it('takes the configured path over anything it could find', async () => {
    await fakeBinary(join(scratch.home, 'bin'))
    const chosen = await fakeBinary(join(scratch.home, 'custom'), 'codex-nightly')

    expect(
      await resolve({
        env: { PATH: join(scratch.home, 'bin'), CODEX_QUOTA_CODEX_BIN: chosen }
      })
    ).toEqual({ path: chosen, origin: 'configured' })
  })

  it('reports nothing when the configured path is wrong, rather than silently using another', async () => {
    await fakeBinary(join(scratch.home, 'bin'))

    expect(
      await resolve({
        env: { PATH: join(scratch.home, 'bin'), CODEX_QUOTA_CODEX_BIN: join(scratch.home, 'gone') }
      })
    ).toBeNull()
  })

  it('falls back to the bundled copy when nothing else exists', async () => {
    const bundled = await fakeBinary(join(scratch.home, 'bundled'))

    expect(await resolve({ bundledPath: bundled })).toEqual({ path: bundled, origin: 'bundled' })
  })

  it('ignores a non-executable file on PATH', async () => {
    const directory = join(scratch.home, 'bin')
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'codex'), 'not executable', { mode: 0o644 })

    expect(await resolve({ env: { PATH: directory } })).toBeNull()
  })

  it('reports nothing when neither exists', async () => {
    expect(await resolve()).toBeNull()
  })
})

describe('billed turn detection', () => {
  it('accepts a completed turn that consumed tokens', () => {
    const jsonl = [
      '{"type":"thread.started"}',
      '{"type":"turn.completed","usage":{"input_tokens":42,"output_tokens":3}}'
    ].join('\n')

    expect(startedBilledTurn(jsonl)).toBe(true)
  })

  it('rejects a turn that reported no usage', () => {
    const jsonl = '{"type":"turn.completed","usage":{"input_tokens":0,"output_tokens":0}}'
    expect(startedBilledTurn(jsonl)).toBe(false)
  })

  it('rejects output with no completed turn at all', () => {
    expect(startedBilledTurn('{"type":"error","message":"unauthorized"}\nnot json')).toBe(false)
  })
})
