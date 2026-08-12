import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

import { createCodexQuotaService } from './codex-quota/service'
import { registerCodexQuotaIpc } from './ipc'

const isDev = !app.isPackaged

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 620,
    show: false,
    title: 'Codex Quota',
    // Avoids a white flash before the renderer paints its own background.
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerCodexQuotaIpc(createCodexQuotaService(undefined, { allowTokenRefresh: true }))
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
