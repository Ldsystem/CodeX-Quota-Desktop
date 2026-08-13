/**
 * The app lives in the menu bar.
 *
 * Closing the window does not end the session: the tray icon stays, its panel
 * keeps reading quota, and quitting is something the user asks for explicitly.
 * That is the whole difference between this and an ordinary window app, and
 * everything below exists to keep the two surfaces agreeing with each other.
 */

import { BrowserWindow, app } from 'electron'
import { join } from 'node:path'

import type { ShellPreferences, TrayStatus } from '../shared/shell'
import { createCodexQuotaService } from './codex-quota/service'
import { resolvePaths } from './codex-quota/paths'
import { registerCodexQuotaIpc } from './ipc'
import { createPanel } from './panel'
import type { Panel } from './panel'
import { readPreferences, writePreferences } from './preferences'
import {
  SHELL_CHANNEL,
  broadcastChanged,
  broadcastPreferences,
  registerShellIpc
} from './shell-api'
import { createTray } from './tray'
import type { TrayController } from './tray'

const isDev = !app.isPackaged
const preloadPath = join(__dirname, '../preload/index.cjs')
const rendererUrl = isDev ? process.env['ELECTRON_RENDERER_URL'] : undefined
const storageRoot = resolvePaths(process.env).home

let mainWindow: BrowserWindow | null = null
let panel: Panel | null = null
let tray: TrayController | null = null
let quitting = false

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 620,
    show: false,
    title: 'Codex Quota',
    // Avoids a white flash before the renderer paints its own background.
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  window.on('ready-to-show', () => window.show())
  window.on('closed', () => {
    mainWindow = null
  })

  if (rendererUrl) {
    void window.loadURL(rendererUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

/** Raises the workbench, creating it again if it was closed. */
function openMain(account: string | null): void {
  if (mainWindow === null || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow()
  }

  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()

  if (account !== null) {
    // The window may still be loading, in which case the route has to wait for
    // a renderer that can receive it.
    if (mainWindow.webContents.isLoading()) {
      mainWindow.webContents.once('did-finish-load', () => {
        mainWindow?.webContents.send(SHELL_CHANNEL.route, account)
      })
    } else {
      mainWindow.webContents.send(SHELL_CHANNEL.route, account)
    }
  }
}

function applyPreferences(preferences: ShellPreferences): void {
  tray?.setPreferences(preferences)
  broadcastPreferences(preferences)

  if (process.platform !== 'darwin') return
  if (preferences.menuBarOnly) {
    void app.dock?.hide()
  } else {
    void app.dock?.show()
  }
}

app.whenReady().then(async () => {
  registerCodexQuotaIpc(createCodexQuotaService(undefined, { allowTokenRefresh: true }))

  registerShellIpc({
    readPreferences: () => readPreferences(storageRoot),
    writePreferences: async (changes) => {
      const preferences = await writePreferences(storageRoot, changes)
      applyPreferences(preferences)
      return preferences
    },
    setTrayStatus: (status: TrayStatus) => tray?.setStatus(status),
    hidePanel: () => panel?.hide(),
    openMain
  })

  panel = createPanel(preloadPath, rendererUrl, () => quitting)

  tray = createTray({
    onToggle: (bounds) => panel?.toggle(bounds),
    onOpenMain: () => openMain(null),
    onRefresh: () => broadcastChanged(),
    onToggleAutoSync: (next) => {
      void writePreferences(storageRoot, { autoSync: next }).then(applyPreferences)
    },
    onToggleStartAtLogin: (next) => {
      void writePreferences(storageRoot, { startAtLogin: next }).then(applyPreferences)
    },
    onQuit: () => app.quit()
  })

  applyPreferences(await readPreferences(storageRoot))

  // Launched at login the app should arrive as an icon, not as a window in
  // front of whatever the user is doing.
  if (!app.getLoginItemSettings().wasOpenedAsHidden) openMain(null)

  app.on('activate', () => openMain(null))
})

app.on('before-quit', () => {
  quitting = true
})

app.on('will-quit', () => {
  // Without this the icon can outlive the process it belongs to.
  if (quitting) tray?.destroy()
})

app.on('window-all-closed', () => {
  // On macOS the tray is the app, so no windows is a normal state. Elsewhere
  // there is no menu bar to live in, and staying would strand the process.
  if (process.platform !== 'darwin') app.quit()
})
