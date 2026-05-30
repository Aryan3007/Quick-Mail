import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { ThemePreference } from '../shared/ipc'

type Settings = {
  themePreference: ThemePreference
}

const DEFAULTS: Settings = {
  themePreference: 'system',
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

let cache: Settings | null = null

export function readSettings(): Settings {
  if (cache) return cache
  const path = settingsPath()
  if (!existsSync(path)) {
    cache = { ...DEFAULTS }
    return cache
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<Settings>
    cache = { ...DEFAULTS, ...raw }
    return cache
  } catch {
    cache = { ...DEFAULTS }
    return cache
  }
}

export function writeSettings(patch: Partial<Settings>): Settings {
  const next = { ...readSettings(), ...patch }
  cache = next
  writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf8')
  return next
}
