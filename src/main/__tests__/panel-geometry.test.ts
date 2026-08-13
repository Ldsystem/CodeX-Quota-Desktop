import { describe, expect, it } from 'vitest'

// The geometry lives apart from the window it positions so it can be tested
// without loading Electron.
import { panelBounds } from '../panel-bounds'

/** A 1440-wide display whose menu bar occupies the first 25 points. */
const work = { x: 0, y: 25, width: 1440, height: 875 }
const size = { width: 380, height: 460 }

describe('panelBounds', () => {
  it('centres the panel under the tray icon', () => {
    const tray = { x: 700, y: 0, width: 30, height: 24 }

    expect(panelBounds(tray, work, size)).toEqual({ x: 715 - 190, y: 25 + 6 })
  })

  it('keeps the panel inside the right edge when the icon sits in the corner', () => {
    // Menu bar icons live at the right of the screen, so this is the common
    // case rather than the exceptional one.
    const tray = { x: 1420, y: 0, width: 30, height: 24 }

    expect(panelBounds(tray, work, size).x).toBe(1440 - 380 - 8)
  })

  it('keeps the panel inside the left edge on a display with a negative origin', () => {
    const secondary = { x: -1920, y: 0, width: 1920, height: 1080 }
    const tray = { x: -1910, y: 0, width: 30, height: 24 }

    expect(panelBounds(tray, secondary, size).x).toBe(-1920 + 8)
  })

  it('never overlaps the menu bar, however the icon reports its own height', () => {
    const tray = { x: 700, y: 0, width: 30, height: 0 }

    expect(panelBounds(tray, work, size).y).toBeGreaterThanOrEqual(work.y)
  })
})
