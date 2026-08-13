/**
 * The renderer's only route to the filesystem and the network. Each channel is
 * one method of `CodexQuotaService`, so the preload can expose the service
 * interface unchanged.
 */

import { ipcMain } from 'electron'

import type { ActionOutcome, AddAccountInput, CodexQuotaService } from '../shared/codex-quota'
import { broadcastChanged } from './shell-api'

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

/**
 * Registers a channel whose success changes state on disk, and tells the other
 * windows once it has. A failed action changed nothing, so it says nothing.
 */
function handleMutation<A extends unknown[]>(
  channel: string,
  run: (...args: A) => Promise<ActionOutcome>
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    const outcome = await run(...(args as A))
    broadcastChanged(event.sender.id)
    return outcome
  })
}

export function registerCodexQuotaIpc(service: CodexQuotaService): void {
  ipcMain.handle(CHANNEL.readRegistry, () => service.readRegistry())
  ipcMain.handle(CHANNEL.readEnvironment, () => service.readEnvironment())
  ipcMain.handle(CHANNEL.fetchQuota, (_event, account: string) => service.fetchQuota(account))

  handleMutation(CHANNEL.addAccount, (input: AddAccountInput) => service.addAccount(input))
  handleMutation(CHANNEL.importActive, (account: string, options?: { create?: boolean }) =>
    service.importActive(account, options)
  )
  handleMutation(CHANNEL.activate, (account: string, options?: { force?: boolean }) =>
    service.activate(account, options)
  )
  handleMutation(CHANNEL.login, (account: string) => service.login(account))
  handleMutation(CHANNEL.startQuotaWindow, (account: string) => service.startQuotaWindow(account))
  handleMutation(CHANNEL.logout, (account: string) => service.logout(account))
  handleMutation(CHANNEL.deleteStoredAuth, (account: string) => service.deleteStoredAuth(account))
  handleMutation(CHANNEL.removeAccount, (account: string) => service.removeAccount(account))
}
