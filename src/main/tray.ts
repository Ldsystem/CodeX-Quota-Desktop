/**
 * The menu bar icon.
 *
 * Left click opens the panel; right click opens a menu for the things the
 * panel deliberately has no room for. The icon carries a short figure supplied
 * by the panel's renderer, which is the only part of the app that reads quota.
 */

import { Menu, Tray, app, nativeImage } from 'electron'
import type { Rectangle } from 'electron'
import { join } from 'node:path'

import type { ShellPreferences, TrayStatus } from '../shared/shell'

export interface TrayHandlers {
  onToggle(bounds: Rectangle): void
  onOpenMain(): void
  onRefresh(): void
  onToggleStartAtLogin(next: boolean): void
  onQuit(): void
}

export interface TrayController {
  setStatus(status: TrayStatus): void
  setPreferences(preferences: ShellPreferences): void
  destroy(): void
}

/**
 * Packaged, the icons sit in `Contents/Resources` via `extraResources`; in
 * development they are read straight out of `build/`.
 */
function iconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'trayTemplate.png')
    : join(__dirname, '../../build/trayTemplate.png')
}

function buildMenu(handlers: TrayHandlers, preferences: ShellPreferences): Menu {
  return Menu.buildFromTemplate([
    { label: 'Open Codex Quota', click: () => handlers.onOpenMain() },
    { label: 'Refresh accounts', click: () => handlers.onRefresh() },
    { type: 'separator' },
    {
      label: 'Start at login',
      type: 'checkbox',
      checked: preferences.startAtLogin,
      click: (item) => handlers.onToggleStartAtLogin(item.checked)
    },
    { type: 'separator' },
    { label: 'Quit Codex Quota', accelerator: 'Command+Q', click: () => handlers.onQuit() }
  ])
}

export function createTray(handlers: TrayHandlers): TrayController {
  const image = nativeImage.createFromPath(iconPath())
  // Template images are recoloured by macOS to match the menu bar, including
  // when it inverts under a light wallpaper or a dark one.
  image.setTemplateImage(true)

  const tray = new Tray(image)
  tray.setToolTip('Codex Quota')

  let preferences: ShellPreferences = { startAtLogin: false, menuBarOnly: false }
  let menu = buildMenu(handlers, preferences)

  // The menu is popped up explicitly rather than attached with setContextMenu:
  // an attached menu opens on left click too, which would leave no gesture for
  // the panel.
  tray.on('click', () => handlers.onToggle(tray.getBounds()))
  tray.on('right-click', () => tray.popUpContextMenu(menu))

  return {
    setStatus(status: TrayStatus): void {
      tray.setTitle(status.title)
      tray.setToolTip(status.tooltip)
    },
    setPreferences(next: ShellPreferences): void {
      preferences = next
      menu = buildMenu(handlers, preferences)
    },
    destroy(): void {
      tray.destroy()
    }
  }
}
