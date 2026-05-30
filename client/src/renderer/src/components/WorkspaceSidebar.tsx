import { useAuth } from '../hooks/useAuth'
import { useUiStore } from '../store/ui'
import { Avatar } from './ui/Avatar'

type FolderItem = { id: string; label: string; count?: number; icon: 'inbox' | 'star' | 'send' | 'draft' | 'archive' | 'trash' | 'label' }

const PRIMARY: FolderItem[] = [
  { id: 'inbox', label: 'Inbox', count: 12, icon: 'inbox' },
  { id: 'starred', label: 'Starred', icon: 'star' },
  { id: 'sent', label: 'Sent', icon: 'send' },
  { id: 'drafts', label: 'Drafts', count: 2, icon: 'draft' },
  { id: 'archive', label: 'Archive', icon: 'archive' },
  { id: 'trash', label: 'Trash', icon: 'trash' },
]

const LABELS: FolderItem[] = [
  { id: 'work', label: 'Work', icon: 'label' },
  { id: 'personal', label: 'Personal', icon: 'label' },
  { id: 'newsletters', label: 'Newsletters', count: 38, icon: 'label' },
  { id: 'receipts', label: 'Receipts', icon: 'label' },
]

export function WorkspaceSidebar() {
  const { status } = useAuth()
  const openSettings = useUiStore((s) => s.openSettings)
  const email = status?.google.connected ? status.google.email : 'You'
  const picture = status?.google.connected ? status.google.picture ?? null : null

  return (
    <aside className="flex h-full w-61 shrink-0 flex-col border-r border-border bg-surface">
      <div className="px-3 pt-3 pb-2">
        <button
          type="button"
          className="group flex w-full items-center gap-2.5 rounded-xl border border-border bg-surface-elevated px-2.5 py-2 text-left transition hover:border-border-strong"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-[11px] font-semibold text-white">
            Q
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-fg">QuikMail</span>
            <span className="block truncate text-[11px] text-fg-subtle">Workspace</span>
          </span>
          <ChevronUpDown />
        </button>
      </div>

      <div className="px-2.5 pb-2">
        <button
          type="button"
          onClick={() => useUiStore.getState().openCompose(null)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-fg px-3 py-2 text-xs font-medium text-surface-elevated transition hover:opacity-90"
        >
          <PenIcon />
          New message
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-1.5 pb-3">
        <SectionLabel>Mail</SectionLabel>
        <ul className="mb-3">
          {PRIMARY.map((item, i) => (
            <NavRow key={item.id} item={item} active={i === 0} />
          ))}
        </ul>

        <SectionLabel>Labels</SectionLabel>
        <ul className="mb-3">
          {LABELS.map((item) => (
            <NavRow key={item.id} item={item} />
          ))}
        </ul>

        <SectionLabel>Agents</SectionLabel>
        <ul>
          <NavRow item={{ id: 'triage', label: 'Triage', icon: 'label' }} />
          <NavRow item={{ id: 'digest', label: 'Daily digest', icon: 'label' }} />
        </ul>
      </nav>

      <div className="border-t border-border p-2">
        <button
          type="button"
          onClick={() => openSettings()}
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-surface-muted"
        >
          <Avatar src={picture} email={email} name={email} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-fg">{email}</span>
            <span className="block truncate text-[10px] text-fg-subtle">Personal</span>
          </span>
          <SettingsIcon />
        </button>
      </div>
    </aside>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">
      {children}
    </div>
  )
}

function NavRow({ item, active = false }: { item: FolderItem; active?: boolean }) {
  return (
    <li>
      <button
        type="button"
        className={
          'group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition ' +
          (active
            ? 'bg-accent-soft text-fg font-medium'
            : 'text-fg-muted hover:bg-surface-muted hover:text-fg')
        }
      >
        <FolderIcon kind={item.icon} active={active} />
        <span className="flex-1 truncate">{item.label}</span>
        {typeof item.count === 'number' ? (
          <span
            className={
              'rounded-md px-1.5 py-0.5 text-[10px] font-medium ' +
              (active ? 'bg-accent text-white' : 'bg-surface-muted text-fg-subtle')
            }
          >
            {item.count}
          </span>
        ) : null}
      </button>
    </li>
  )
}

function FolderIcon({ kind, active }: { kind: FolderItem['icon']; active: boolean }) {
  const stroke = active ? 'var(--color-accent)' : 'currentColor'
  const common = { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke, strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (kind) {
    case 'inbox':
      return (
        <svg {...common}>
          <path d="M2 9.5V12a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 14 12V9.5M2 9.5l1.6-5.2A1.5 1.5 0 0 1 5 3h6a1.5 1.5 0 0 1 1.4 1.3L14 9.5M2 9.5h3l1 1.5h4l1-1.5h3" />
        </svg>
      )
    case 'star':
      return (
        <svg {...common}>
          <path d="m8 2 1.8 3.7 4 .6-2.9 2.8.7 4L8 11.2 4.4 13.1l.7-4L2.2 6.3l4-.6L8 2Z" />
        </svg>
      )
    case 'send':
      return (
        <svg {...common}>
          <path d="m14 2-6 12-2-5-5-2 13-5Z" />
        </svg>
      )
    case 'draft':
      return (
        <svg {...common}>
          <path d="M11.5 2.5 13.5 4.5 5 13H3v-2L11.5 2.5Z" />
        </svg>
      )
    case 'archive':
      return (
        <svg {...common}>
          <path d="M2 4h12v2.5H2zM3 6.5v6A1.5 1.5 0 0 0 4.5 14h7A1.5 1.5 0 0 0 13 12.5v-6M6 9h4" />
        </svg>
      )
    case 'trash':
      return (
        <svg {...common}>
          <path d="M3 4.5h10M5.5 4.5V3.2A1.2 1.2 0 0 1 6.7 2h2.6A1.2 1.2 0 0 1 10.5 3.2v1.3M4.5 4.5l.7 8.3A1.2 1.2 0 0 0 6.4 14h3.2a1.2 1.2 0 0 0 1.2-1.2l.7-8.3" />
        </svg>
      )
    case 'label':
    default:
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="3.5" />
        </svg>
      )
  }
}

function ChevronUpDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="text-fg-subtle">
      <path d="m5 6 3-3 3 3M5 10l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PenIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11.5 2.5 13.5 4.5 5 13H3v-2L11.5 2.5Z" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="text-fg-subtle">
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.5v1.6M8 12.9v1.6M14.5 8h-1.6M3.1 8H1.5M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1M12.6 12.6l-1.1-1.1M4.5 4.5L3.4 3.4" />
    </svg>
  )
}
