import { useUiStore, type MailFolder } from '../store/ui'
import { useAuth } from '../hooks/useAuth'
import { Avatar } from './ui/Avatar'

type FolderEntry = {
  id: MailFolder
  label: string
  icon: React.ReactNode
}

const FOLDERS: FolderEntry[] = [
  {
    id: 'inbox',
    label: 'Inbox',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 9.5V12a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 14 12V9.5M2 9.5l1.6-5.2A1.5 1.5 0 0 1 5 3h6a1.5 1.5 0 0 1 1.4 1.3L14 9.5M2 9.5h3l1 1.5h4l1-1.5h3" />
      </svg>
    ),
  },
  {
    id: 'starred',
    label: 'Starred',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="m8 2 1.8 3.7 4 .6-2.9 2.8.7 4L8 11.2 4.4 13.1l.7-4L2.2 6.3l4-.6L8 2Z" />
      </svg>
    ),
  },
  {
    id: 'sent',
    label: 'Sent',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="m14 2-6 12-2-5-5-2 13-5Z" />
      </svg>
    ),
  },
  {
    id: 'drafts',
    label: 'Drafts',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11.5 2.5 13.5 4.5 5 13H3v-2L11.5 2.5Z" />
      </svg>
    ),
  },
  {
    id: 'archive',
    label: 'Archive',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 4h12v2.5H2zM3 6.5v6A1.5 1.5 0 0 0 4.5 14h7A1.5 1.5 0 0 0 13 12.5v-6M6 9h4" />
      </svg>
    ),
  },
  {
    id: 'spam',
    label: 'Spam',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="8" r="6" />
        <path d="M8 5v3M8 10.5v.5" />
      </svg>
    ),
  },
  {
    id: 'trash',
    label: 'Trash',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 4.5h10M5.5 4.5V3.2A1.2 1.2 0 0 1 6.7 2h2.6A1.2 1.2 0 0 1 10.5 3.2v1.3M4.5 4.5l.7 8.3A1.2 1.2 0 0 0 6.4 14h3.2a1.2 1.2 0 0 0 1.2-1.2l.7-8.3" />
      </svg>
    ),
  },
]

export function FolderSidebar() {
  const activeFolder = useUiStore((s) => s.activeFolder)
  const setActiveFolder = useUiStore((s) => s.setActiveFolder)
  const toggleFolderSidebar = useUiStore((s) => s.toggleFolderSidebar)
  const folderSidebarOpen = useUiStore((s) => s.folderSidebarOpen)
  const openCompose = useUiStore((s) => s.openCompose)
  const { status } = useAuth()

  const email = status?.google.connected ? status.google.email : 'You'
  const picture = status?.google.connected ? status.google.picture ?? null : null

  return (
    <aside
      className={`flex h-full flex-col bg-surface transition-all duration-300 ease-in-out shrink-0 overflow-hidden ${
        folderSidebarOpen ? 'w-52 border-r border-border' : 'w-0 border-r-transparent'
      }`}
    >
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <span className="text-[12px]  text-fg">Folders</span>
        <button
          type="button"
          onClick={toggleFolderSidebar}
          className="flex h-6 w-6 items-center justify-center rounded text-fg-muted hover:bg-surface-muted hover:text-fg transition"
          title="Close sidebar"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Compose button */}
      <div className="px-3 pt-3 pb-2">
        <button
          type="button"
          onClick={() => openCompose(null)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-fg px-3 py-2 text-xs font-semibold text-surface-elevated transition hover:opacity-90"
        >
          <PenIcon />
          <span>New Email</span>
        </button>
      </div>

      {/* Folder list */}
      <nav className="flex-1 overflow-y-auto px-2 py-1">
        <ul className="space-y-0.5">
          {FOLDERS.map((folder) => {
            const isActive = activeFolder === folder.id
            return (
              <li key={folder.id}>
                <button
                  type="button"
                  onClick={() => setActiveFolder(folder.id)}
                  className={
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition ' +
                    (isActive
                      ? 'bg-accent-soft text-accent font-semibold'
                      : 'text-fg-muted hover:bg-surface-muted hover:text-fg font-medium')
                  }
                >
                  <span className={isActive ? 'text-accent' : 'text-fg-subtle'}>
                    {folder.icon}
                  </span>
                  <span className="flex-1 truncate">{folder.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Account footer */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2">
          <Avatar src={picture} email={email} name={email} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-semibold text-fg">{email}</div>
            <div className="truncate text-[10px] text-fg-subtle">Google Mail</div>
          </div>
        </div>
      </div>
    </aside>
  )
}

function PenIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11.5 2.5 13.5 4.5 5 13H3v-2L11.5 2.5Z" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  )
}
