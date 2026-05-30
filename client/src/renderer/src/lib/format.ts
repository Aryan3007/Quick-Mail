export function formatRelativeTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (sameDay) return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const diffMs = now.getTime() - date.getTime()
  const oneDay = 1000 * 60 * 60 * 24
  if (diffMs < oneDay * 2) return 'Yesterday'
  if (diffMs < oneDay * 7) return date.toLocaleDateString(undefined, { weekday: 'short' })
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
