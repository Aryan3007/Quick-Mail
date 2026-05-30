import { useEffect } from 'react'

import { useThemeStore } from '../store/theme'

export function useThemeBootstrap(): void {
  const hydrate = useThemeStore((s) => s.hydrate)
  const setFromMain = useThemeStore((s) => s.setFromMain)
  const effective = useThemeStore((s) => s.effective)
  const hydrated = useThemeStore((s) => s.hydrated)

  useEffect(() => {
    void hydrate()
    const off = window.quikmail.on('theme:changed', (state) => setFromMain(state))
    return off
  }, [hydrate, setFromMain])

  useEffect(() => {
    if (!hydrated) return
    document.documentElement.dataset.theme = effective
    document.documentElement.style.colorScheme = effective
  }, [effective, hydrated])
}
