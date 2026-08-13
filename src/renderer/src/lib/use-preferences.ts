/**
 * Shell preferences as the windows see them.
 *
 * Read once on mount, then only ever updated by the main process broadcast, so
 * the switch in the header, the checkbox in the menu, and the panel's timer are
 * three views of one answer rather than three copies of it.
 */

import { useCallback, useEffect, useState } from 'react'

import type { ShellPreferences } from '../../../shared/shell'
import { shell } from './shell'

const INITIAL: ShellPreferences = { startAtLogin: false, menuBarOnly: false, autoSync: true }

export interface PreferencesState {
  preferences: ShellPreferences
  update: (changes: Partial<ShellPreferences>) => void
}

export function usePreferences(): PreferencesState {
  const [preferences, setPreferences] = useState<ShellPreferences>(INITIAL)

  useEffect(() => {
    let live = true
    void shell.getPreferences().then((next) => {
      if (live) setPreferences(next)
    })
    const unsubscribe = shell.onPreferences(setPreferences)
    return () => {
      live = false
      unsubscribe()
    }
  }, [])

  const update = useCallback((changes: Partial<ShellPreferences>) => {
    // The broadcast that follows is what actually moves the switch, so a
    // rejected write leaves the control showing the truth rather than the wish.
    void shell.setPreferences(changes).then(setPreferences)
  }, [])

  return { preferences, update }
}
