/**
 * The desktop shell around the workbench: the menu bar icon, the panel it
 * opens, and how the app behaves once its window is closed.
 *
 * Kept separate from `codex-quota.ts` because none of it is about accounts.
 * The renderer sees this contract the same way it sees the service: present
 * under Electron, absent in the browser preview.
 */

export interface ShellPreferences {
  /** Launch when you log in, straight into the menu bar. */
  startAtLogin: boolean
  /** Hide the Dock icon, leaving only the menu bar. */
  menuBarOnly: boolean
  /**
   * Re-read usage on a timer, and start a quota window that never started so
   * its week begins counting now. Off means the app only ever reads when asked.
   */
  autoSync: boolean
}

export interface TrayStatus {
  /** Short text beside the icon. Empty means the icon stands alone. */
  title: string
  tooltip: string
}

export interface CodexQuotaShell {
  getPreferences(): Promise<ShellPreferences>
  setPreferences(changes: Partial<ShellPreferences>): Promise<ShellPreferences>
  setTrayStatus(status: TrayStatus): Promise<void>
  /** Called by the panel once it has finished with a click. */
  hidePanel(): Promise<void>
  /** Raises the main window, optionally landing on one account's page. */
  openMain(account?: string): Promise<void>
  /** Fires after any window completes an action that changed state on disk. */
  onChanged(listener: () => void): () => void
  /** Fires when another surface asks this window to show an account. */
  onRoute(listener: (account: string | null) => void): () => void
  /**
   * Fires when preferences change anywhere. The switch appears in the window,
   * in the menu, and governs the panel's timer, so no surface may keep its own
   * copy of the answer.
   */
  onPreferences(listener: (preferences: ShellPreferences) => void): () => void
}
