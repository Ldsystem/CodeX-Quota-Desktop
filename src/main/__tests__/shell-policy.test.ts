import { describe, expect, it } from 'vitest'

import { applyTrayStatus, shouldQuitOnWindowAllClosed } from '../shell-policy'

describe('shouldQuitOnWindowAllClosed', () => {
  it('keeps the macOS process alive when no windows remain', () => {
    expect(shouldQuitOnWindowAllClosed('darwin', { trayPresent: true })).toBe(false)
    expect(shouldQuitOnWindowAllClosed('darwin', { trayPresent: false })).toBe(false)
  })

  it('keeps the Windows process alive when the tray still exists', () => {
    expect(shouldQuitOnWindowAllClosed('win32', { trayPresent: true })).toBe(false)
  })

  it('quits on Linux, or on Windows when there is no tray', () => {
    expect(shouldQuitOnWindowAllClosed('linux', { trayPresent: true })).toBe(true)
    expect(shouldQuitOnWindowAllClosed('win32', { trayPresent: false })).toBe(true)
  })
})

describe('applyTrayStatus', () => {
  it('keeps setTitle and template images on macOS', () => {
    expect(
      applyTrayStatus('darwin', { title: '23%', tooltip: 'Codex Quota — work in use' })
    ).toEqual({
      templateImage: true,
      title: '23%',
      tooltip: 'Codex Quota — work in use'
    })
  })

  it('puts the figure in the Windows tooltip and skips setTitle and template images', () => {
    expect(
      applyTrayStatus('win32', { title: '23%', tooltip: 'Codex Quota — work in use' })
    ).toEqual({
      templateImage: false,
      title: '',
      tooltip: 'Codex Quota — work in use · 23%'
    })
  })

  it('leaves the Windows tooltip alone when there is no figure', () => {
    expect(
      applyTrayStatus('win32', { title: '', tooltip: 'Codex Quota — no account in use' })
    ).toEqual({
      templateImage: false,
      title: '',
      tooltip: 'Codex Quota — no account in use'
    })
  })
})
