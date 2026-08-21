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

type Anchor = 'below' | 'above' | 'left' | 'right'

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Infer which side of the work area the tray lives on. */
function inferAnchor(tray: Rectangle, work: Rectangle): Anchor {
  const centreX = tray.x + tray.width / 2
  const centreY = tray.y + tray.height / 2
  const workRight = work.x + work.width
  const workBottom = work.y + work.height

  if (centreY > workBottom) return 'above'
  if (centreX < work.x) return 'right'
  if (centreX > workRight) return 'left'
  return 'below'
}

export function panelBounds(
  tray: Rectangle,
  work: Rectangle,
  size: Size
): { x: number; y: number } {
  const centredX = Math.round(tray.x + tray.width / 2 - size.width / 2)
  const centredY = Math.round(tray.y + tray.height / 2 - size.height / 2)
  const leftLimit = work.x + MARGIN
  const rightLimit = work.x + work.width - size.width - MARGIN
  const topLimit = work.y + MARGIN
  const bottomLimit = work.y + work.height - size.height - MARGIN
  const anchor = inferAnchor(tray, work)

  if (anchor === 'above') {
    return {
      x: Math.round(clamp(centredX, leftLimit, rightLimit)),
      y: Math.round(clamp(tray.y - size.height - GAP, topLimit, bottomLimit))
    }
  }

  if (anchor === 'right') {
    return {
      x: Math.round(clamp(Math.max(tray.x + tray.width + GAP, leftLimit), leftLimit, rightLimit)),
      y: Math.round(clamp(centredY, topLimit, bottomLimit))
    }
  }

  if (anchor === 'left') {
    return {
      x: Math.round(clamp(Math.min(tray.x - size.width - GAP, rightLimit), leftLimit, rightLimit)),
      y: Math.round(clamp(centredY, topLimit, bottomLimit))
    }
  }

  const belowY = Math.round(Math.max(work.y, tray.y + tray.height) + GAP)
  if (belowY + size.height <= work.y + work.height - MARGIN) {
    return {
      x: Math.round(clamp(centredX, leftLimit, rightLimit)),
      // A tray icon can report a zero height, and the work area already starts
      // below the menu bar, so the lower of the two is the honest anchor.
      y: belowY
    }
  }

  return {
    x: Math.round(clamp(centredX, leftLimit, rightLimit)),
    y: Math.round(clamp(tray.y - size.height - GAP, topLimit, bottomLimit))
  }
}
