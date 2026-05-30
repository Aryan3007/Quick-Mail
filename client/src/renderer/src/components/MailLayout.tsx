import { useEffect } from 'react'
import { useSettingsShortcut } from '../hooks/useSettingsShortcut'
import { AiPanel } from './AiPanel'
import { FolderSidebar } from './FolderSidebar'
import { Header } from './Header'
import { SettingsModal } from './SettingsModal'
import { ThreadList } from './ThreadList'
import { ThreadReader } from './ThreadReader'
import { useUiStore } from '../store/ui'
import { Composer } from './Composer'
import { CommandBar } from './CommandBar'

export function MailLayout() {
  useSettingsShortcut()
  const selectedThreadId = useUiStore((s) => s.selectedThreadId)
  const aiPanelOpen = useUiStore((s) => s.aiPanelOpen)
  const toggleAiPanel = useUiStore((s) => s.toggleAiPanel)
  const folderSidebarOpen = useUiStore((s) => s.folderSidebarOpen)
  const toggleFolderSidebar = useUiStore((s) => s.toggleFolderSidebar)

  const commandBarOpen = useUiStore((s) => s.commandBarOpen)
  const setCommandBarOpen = useUiStore((s) => s.setCommandBarOpen)

  // Listen to Cmd+K (more commands), Cmd+L (toggle AI Assistant), Cmd+B (toggle sidebar)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const modifier = isMac ? e.metaKey : e.ctrlKey

      if (modifier && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandBarOpen(!commandBarOpen)
      }
      if (modifier && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        toggleAiPanel()
      }
      if (modifier && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        toggleFolderSidebar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [commandBarOpen, setCommandBarOpen, toggleAiPanel, toggleFolderSidebar])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface text-fg relative">
      {/* Folder sidebar (animated toggle transition) */}
      <FolderSidebar />

      {/* Left division container: takes up remaining space after sidebar and AI panel */}
      <section
        className={`flex flex-col overflow-hidden bg-surface transition-all duration-300 flex-1 ${aiPanelOpen
            ? 'border-r border-border'
            : ''
          }`}
      >
        {/* Header inside the 2/3 column */}
        <Header onToggleSidebar={toggleFolderSidebar} sidebarOpen={folderSidebarOpen} />

        {/* Content area: Thread List or Thread Reader */}
        <div className="flex-1 overflow-hidden">
          {selectedThreadId ? <ThreadReader /> : <ThreadList />}
        </div>

        {/* Footer inside the 2/3 column */}
        <footer className="flex h-8 shrink-0 items-center justify-between border-t border-border bg-surface px-6 text-[11px] text-fg-subtle font-medium">
          <div className="flex items-center gap-1">
            <span className=" text-fg-muted">⌘B</span>
            <span className="text-fg-subtle">folders</span>
            <span className="opacity-40 mx-1.5">·</span>
            <span className=" text-fg-muted">⌘L</span>
            <span className="text-fg-subtle">AI</span>
            <span className="opacity-40 mx-1.5">·</span>
            <span className=" text-fg-muted">R</span>
            <span className="text-fg-subtle">reply</span>
            <span className="opacity-40 mx-1.5">·</span>
            <span className=" text-fg-muted">⌘K</span>
            <span className="text-fg-subtle">commands</span>
          </div>
        </footer>
      </section>

      {/* Right division container: 1/3 of the screen width (animated slide transition) */}
      <section
        className={`shrink-0 flex flex-col overflow-hidden bg-surface transition-all duration-300 ease-in-out ${
          aiPanelOpen
            ? 'w-1/3 opacity-100 border-l border-border'
            : 'w-0 opacity-0 pointer-events-none border-l-transparent'
        }`}
      >
        <AiPanel />
      </section>

      <Composer />
      <UndoToast />
      <CommandBar />
      <SettingsModal />
    </div>
  )
}

function UndoToast() {
  const pendingSend = useUiStore((s) => s.pendingSend)
  const cancelSend = useUiStore((s) => s.cancelSend)
  const commitSendImmediately = useUiStore((s) => s.commitSendImmediately)

  if (!pendingSend) return null

  return (
    <div className="fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-full border border-border bg-surface-elevated/75 backdrop-blur-2xl px-5 py-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="relative h-5 w-5 shrink-0 rounded-full border border-border">
        {/* Visual countdown progress circle */}
        <svg className="absolute inset-0 h-full w-full -rotate-90">
          <circle
            cx="10"
            cy="10"
            r="8"
            className="stroke-border/40"
            strokeWidth="2.5"
            fill="transparent"
          />
          <circle
            cx="10"
            cy="10"
            r="8"
            className="stroke-accent transition-all duration-75"
            strokeWidth="2.5"
            fill="transparent"
            strokeDasharray={2 * Math.PI * 8}
            strokeDashoffset={2 * Math.PI * 8 * (1 - pendingSend.progress / 100)}
          />
        </svg>
      </div>
      <span className="text-[12.5px] font-medium text-fg">
        Sending email to <span className="font-semibold text-accent">{pendingSend.data.to}</span>...
      </span>
      <div className="flex items-center gap-2 border-l border-border pl-4">
        <button
          type="button"
          onClick={cancelSend}
          className="rounded-full bg-accent-soft px-3.5 py-1 text-xs font-semibold text-accent transition hover:opacity-80"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={commitSendImmediately}
          className="text-xs font-medium text-fg-muted hover:text-fg transition"
        >
          Send Now
        </button>
      </div>
    </div>
  )
}
