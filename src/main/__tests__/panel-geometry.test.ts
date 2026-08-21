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

  it('places the panel above a bottom-taskbar icon and keeps it in the work area', () => {
    const bottomWork = { x: 0, y: 0, width: 1440, height: 860 }
    const tray = { x: 700, y: 860, width: 30, height: 40 }
    const bounds = panelBounds(tray, bottomWork, size)

    expect(bounds.y + size.height).toBeLessThanOrEqual(tray.y)
    expect(bounds.y).toBeGreaterThanOrEqual(bottomWork.y)
    expect(bounds.x).toBeGreaterThanOrEqual(bottomWork.x)
    expect(bounds.x + size.width).toBeLessThanOrEqual(bottomWork.x + bottomWork.width)
  })

  it('places the panel to the right of a left-taskbar icon and keeps it in the work area', () => {
    const leftWork = { x: 48, y: 0, width: 1392, height: 900 }
    const tray = { x: 0, y: 400, width: 48, height: 24 }
    const bounds = panelBounds(tray, leftWork, size)

    expect(bounds.x).toBeGreaterThanOrEqual(tray.x + tray.width)
    expect(bounds.x).toBeGreaterThanOrEqual(leftWork.x)
    expect(bounds.y).toBeLessThanOrEqual(tray.y)
    expect(bounds.y).toBeGreaterThanOrEqual(leftWork.y)
    expect(bounds.y + size.height).toBeLessThanOrEqual(leftWork.y + leftWork.height)
  })

  it('places the panel to the left of a right-taskbar icon and keeps it in the work area', () => {
    const rightWork = { x: 0, y: 0, width: 1392, height: 900 }
    const tray = { x: 1392, y: 400, width: 48, height: 24 }
    const bounds = panelBounds(tray, rightWork, size)

    expect(bounds.x + size.width).toBeLessThanOrEqual(tray.x)
    expect(bounds.x + size.width).toBeLessThanOrEqual(rightWork.x + rightWork.width)
    expect(bounds.y).toBeLessThanOrEqual(tray.y)
    expect(bounds.y).toBeGreaterThanOrEqual(rightWork.y)
    expect(bounds.y + size.height).toBeLessThanOrEqual(rightWork.y + rightWork.height)
  })

  it('flips above a Windows overflow-tray icon that sits inside the work area', () => {
    // The hidden-icons flyout is above the taskbar, so Electron reports the
    // icon inside the work area. Placing the panel below it would clip.
    const overflowWork = { x: 0, y: 0, width: 1440, height: 860 }
    const tray = { x: 1380, y: 780, width: 32, height: 32 }
    const bounds = panelBounds(tray, overflowWork, size)

    expect(bounds.y + size.height).toBeLessThanOrEqual(tray.y)
    expect(bounds.y).toBeGreaterThanOrEqual(overflowWork.y)
    expect(bounds.y + size.height).toBeLessThanOrEqual(overflowWork.y + overflowWork.height)
    expect(bounds.x).toBeGreaterThanOrEqual(overflowWork.x)
    expect(bounds.x + size.width).toBeLessThanOrEqual(overflowWork.x + overflowWork.width)
  })
})
