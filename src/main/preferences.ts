/**
 * Shell preferences.
 *
 * Only `menuBarOnly` is ours to remember. Whether the app launches at login is
 * recorded by macOS itself, and asking the system beats keeping a second copy
 * that can disagree with the login items list the user can edit behind our
 * back.
 */

import { app } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { ShellPreferences } from '../shared/shell'
import { writeFileAtomic } from './codex-quota/atomic'

const FILE = 'desktop-app.json'

export function preferencesPath(storageRoot: string): string {
  return join(storageRoot, FILE)
}

export async function readPreferences(storageRoot: string): Promise<ShellPreferences> {
  return {
    startAtLogin: app.getLoginItemSettings().openAtLogin,
    menuBarOnly: await readMenuBarOnly(storageRoot)
  }
}

export async function writePreferences(
  storageRoot: string,
  changes: Partial<ShellPreferences>
): Promise<ShellPreferences> {
  if (changes.startAtLogin !== undefined) {
    app.setLoginItemSettings({
      openAtLogin: changes.startAtLogin,
      // Starting into a visible window would make logging in feel like the app
      // demanding attention; the menu bar icon is the whole point.
      openAsHidden: true
    })
  }

  if (changes.menuBarOnly !== undefined) {
    await writeFileAtomic(
      preferencesPath(storageRoot),
      `${JSON.stringify({ menuBarOnly: changes.menuBarOnly }, null, 2)}\n`
    )
  }

  return readPreferences(storageRoot)
}

async function readMenuBarOnly(storageRoot: string): Promise<boolean> {
  try {
    const parsed: unknown = JSON.parse(await readFile(preferencesPath(storageRoot), 'utf8'))
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as { menuBarOnly?: unknown }).menuBarOnly === true
    )
  } catch {
    // No file, unreadable file, or nonsense in it: the Dock icon stays, which
    // is the state a first-time user can find their way out of.
    return false
  }
}
