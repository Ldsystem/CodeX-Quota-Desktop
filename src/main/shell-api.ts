/**
 * The channels that are about the shell rather than about accounts: the menu
 * bar figure, the panel, the main window, and the two preferences.
 *
 * The broadcast lives here too. Two windows now look at the same files, so an
 * action taken in one has to tell the other, or the panel and the workbench
 * spend the rest of the session disagreeing about which account is live.
 */

import { BrowserWindow, ipcMain } from 'electron'

import type { ShellPreferences, TrayStatus } from '../shared/shell'

export const SHELL_CHANNEL = {
  getPreferences: 'shell:get-preferences',
  setPreferences: 'shell:set-preferences',
  setTrayStatus: 'shell:set-tray-status',
  hidePanel: 'shell:hide-panel',
  openMain: 'shell:open-main',
  changed: 'shell:changed',
  route: 'shell:route',
  preferences: 'shell:preferences'
} as const

export interface ShellHost {
  readPreferences(): Promise<ShellPreferences>
  writePreferences(changes: Partial<ShellPreferences>): Promise<ShellPreferences>
  setTrayStatus(status: TrayStatus): void
  hidePanel(): void
  openMain(account: string | null): void
}

export function registerShellIpc(host: ShellHost): void {
  ipcMain.handle(SHELL_CHANNEL.getPreferences, () => host.readPreferences())

  ipcMain.handle(SHELL_CHANNEL.setPreferences, (_event, changes: Partial<ShellPreferences>) =>
    host.writePreferences(changes)
  )

  ipcMain.handle(SHELL_CHANNEL.setTrayStatus, (_event, status: TrayStatus) => {
    host.setTrayStatus(status)
  })

  ipcMain.handle(SHELL_CHANNEL.hidePanel, () => {
    host.hidePanel()
  })

  ipcMain.handle(SHELL_CHANNEL.openMain, (_event, account?: string) => {
    host.openMain(account ?? null)
  })
}

/**
 * Tells the other windows that something on disk moved underneath them. The
 * window that performed the action is skipped: it re-reads on its own, and a
 * second read would only make its own click look slower.
 */
export function broadcastChanged(exceptWebContentsId?: number): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.webContents.id === exceptWebContentsId) continue
    window.webContents.send(SHELL_CHANNEL.changed)
  }
}

/**
 * Preferences go to every window including the one that changed them. The
 * switch is drawn in three places and one of them decides whether the panel's
 * timer runs at all, so a single answer has to reach all of them.
 */
export function broadcastPreferences(preferences: ShellPreferences): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(SHELL_CHANNEL.preferences, preferences)
  }
}
