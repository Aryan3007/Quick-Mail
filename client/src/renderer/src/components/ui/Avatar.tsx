type AvatarProps = {
  name?: string
  email?: string
  src?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE_CLASS: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'h-5 w-5 text-[9px]',
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-8 w-8 text-[11px]',
  lg: 'h-10 w-10 text-sm',
}

const TINTS = [
  'bg-tag-coral text-white',
  'bg-tag-sage text-white',
  'bg-tag-lavender text-white',
  'bg-tag-sand text-fg',
  'bg-accent text-white',
]

function initials(name?: string, email?: string): string {
  const source = (name || email || '?').trim()
  if (!source) return '?'
  const parts = source.replace(/[^a-zA-Z@\s.]/g, ' ').split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

function tintFor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return TINTS[h % TINTS.length]
}

export function Avatar({ name, email, src, size = 'md', className = '' }: AvatarProps) {
  const sizeClass = SIZE_CLASS[size]
  if (src) {
    return (
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        className={`${sizeClass} shrink-0 rounded-full object-cover ${className}`}
      />
    )
  }
  const seed = (email || name || '?').toLowerCase()
  return (
    <span
      aria-hidden
      className={`${sizeClass} ${tintFor(seed)} inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-tight ${className}`}
    >
      {initials(name, email)}
    </span>
  )
}
