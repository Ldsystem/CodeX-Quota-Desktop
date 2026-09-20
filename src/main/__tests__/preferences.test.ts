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

describe('window priming request preferences', () => {
  it('uses the Codex defaults when no request settings have been saved', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-quota-preferences-'))
    scratch.push(root)

    await expect(readPreferences(root)).resolves.toMatchObject({
      windowStartModel: '',
      windowStartReasoningEffort: ''
    })
  })

  it('uses the launch configuration until request preferences are saved', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-quota-preferences-'))
    scratch.push(root)

    await expect(readPreferences(root, 'launch-model', 'medium')).resolves.toMatchObject({
      windowStartModel: 'launch-model',
      windowStartReasoningEffort: 'medium'
    })
    await writePreferences(root, { autoSync: false }, 'launch-model', 'medium')
    await expect(readPreferences(root)).resolves.toMatchObject({
      autoSync: false,
      windowStartModel: 'launch-model',
      windowStartReasoningEffort: 'medium'
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

  it('persists an arbitrary reasoning effort, including an empty Codex default', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-quota-preferences-'))
    scratch.push(root)

    const saved = await writePreferences(root, {
      windowStartReasoningEffort: 'custom-effort'
    })
    expect(saved.windowStartReasoningEffort).toBe('custom-effort')
    expect(JSON.parse(await readFile(preferencesPath(root), 'utf8'))).toMatchObject({
      windowStartReasoningEffort: 'custom-effort'
    })

    const delegated = await writePreferences(root, { windowStartReasoningEffort: '  ' })
    expect(delegated.windowStartReasoningEffort).toBe('')
  })
})
