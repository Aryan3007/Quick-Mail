import { useEffect } from 'react'

import { useUiStore } from '../store/ui'

export function useSettingsShortcut(): void {
  const openSettings = useUiStore((s) => s.openSettings)
  const closeSettings = useUiStore((s) => s.closeSettings)
  const settingsOpen = useUiStore((s) => s.settingsOpen)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === ',') {
        e.preventDefault()
        if (settingsOpen) closeSettings()
        else openSettings()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openSettings, closeSettings, settingsOpen])
}
