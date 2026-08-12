import { contextBridge, ipcRenderer } from 'electron'

import type { AddAccountInput, CodexQuotaService } from '../shared/codex-quota'

const CHANNEL = {
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

/** Electron wraps handler errors in its own sentence; the UI shows ours. */
const IPC_PREFIX = /^Error invoking remote method '[^']*':\s*(Error:\s*)?/

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  try {
    return (await ipcRenderer.invoke(channel, ...args)) as T
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(message.replace(IPC_PREFIX, ''))
  }
}

const service: CodexQuotaService = {
  readRegistry: () => invoke(CHANNEL.readRegistry),
  readEnvironment: () => invoke(CHANNEL.readEnvironment),
  fetchQuota: (account) => invoke(CHANNEL.fetchQuota, account),
  addAccount: (input: AddAccountInput) => invoke(CHANNEL.addAccount, input),
  importActive: (account, options) => invoke(CHANNEL.importActive, account, options),
  activate: (account, options) => invoke(CHANNEL.activate, account, options),
  login: (account) => invoke(CHANNEL.login, account),
  startQuotaWindow: (account) => invoke(CHANNEL.startQuotaWindow, account),
  logout: (account) => invoke(CHANNEL.logout, account),
  deleteStoredAuth: (account) => invoke(CHANNEL.deleteStoredAuth, account),
  removeAccount: (account) => invoke(CHANNEL.removeAccount, account)
}

contextBridge.exposeInMainWorld('codexQuota', service)
contextBridge.exposeInMainWorld('codexQuotaDesktop', {
  platform: process.platform
})
