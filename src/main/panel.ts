/**
 * The panel the menu bar icon opens.
 *
 * It is created once at startup and then only ever shown and hidden, for two
 * reasons: the deck is warm on the first click, and its renderer keeps polling
 * while hidden, which is what lets the icon carry a live figure without the
 * main process doing any fetching of its own.
 */

import { BrowserWindow, screen } from 'electron'
import type { Rectangle } from 'electron'
import { join } from 'node:path'

import { panelBounds } from './panel-bounds'

/** Sized to the tallest card a deck can hold, not to a round number. */
const SIZE = { width: 380, height: 306 }

export interface Panel {
  toggle(trayBounds: Rectangle): void
  hide(): void
  /** True while the panel is the thing the user is looking at. */
  isVisible(): boolean
  window: BrowserWindow
}

export function createPanel(
  preloadPath: string,
  rendererUrl: string | undefined,
  quitting: () => boolean
): Panel {
  const window = new BrowserWindow({
    ...SIZE,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#12161c',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      // Hidden windows have their timers throttled to once a minute, which
      // would leave the menu bar figure stale exactly when the window the user
      // can see is closed.
      backgroundThrottling: false
    }
  })

  // A menu bar panel belongs to whichever space is in front, including over a
  // fullscreen app, rather than to the space it happened to be created on.
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  if (rendererUrl) {
    void window.loadURL(`${rendererUrl}/panel.html`)
  } else {
    void window.loadFile(join(__dirname, '../renderer/panel.html'))
  }

  // Clicking anywhere else dismisses it, the way every other menu bar panel
  // behaves. Devtools count as elsewhere, so leave it open while they are.
  window.on('blur', () => {
    if (!window.webContents.isDevToolsOpened()) window.hide()
  })

  // Command-W would otherwise destroy the panel for the rest of the session,
  // and the tray icon would then open nothing at all.
  window.on('close', (event) => {
    if (quitting()) return
    event.preventDefault()
    window.hide()
  })

  return {
    toggle(trayBounds: Rectangle): void {
      if (window.isVisible()) {
        window.hide()
        return
      }

      const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y })
      const { x, y } = panelBounds(trayBounds, display.workArea, SIZE)
      window.setPosition(x, y, false)
      window.show()
      window.focus()
    },
    hide(): void {
      window.hide()
    },
    isVisible(): boolean {
      return window.isVisible()
    },
    window
  }
}
