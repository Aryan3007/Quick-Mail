import { create } from 'zustand'

import type { EffectiveTheme, ThemePreference, ThemeState } from '../../../shared/ipc'

type ThemeStore = {
  preference: ThemePreference
  effective: EffectiveTheme
  hydrated: boolean
  setFromMain: (state: ThemeState) => void
  setPreference: (pref: ThemePreference) => Promise<void>
  hydrate: () => Promise<void>
}

export const useThemeStore = create<ThemeStore>((set) => ({
  preference: 'system',
  effective: 'dark',
  hydrated: false,
  setFromMain: (state) => set({ preference: state.preference, effective: state.effective }),
  setPreference: async (pref) => {
    const res = await window.quikmail.invoke('theme:set', pref)
    if (res.ok) set({ preference: res.data.preference, effective: res.data.effective })
  },
  hydrate: async () => {
    const res = await window.quikmail.invoke('theme:get')
    if (res.ok) set({ preference: res.data.preference, effective: res.data.effective, hydrated: true })
    else set({ hydrated: true })
  },
}))
