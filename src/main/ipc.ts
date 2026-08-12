/**
 * The renderer's only route to the filesystem and the network. Each channel is
 * one method of `CodexQuotaService`, so the preload can expose the service
 * interface unchanged.
 */

import { ipcMain } from 'electron'

import type { AddAccountInput, CodexQuotaService } from '../shared/codex-quota'

export const CHANNEL = {
  readRegistry: 'codex-quota:read-registry',
  readEnvironment: 'codex-quota:read-environment',
  fetchQuota: 'codex-quota:fetch-quota',
  addAccount: 'codex-quota:add-account',
  importActive: 'codex-quota:import-active',
  activate: 'codex-quota:activate',
  login: 'codex-quota:login',
  startQuotaWindow: 'codex-quota:start-quota-window',
  logout: 'codex-quota:logout',
  deleteStoredAuth: 'codex-quota:delete-stored-auth',
  removeAccount: 'codex-quota:remove-account'
} as const

export function registerCodexQuotaIpc(service: CodexQuotaService): void {
  ipcMain.handle(CHANNEL.readRegistry, () => service.readRegistry())
  ipcMain.handle(CHANNEL.readEnvironment, () => service.readEnvironment())
  ipcMain.handle(CHANNEL.fetchQuota, (_event, account: string) => service.fetchQuota(account))
  ipcMain.handle(CHANNEL.addAccount, (_event, input: AddAccountInput) => service.addAccount(input))
  ipcMain.handle(CHANNEL.importActive, (_event, account: string, options?: { create?: boolean }) =>
    service.importActive(account, options)
  )
  ipcMain.handle(CHANNEL.activate, (_event, account: string, options?: { force?: boolean }) =>
    service.activate(account, options)
  )
  ipcMain.handle(CHANNEL.login, (_event, account: string) => service.login(account))
  ipcMain.handle(CHANNEL.startQuotaWindow, (_event, account: string) =>
    service.startQuotaWindow(account)
  )
  ipcMain.handle(CHANNEL.logout, (_event, account: string) => service.logout(account))
  ipcMain.handle(CHANNEL.deleteStoredAuth, (_event, account: string) =>
    service.deleteStoredAuth(account)
  )
  ipcMain.handle(CHANNEL.removeAccount, (_event, account: string) => service.removeAccount(account))
}
