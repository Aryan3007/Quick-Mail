import { BrowserWindow, nativeTheme } from 'electron'

import type { EffectiveTheme, ThemePreference, ThemeState } from '../shared/ipc'
import { readSettings, writeSettings } from './settings'

function resolveEffective(pref: ThemePreference): EffectiveTheme {
  if (pref === 'system') return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  return pref
}

export function getThemeState(): ThemeState {
  const pref = readSettings().themePreference
  return { preference: pref, effective: resolveEffective(pref) }
}

export function setThemePreference(pref: ThemePreference): ThemeState {
  writeSettings({ themePreference: pref })
  nativeTheme.themeSource = pref
  const state = getThemeState()
  broadcast(state)
  return state
}

function broadcast(state: ThemeState): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('theme:changed', state)
  }
}

export function initTheme(): void {
  nativeTheme.themeSource = readSettings().themePreference
  nativeTheme.on('updated', () => {
    if (readSettings().themePreference === 'system') {
      broadcast(getThemeState())
    }
  })
}
