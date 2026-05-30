import { create } from 'zustand'
import type { AuthStatus } from '../../../shared/ipc'

type AuthState = {
  status: AuthStatus | null
  loading: boolean
  error: string | null
  signingIn: boolean
  
  refresh: () => Promise<void>
  signInWithGoogle: () => Promise<void>
  disconnectGoogle: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => {
  const initialConnected = localStorage.getItem('quikmail:connected') === 'true'

  return {
    status: null,
    loading: !initialConnected ? false : true,
    error: null,
    signingIn: false,

    refresh: async () => {
      const res = await window.quikmail.invoke('auth:status')
      if (res.ok) {
        const connected = res.data.google.connected
        localStorage.setItem('quikmail:connected', connected ? 'true' : 'false')
        set({ status: res.data, loading: false, error: null })
      } else {
        set({ loading: false, error: res.error.message })
      }
    },

    signInWithGoogle: async () => {
      set({ signingIn: true, error: null })
      const res = await window.quikmail.invoke('auth:google:start')
      if (!res.ok) {
        set({ signingIn: false, error: res.error.message })
        return
      }
      await get().refresh()
      set({ signingIn: false })
    },

    disconnectGoogle: async () => {
      await window.quikmail.invoke('auth:google:disconnect')
      await get().refresh()
    }
  }
})
