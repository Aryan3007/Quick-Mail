import { create } from 'zustand'

export type SettingsSection = 'account' | 'appearance' | 'ai' | 'triage'
export type MailFolder = 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'starred' | 'archive'

export type PendingSend = {
  id: string
  type: 'direct' | 'draft_send'
  data: {
    to: string
    subject: string
    body: string
    threadId?: string
    draftId?: string
  }
  timeoutId: any
  intervalId: any
  progress: number // countdown progress from 100 to 0
  onCommit: () => void
}

type UiStore = {
  aiPanelOpen: boolean
  selectedThreadId: string | null
  settingsOpen: boolean
  settingsSection: SettingsSection
  composeOpen: boolean
  composeData: { to: string; subject: string; body: string; threadId?: string } | null
  pendingSend: PendingSend | null
  searchQuery: string
  commandBarOpen: boolean
  searchResults: any[] | null
  folderSidebarOpen: boolean
  activeFolder: MailFolder

  toggleAiPanel: () => void
  setAiPanelOpen: (open: boolean) => void
  selectThread: (id: string | null) => void
  openSettings: (section?: SettingsSection) => void
  closeSettings: () => void
  setSettingsSection: (section: SettingsSection) => void
  setSearchQuery: (query: string) => void
  setCommandBarOpen: (open: boolean) => void
  setSearchResults: (results: any[] | null) => void
  toggleFolderSidebar: () => void
  setActiveFolder: (folder: MailFolder) => void
  
  openCompose: (data: { to: string; subject: string; body: string; threadId?: string } | null) => void
  closeCompose: () => void
  
  queueSend: (
    type: 'direct' | 'draft_send',
    data: PendingSend['data'],
    onCommit: () => void,
  ) => void
  cancelSend: () => void
  commitSendImmediately: () => void
}

export const useUiStore = create<UiStore>((set, get) => ({
  aiPanelOpen: true,
  selectedThreadId: null,
  settingsOpen: false,
  settingsSection: 'account',
  composeOpen: false,
  composeData: null,
  pendingSend: null,
  searchQuery: '',
  commandBarOpen: false,
  searchResults: null,
  folderSidebarOpen: false,
  activeFolder: 'inbox',

  toggleAiPanel: () => set((s) => ({ aiPanelOpen: !s.aiPanelOpen })),
  setAiPanelOpen: (open) => set({ aiPanelOpen: open }),
  selectThread: (id) => set({ selectedThreadId: id }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setCommandBarOpen: (open) => set({ commandBarOpen: open }),
  setSearchResults: (results) => set({ searchResults: results }),
  toggleFolderSidebar: () => set((s) => ({ folderSidebarOpen: !s.folderSidebarOpen })),
  setActiveFolder: (folder) => set({ activeFolder: folder, selectedThreadId: null }),
  openSettings: (section) =>
    set((s) => ({ settingsOpen: true, settingsSection: section ?? s.settingsSection })),
  closeSettings: () => set({ settingsOpen: false }),
  setSettingsSection: (section) => set({ settingsSection: section }),

  openCompose: (data) => set({ composeOpen: true, composeData: data }),
  closeCompose: () => set({ composeOpen: false, composeData: null }),

  queueSend: (type, data, onCommit) => {
    // If there is already a pending send, commit it immediately first!
    const existing = get().pendingSend
    if (existing) {
      existing.onCommit()
      clearTimeout(existing.timeoutId)
      clearInterval(existing.intervalId)
    }

    const duration = 5000 // 5 seconds
    const intervalTick = 50 // every 50ms
    let elapsed = 0

    const intervalId = setInterval(() => {
      elapsed += intervalTick
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100)
      set((s) => {
        if (!s.pendingSend) return {}
        return { pendingSend: { ...s.pendingSend, progress: remaining } }
      })
    }, intervalTick)

    const timeoutId = setTimeout(() => {
      const current = get().pendingSend
      if (current) {
        clearInterval(current.intervalId)
        current.onCommit()
      }
      set({ pendingSend: null })
    }, duration)

    set({
      pendingSend: {
        id: `send_${Date.now()}`,
        type,
        data,
        timeoutId,
        intervalId,
        progress: 100,
        onCommit,
      },
      composeOpen: false, // Close composer when sending (so they can undo from the screen bottom toast)
    })
  },

  cancelSend: () => {
    const current = get().pendingSend
    if (!current) return

    clearTimeout(current.timeoutId)
    clearInterval(current.intervalId)

    // Reopen composer with draft if it was cancelled
    set({
      pendingSend: null,
      composeOpen: true,
      composeData: {
        to: current.data.to,
        subject: current.data.subject,
        body: current.data.body,
        threadId: current.data.threadId,
      },
    })
  },

  commitSendImmediately: () => {
    const current = get().pendingSend
    if (!current) return

    clearTimeout(current.timeoutId)
    clearInterval(current.intervalId)
    current.onCommit()
    set({ pendingSend: null })
  },
}))
