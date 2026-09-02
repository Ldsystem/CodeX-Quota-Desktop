import { contextBridge, ipcRenderer } from 'electron'

import type { AddAccountInput, CodexQuotaService } from '../shared/codex-quota'
import type { CodexQuotaShell, ShellPreferences, TrayStatus } from '../shared/shell'

const SHELL_CHANNEL = {
  getPreferences: 'shell:get-preferences',
  setPreferences: 'shell:set-preferences',
  setTrayStatus: 'shell:set-tray-status',
  hidePanel: 'shell:hide-panel',
  openMain: 'shell:open-main',
  changed: 'shell:changed',
  route: 'shell:route',
  preferences: 'shell:preferences'
} as const

const CHANNEL = {
  readRegistry: 'codex-quota:read-registry',
  readEnvironment: 'codex-quota:read-environment',
  fetchQuota: 'codex-quota:fetch-quota',
  addAccount: 'codex-quota:add-account',
  importActive: 'codex-quota:import-active',
  activate: 'codex-quota:activate',
  login: 'codex-quota:login',
  startQuotaWindow: 'codex-quota:start-quota-window',
  invokeResetCredits: 'codex-quota:invoke-reset-credits',
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
  invokeResetCredits: (account) => invoke(CHANNEL.invokeResetCredits, account),
  logout: (account) => invoke(CHANNEL.logout, account),
  deleteStoredAuth: (account) => invoke(CHANNEL.deleteStoredAuth, account),
  removeAccount: (account) => invoke(CHANNEL.removeAccount, account)
}

const shell: CodexQuotaShell = {
  getPreferences: () => invoke(SHELL_CHANNEL.getPreferences),
  setPreferences: (changes: Partial<ShellPreferences>) =>
    invoke(SHELL_CHANNEL.setPreferences, changes),
  setTrayStatus: (status: TrayStatus) => invoke(SHELL_CHANNEL.setTrayStatus, status),
  hidePanel: () => invoke(SHELL_CHANNEL.hidePanel),
  openMain: (account?: string) => invoke(SHELL_CHANNEL.openMain, account),
  onChanged: (listener) => subscribe(SHELL_CHANNEL.changed, () => listener()),
  onRoute: (listener) =>
    subscribe(SHELL_CHANNEL.route, (account) => listener((account as string | null) ?? null)),
  onPreferences: (listener) =>
    subscribe(SHELL_CHANNEL.preferences, (preferences) =>
      listener(preferences as ShellPreferences)
    )
}

/**
 * Subscriptions hand back their own removal rather than exposing `off` across
 * the bridge, so a renderer cannot detach a listener that is not its own.
 */
function subscribe(channel: string, listener: (...args: unknown[]) => void): () => void {
  const wrapped = (_event: unknown, ...args: unknown[]): void => listener(...args)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

contextBridge.exposeInMainWorld('codexQuota', service)
contextBridge.exposeInMainWorld('codexQuotaShell', shell)
contextBridge.exposeInMainWorld('codexQuotaDesktop', {
  platform: process.platform
})
