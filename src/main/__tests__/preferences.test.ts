import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getLoginItemSettings: () => ({ openAtLogin: false }),
    setLoginItemSettings: vi.fn()
  }
}))

import { preferencesPath, readPreferences, writePreferences } from '../preferences'

const scratch: string[] = []

afterEach(async () => {
  await Promise.all(scratch.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('window priming model preference', () => {
  it('uses the Codex default when no model has been saved', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-quota-preferences-'))
    scratch.push(root)

    await expect(readPreferences(root)).resolves.toMatchObject({ windowStartModel: '' })
  })

  it('uses the launch configuration until a model preference is saved', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-quota-preferences-'))
    scratch.push(root)

    await expect(readPreferences(root, 'launch-model')).resolves.toMatchObject({
      windowStartModel: 'launch-model'
    })
    await writePreferences(root, { autoSync: false }, 'launch-model')
    await expect(readPreferences(root)).resolves.toMatchObject({
      autoSync: false,
      windowStartModel: 'launch-model'
    })
  })

  it('persists an arbitrary model in the app configuration file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-quota-preferences-'))
    scratch.push(root)

    const saved = await writePreferences(root, { windowStartModel: 'future-model-1' })

    expect(saved.windowStartModel).toBe('future-model-1')
    expect(JSON.parse(await readFile(preferencesPath(root), 'utf8'))).toMatchObject({
      windowStartModel: 'future-model-1'
    })
  })
})
