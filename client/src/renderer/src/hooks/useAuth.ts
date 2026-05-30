import { useEffect } from 'react'
import { useAuthStore } from '../store/auth'

export function useAuth() {
  const store = useAuthStore()

  useEffect(() => {
    void store.refresh()
  }, [])

  return store
}
