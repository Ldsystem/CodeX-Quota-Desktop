/**
 * Shell preferences.
 *
 * Whether the app launches at login is recorded by macOS itself, and asking the
 * system beats keeping a second copy that can disagree with the login items
 * list the user can edit behind our back. The rest is ours to remember, and
 * lives in one small file beside the registry.
 */

import { app } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { ShellPreferences } from '../shared/shell'
import { writeFileAtomic } from './codex-quota/atomic'

const FILE = 'desktop-app.json'

/** The half of the preferences this app stores for itself. */
interface StoredPreferences {
  menuBarOnly: boolean
  autoSync: boolean
  windowStartModel: string
}

/**
 * Automatic sync is on by default. It is the behaviour that makes the menu bar
 * figure worth looking at, and the window it starts would otherwise sit unused
 * until the account is next picked up, pushing its reset further away.
 */
const DEFAULTS: StoredPreferences = { menuBarOnly: false, autoSync: true, windowStartModel: '' }

export function preferencesPath(storageRoot: string): string {
  return join(storageRoot, FILE)
}

export async function readPreferences(
  storageRoot: string,
  fallbackWindowStartModel = ''
): Promise<ShellPreferences> {
  return {
    startAtLogin: app.getLoginItemSettings().openAtLogin,
    ...(await readStored(storageRoot, fallbackWindowStartModel))
  }
}

export async function writePreferences(
  storageRoot: string,
  changes: Partial<ShellPreferences>,
  fallbackWindowStartModel = ''
): Promise<ShellPreferences> {
  if (changes.startAtLogin !== undefined) {
    app.setLoginItemSettings({
      openAtLogin: changes.startAtLogin,
      // Starting into a visible window would make logging in feel like the app
      // demanding attention; the menu bar icon is the whole point.
      openAsHidden: true
    })
  }

  if (
    changes.menuBarOnly !== undefined ||
    changes.autoSync !== undefined ||
    changes.windowStartModel !== undefined
  ) {
    const stored = await readStored(storageRoot, fallbackWindowStartModel)
    const next: StoredPreferences = {
      menuBarOnly: changes.menuBarOnly ?? stored.menuBarOnly,
      autoSync: changes.autoSync ?? stored.autoSync,
      windowStartModel: changes.windowStartModel?.trim() ?? stored.windowStartModel
    }
    await writeFileAtomic(preferencesPath(storageRoot), `${JSON.stringify(next, null, 2)}\n`)
  }

  return readPreferences(storageRoot, fallbackWindowStartModel)
}

async function readStored(
  storageRoot: string,
  fallbackWindowStartModel: string
): Promise<StoredPreferences> {
  try {
    const parsed: unknown = JSON.parse(await readFile(preferencesPath(storageRoot), 'utf8'))
    if (typeof parsed !== 'object' || parsed === null) {
      return { ...DEFAULTS, windowStartModel: fallbackWindowStartModel }
    }

    const record = parsed as Partial<Record<keyof StoredPreferences, unknown>>
    return {
      menuBarOnly: boolish(record.menuBarOnly, DEFAULTS.menuBarOnly),
      autoSync: boolish(record.autoSync, DEFAULTS.autoSync),
      windowStartModel: textish(record.windowStartModel, fallbackWindowStartModel)
    }
  } catch {
    // No file, unreadable file, or nonsense in it: the defaults are the state a
    // first-time user can find their way out of.
    return { ...DEFAULTS, windowStartModel: fallbackWindowStartModel }
  }
}

function boolish(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function textish(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.trim() : fallback
}
