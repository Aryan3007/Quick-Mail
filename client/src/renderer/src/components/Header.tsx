import { useState, useEffect, useRef } from 'react'
import { useUiStore } from '../store/ui'
import { useThread, useInbox, useFolder } from '../hooks/useInbox'
import { useThemeStore } from '../store/theme'
import { formatRelativeTime } from '../lib/format'

const SUGGESTIONS = [
  'ready to join startup as fullstack',
  'flight ticket booking details',
  'unread newsletters',
  'critical bug fixes',
]

export function Header({ onToggleSidebar, sidebarOpen }: { onToggleSidebar?: () => void; sidebarOpen?: boolean }) {
  const aiPanelOpen = useUiStore((s) => s.aiPanelOpen)
  const toggleAiPanel = useUiStore((s) => s.toggleAiPanel)
  const openSettings = useUiStore((s) => s.openSettings)
  const selectedThreadId = useUiStore((s) => s.selectedThreadId)
  const selectThread = useUiStore((s) => s.selectThread)
  const openCompose = useUiStore((s) => s.openCompose)
  const activeFolder = useUiStore((s) => s.activeFolder)

  const searchQuery = useUiStore((s) => s.searchQuery)
  const setSearchQuery = useUiStore((s) => s.setSearchQuery)

  const preference = useThemeStore((s) => s.preference)
  const setPreference = useThemeStore((s) => s.setPreference)

  const { data: threadData } = useThread(selectedThreadId)

  const inboxData = useInbox()
  const folderData = useFolder(activeFolder)
  const { threads } = activeFolder === 'inbox' ? inboxData : folderData

  const searchResults = useUiStore((s) => s.searchResults)

  const displayedResults = searchResults !== null
    ? searchResults
    : searchQuery.trim()
      ? threads.filter((t) =>
        [t.from, t.fromEmail, t.subject, t.preview].some((f) =>
          (f || '').toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
      : []

  const [searchOpen, setSearchOpen] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const setSearchResults = useUiStore((s) => s.setSearchResults)
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null)

  const performSearch = async (queryText: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    const trimmed = queryText.trim()
    if (!trimmed) {
      setSearchResults(null)
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    try {
      const [mailRes, aiRes] = await Promise.all([
        window.quikmail.invoke('mail:search', { query: trimmed, folder: activeFolder }),
        window.quikmail.invoke('ai:search', { query: trimmed }).catch(() => ({ ok: false, data: [] }))
      ])

      const mailThreads: any[] = mailRes.ok && Array.isArray(mailRes.data) ? mailRes.data : []
      const aiThreads: any[] = aiRes.ok && Array.isArray(aiRes.data) ? aiRes.data : []

      // Merge threads uniquely by ID
      const mergedMap = new Map<string, any>()
      for (const t of mailThreads) {
        mergedMap.set(t.id, t)
      }
      for (const t of aiThreads) {
        if (!mergedMap.has(t.id)) {
          mergedMap.set(t.id, t)
        }
      }

      const mergedResults = Array.from(mergedMap.values())
      // Sort merged results by date to keep the premium listing standard!
      mergedResults.sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1))

      setSearchResults(mergedResults)
    } catch (err) {
      console.error('Search error:', err)
    } finally {
      setIsSearching(false)
    }
  }

  const handleInputChange = (val: string) => {
    setSearchQuery(val)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (!val.trim()) {
      setSearchResults(null)
      setIsSearching(false)
      return
    }

    searchTimerRef.current = setTimeout(() => {
      performSearch(val)
    }, 350)
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      performSearch(searchQuery)
    }
  }

  const handleSuggestionClick = (suggestion: string) => {
    setSearchQuery(suggestion)
    performSearch(suggestion)
  }

  const handleClear = () => {
    setSearchQuery('')
    setSearchResults(null)
    setIsSearching(false)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
  }

  const handleResultClick = (threadId: string) => {
    selectThread(threadId)
    setSearchOpen(false)
  }

  // Clear search timer on close or unmount
  useEffect(() => {
    if (!searchOpen) {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [searchOpen])

  // Listen to Escape to close search modal
  useEffect(() => {
    if (!searchOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setSearchOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [searchOpen])

  // Listen to Cmd+F / Ctrl+F globally to open search modal
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const modifier = isMac ? e.metaKey : e.ctrlKey
      if (modifier && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  // Listen to Cmd+N / Ctrl+N globally to open composer
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const modifier = isMac ? e.metaKey : e.ctrlKey
      if (modifier && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        openCompose(null)
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [openCompose])

  const handleToggleTheme = () => {
    const nextTheme = preference === 'dark' ? 'light' : 'dark'
    setPreference(nextTheme)
  }

  return (
    <>
      <header className="flex h-12 shrink-0 items-center justify-between bg-surface px-4">
        {/* Left: sidebar toggle + breadcrumb */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Sidebar Toggle Button */}
          <button
            type="button"
            onClick={onToggleSidebar}
            title={sidebarOpen ? 'Hide folders' : 'Show folders'}
            className={`flex h-7 w-7 items-center justify-center rounded text-fg-muted transition hover:bg-surface-muted hover:text-fg ${sidebarOpen ? 'bg-accent-soft text-accent' : ''
              }`}
          >
            <MenuIcon />
          </button>

          <div className="h-4 w-px bg-border/60 mx-0.5" />

          {/* Active folder title */}
          <span className="text-[13px] font-semibold text-fg">
            {activeFolder.charAt(0).toUpperCase() + activeFolder.slice(1)}
          </span>
        </div>

        {/* Empty space filler to keep controls right-aligned */}
        <div className="flex-1" />

        {/* Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Search Icon Button */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            title="Search conceptually (Cmd+F)"
            className="flex h-9 w-9 items-center justify-center rounded-full  text-fg-muted transition hover:bg-surface-muted hover:text-fg hover:scale-95"
          >
            <SearchIcon />
          </button>

          {/* Theme Switcher Button */}
          <button
            type="button"
            onClick={handleToggleTheme}
            title={`Switch to ${preference === 'dark' ? 'light' : 'dark'} mode`}
            className="flex h-9 w-9 items-center justify-center rounded-full text-fg-muted transition hover:bg-surface-muted hover:text-fg hover:scale-95"
          >
            {preference === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>

          {/* Settings Button */}
          <button
            type="button"
            aria-label="Settings"
            title="Settings"
            onClick={() => openSettings('account')}
            className="flex h-9 w-9 items-center justify-center rounded-full  text-fg-muted transition hover:bg-surface-muted hover:text-fg hover:scale-95"
          >
            <SettingsIcon />
          </button>


        </div>
      </header>

      {/* Centered Top Search Modal Overlay */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/35 pt-24 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="w-[550px] overflow-hidden rounded-[20px] border border-border bg-surface p-4 flex flex-col gap-3.5 animate-in slide-in-from-top-5 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top row: Search icon/spinner, Input, Clear, Close */}
            <div className="flex items-center gap-3">
              <span className="text-fg-subtle shrink-0">
                {isSearching ? <LoadingSpinner /> : <SearchIcon />}
              </span>
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Search inbox conceptually (e.g. 'flight ticket')..."
                className="w-full bg-transparent text-sm font-medium text-fg focus:outline-none placeholder:text-fg-subtle"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-[10px] bg-border/40 hover:bg-border px-2.5 py-1 rounded-full text-fg-muted hover:text-fg font-medium transition"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="text-[10.5px] border border-border bg-surface hover:bg-surface-muted px-2.5 py-1 rounded-md text-fg-muted hover:text-fg  transition"
              >
                Close
              </button>
            </div>

            {/* Bottom Panel: Suggestions when empty, search results when typing */}
            {!searchQuery.trim() ? (
              <div className="border-t border-border/40 pt-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px]  text-fg-subtle uppercase tracking-wider">
                    Try Conceptual Searches
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleSuggestionClick(s)}
                      className="text-[11px] bg-surface-muted hover:bg-border/60 border border-border/40 px-2.5 py-1 rounded-full text-fg-muted hover:text-fg transition text-left"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="border-t border-border/40 pt-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px]  text-fg-subtle uppercase tracking-wider">
                    {searchResults !== null ? 'Conceptual AI & Server Search matches' : 'Local keyword matches'}
                  </span>
                  <span className="text-[10px] text-fg-subtle font-medium">
                    {isSearching ? (
                      <span className="text-accent animate-pulse font-semibold">
                        Scanning inbox...
                      </span>
                    ) : (
                      `${displayedResults.length} ${displayedResults.length === 1 ? 'match' : 'matches'}`
                    )}
                  </span>
                </div>

                {displayedResults.length === 0 ? (
                  <div className="py-8 text-center text-xs text-fg-subtle select-none">
                    {isSearching ? 'Analyzing semantic concepts...' : 'No matching emails found'}
                  </div>
                ) : (
                  <div className="flex flex-col max-h-[300px] overflow-y-auto divide-y divide-border/30 pr-1">
                    {displayedResults.map((thread) => {
                      const fromName = thread.from || thread.fromEmail || '(unknown sender)'
                      return (
                        <button
                          key={thread.id}
                          type="button"
                          onClick={() => handleResultClick(thread.id)}
                          className="w-full text-left py-2 px-2.5 hover:bg-surface-muted transition duration-150 flex flex-col gap-0.5 rounded-md mt-1 first:mt-0"
                        >
                          <div className="flex justify-between items-baseline gap-2">
                            <span className="font-semibold text-xs text-fg truncate">{fromName}</span>
                            <span className="text-[9.5px] text-fg-subtle shrink-0">{formatRelativeTime(thread.receivedAt)}</span>
                          </div>
                          <span className="text-[11.5px] font-medium text-fg-muted truncate">{thread.subject || '(no subject)'}</span>
                          <span className="text-[10.5px] text-fg-subtle truncate">{thread.preview}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function BreadcrumbChip({ label, active = false, onClick }: { label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'max-w-[200px] truncate rounded-md px-2.5 py-1.5 text-[13px] font-semibold transition ' +
        (active ? 'bg-accent-soft text-accent' : 'text-fg-muted hover:bg-surface-muted hover:text-fg')
      }
    >
      {label}
    </button>
  )
}

function Sep() {
  return <span className="text-fg-subtle">›</span>
}

function PenIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11.5 2.5 13.5 4.5 5 13H3v-2L11.5 2.5Z" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="7" cy="7" r="4.5" />
      <path d="m13.5 13.5-3-3" />
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1.5 9 6l4.5 1L9 8l-1 4.5L7 8 2.5 7 7 6 8 1.5Z" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
      <path d="M13.4 8.7a6.6 6.6 0 0 0 0-1.4l1.3-1a.3.3 0 0 0-.1-.4l-1.2-2.1a.3.3 0 0 0-.4-.1l-1.5.6a6.3 6.3 0 0 0-1.2-.7L10.3 2a.3.3 0 0 0-.3-.3H6a.3.3 0 0 0-.3.3l-.2 1.6a6.3 6.3 0 0 0-1.2.7l-1.5-.6a.3.3 0 0 0-.4.1L1.2 5.9a.3.3 0 0 0 .1.4l1.3 1a6.6 6.6 0 0 0 0 1.4l-1.3 1a.3.3 0 0 0-.1.4l1.2 2.1a.3.3 0 0 0 .4.1l1.5-.6a6.3 6.3 0 0 0 1.2.7l.2 1.6c0 .2.1.3.3.3h4c.2 0 .3-.1.3-.3l.2-1.6a6.3 6.3 0 0 0 1.2-.7l1.5.6a.3.3 0 0 0 .4-.1l1.2-2.1a.3.3 0 0 0-.1-.4l-1.3-1Z" />
    </svg>
  )
}

function BrandLogoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.886a1 1 0 0 1-.951.691H2.93a1 1 0 0 0-.588 1.81l4.98 3.618a1 1 0 0 1 .363 1.118L5.773 22a1 1 0 0 0 1.54 1.118l4.98-3.618a1 1 0 0 1 1.174 0l4.98 3.618a1 1 0 0 0 1.54-1.118l-1.912-5.887a1 1 0 0 1 .363-1.118l4.98-3.618a1 1 0 0 0-.588-1.81h-6.207a1 1 0 0 1-.951-.69L12 3Z" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 9.5A6 6 0 1 1 8.5 1.5 6.2 6.2 0 0 0 14.5 9.5Z" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M8 2.5v11M2.5 8h11" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function LoadingSpinner() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="animate-spin text-accent">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" />
      <path d="M8 2a6 6 0 0 1 6 6" strokeLinecap="round" />
    </svg>
  )
}
