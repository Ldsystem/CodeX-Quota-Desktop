/**
 * Where the tray panel sits.
 *
 * Kept apart from the window that uses it so it can be tested without loading
 * Electron, and because placement is the only part of a menu bar panel that is
 * easy to get subtly wrong: menu bar icons live at the right edge of the
 * screen, where a panel centred on the icon would hang off the display.
 */

export interface Rectangle {
  x: number
  y: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

/** Breathing room between the panel and the screen edge. */
const MARGIN = 8

/** Gap below the menu bar, so the panel reads as detached from it. */
const GAP = 6

export function panelBounds(
  tray: Rectangle,
  work: Rectangle,
  size: Size
): { x: number; y: number } {
  const centred = Math.round(tray.x + tray.width / 2 - size.width / 2)
  const leftLimit = work.x + MARGIN
  const rightLimit = work.x + work.width - size.width - MARGIN

  return {
    x: Math.round(Math.min(Math.max(centred, leftLimit), rightLimit)),
    // A tray icon can report a zero height, and the work area already starts
    // below the menu bar, so the lower of the two is the honest anchor.
    y: Math.round(Math.max(work.y, tray.y + tray.height) + GAP)
  }
}
