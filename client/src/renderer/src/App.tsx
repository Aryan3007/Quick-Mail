import { MailLayout } from './components/MailLayout'
import { SignIn } from './components/SignIn'
import { useAuth } from './hooks/useAuth'
import { useThemeBootstrap } from './hooks/useTheme'

export default function App() {
  useThemeBootstrap()
  const { status, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface text-fg-subtle">
        Loading…
      </div>
    )
  }

  if (status?.google.connected !== true) {
    return <SignIn />
  }

  return <MailLayout />
}
