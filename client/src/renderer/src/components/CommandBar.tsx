import { useEffect, useRef, useState } from 'react'

import { useUiStore } from '../store/ui'
import { useThemeStore } from '../store/theme'

const COMMANDS = [
  { key: 'search', slash: '/search ', label: 'Search emails conceptually', placeholder: '/search [your conceptual query...]', desc: 'Offline semantic search' },
  { key: 'reply', slash: '/reply ', label: 'Draft reply with AI', placeholder: '/reply [Tone Preset] [your reply instructions...]', desc: 'Stream reply into composer' },
  { key: 'summarize', slash: '/summarize', label: 'Summarize active thread', placeholder: '/summarize', desc: 'Streams thread summary into AI panel' },
  { key: 'compose', slash: '/compose', label: 'Compose new message', placeholder: '/compose', desc: 'Opens a blank email composer' },
  { key: 'settings', slash: '/settings', label: 'Open settings modal', placeholder: '/settings', desc: 'Manage accounts and triage logs' },
  { key: 'theme', slash: '/theme', label: 'Toggle appearance theme', placeholder: '/theme', desc: 'Toggle light / dark / system theme' },
]

export function CommandBar() {
  const isOpen = useUiStore((s) => s.commandBarOpen)
  const setOpen = useUiStore((s) => s.setCommandBarOpen)
  const selectThread = useUiStore((s) => s.selectedThreadId)
  const openCompose = useUiStore((s) => s.openCompose)
  const openSettings = useUiStore((s) => s.openSettings)
  const setSearchResults = useUiStore((s) => s.setSearchResults)

  const preference = useThemeStore((s) => s.preference)
  const setPreference = useThemeStore((s) => s.setPreference)

  const [input, setInput] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (isOpen) {
      setInput('')
      setActiveIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  if (!isOpen) return null

  // Filter commands by input
  const filtered = COMMANDS.filter(
    (c) =>
      c.slash.startsWith(input.toLowerCase()) ||
      c.label.toLowerCase().includes(input.toLowerCase()) ||
      input.startsWith(c.slash)
  )

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((prev) => (prev + 1) % Math.max(1, filtered.length))
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length))
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered.length === 0) return

      const activeCmd = filtered[activeIndex]
      if (!activeCmd) return

      // Handle Slash execution
      await executeCommand(activeCmd.key, input.slice(activeCmd.slash.length))
    }
  }

  const executeCommand = async (key: string, args: string) => {
    setOpen(false) // Close the bar immediately

    if (key === 'compose') {
      openCompose(null)
    } else if (key === 'settings') {
      openSettings('account')
    } else if (key === 'theme') {
      const nextTheme = preference === 'dark' ? 'light' : 'dark'
      setPreference(nextTheme)
    } else if (key === 'summarize') {
      if (!selectThread) {
        alert('Please select an email thread first to summarize.')
        return
      }
      // Open AI panel and trigger summarize
      useUiStore.getState().setAiPanelOpen(true)
      // Small timeout for panel render
      setTimeout(() => {
        const aiTextarea = document.querySelector('aside[aria-label="AI Assistant"] textarea') as HTMLTextAreaElement
        if (aiTextarea) {
          aiTextarea.value = 'Summarize this thread.'
          const aiForm = aiTextarea.form
          if (aiForm) {
            const submitEvent = new Event('submit', { cancelable: true, bubbles: true })
            aiForm.dispatchEvent(submitEvent)
          }
        }
      }, 300)
    } else if (key === 'reply') {
      if (!selectThread) {
        alert('Please select an email thread first to reply.')
        return
      }

      // Tone parse (friendly/concise/formal)
      const parts = args.trim().split(' ')
      const firstWord = parts[0]?.toLowerCase()
      const isTone = ['friendly', 'concise', 'formal'].includes(firstWord || '')
      const tone = isTone ? (firstWord as any) : undefined
      const prompt = isTone ? parts.slice(1).join(' ') : args.trim()

      // Open Composer in reply mode prefilled, then trigger AI drafting!
      const { useThread } = await import('../hooks/useInbox')
      const threadData = useUiStore.getState().selectedThreadId
      if (!threadData) return

      const res = await window.quikmail.invoke('mail:get', threadData)
      if (!res.ok) return

      openCompose({
        to: res.data.thread.fromEmail,
        subject: res.data.thread.subject.startsWith('Re:') ? res.data.thread.subject : 'Re: ' + res.data.thread.subject,
        body: '',
        threadId: res.data.thread.threadId,
      })

      // Wait for Composer render, then fire RAG draft
      setTimeout(() => {
        const promptInput = document.querySelector('div[z-50="true"] input') as HTMLInputElement
        if (promptInput) {
          promptInput.value = prompt || 'Draft a quick reply.'
          // Find draft button and click
          const draftBtn = promptInput.nextElementSibling as HTMLButtonElement
          if (draftBtn) draftBtn.click()
        }
      }, 300)

    } else if (key === 'search') {
      const queryText = args.trim()
      if (!queryText) return

      try {
        const res = await window.quikmail.invoke('ai:search', { query: queryText })
        if (res.ok) {
          setSearchResults(res.data)
        } else {
          alert(`Search failed: ${res.error.message}`)
        }
      } catch (err) {
        console.error(err)
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 pt-28 backdrop-blur-[6px] animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-modal="true"
        className="w-[600px] overflow-hidden rounded-[24px] border border-border/60 bg-surface/75 backdrop-blur-2xl animate-in slide-in-from-top-5 duration-300"
      >
        {/* Input area */}
        <div className="relative flex items-center border-b border-border/40 px-5 py-4">
          <span className="text-accent shrink-0 mr-3 text-sm  tracking-tight bg-accent-soft px-2 py-0.5 rounded-md">⌘K</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command (/search, /reply, /summarize) or select an action..."
            className="w-full bg-transparent text-[13px] font-medium text-fg focus:outline-none placeholder:text-fg-subtle"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-[9px] rounded-full border border-border bg-surface px-2.5 py-0.5 text-fg-subtle  transition hover:text-fg"
          >
            ESC
          </button>
        </div>

        {/* Suggestions list */}
        <div className="max-h-80 overflow-y-auto p-2 bg-surface-sunken/30">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-fg-subtle">
              No matching actions or commands found
            </div>
          ) : (
            <ul className="space-y-1">
              {filtered.map((c, idx) => {
                const active = idx === activeIndex
                return (
                  <li key={c.key}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => executeCommand(c.key, input.slice(c.slash.length))}
                      className={
                        'flex w-full items-center justify-between rounded-[14px] px-4 py-3 text-left transition duration-150 ' +
                        (active
                          ? 'bg-fg text-surface-elevated scale-[1.01]'
                          : 'text-fg hover:bg-surface/60')
                      }
                    >
                      <div className="min-w-0 flex-1">
                        <div className={`text-xs  ${active ? 'text-surface-elevated' : 'text-fg'}`}>
                          {c.label}
                        </div>
                        <div className={`mt-0.5 text-[10px] font-medium ${active ? 'opacity-80' : 'text-fg-subtle'}`}>
                          {c.desc}
                        </div>
                      </div>
                      <span className={`text-[11px] font-mono shrink-0 px-2 py-0.5 rounded-full border  transition-all ${active
                          ? 'bg-surface-elevated/20 border-surface-elevated/30 text-surface-elevated'
                          : 'bg-surface border-border/80 text-fg-subtle'
                        }`}>
                        {c.slash}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
