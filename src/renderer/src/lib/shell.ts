/**
 * The menu bar side of the bridge, with the same fallback shape as the service:
 * present under Electron, stubbed in the browser preview so the panel can be
 * worked on at `http://localhost:5273/panel.html` without a menu bar to talk to.
 */

import type { CodexQuotaShell, ShellPreferences } from '../../../shared/shell'

function stub(): CodexQuotaShell {
  let preferences: ShellPreferences = { startAtLogin: false, menuBarOnly: false, autoSync: true }
  let listeners: Array<(next: ShellPreferences) => void> = []

  return {
    getPreferences: async () => preferences,
    setPreferences: async (changes) => {
      preferences = { ...preferences, ...changes }
      for (const listener of listeners) listener(preferences)
      return preferences
    },
    setTrayStatus: async () => undefined,
    hidePanel: async () => undefined,
    openMain: async () => undefined,
    onChanged: () => () => undefined,
    onRoute: () => () => undefined,
    onPreferences: (listener) => {
      listeners = [...listeners, listener]
      return () => {
        listeners = listeners.filter((entry) => entry !== listener)
      }
    }
  }
}

export const shell: CodexQuotaShell = window.codexQuotaShell ?? stub()

/** False in the browser preview, where shell controls would do nothing. */
export const hasShell = window.codexQuotaShell !== undefined
