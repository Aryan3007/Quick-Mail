import { useEffect, useRef, useState } from 'react'

import type { MailThread } from '../../../shared/mail'
import type { TriageCategory } from '../../../shared/ai'
import { formatRelativeTime } from '../lib/format'
import { useInbox, useFolder } from '../hooks/useInbox'
import { useUiStore } from '../store/ui'
import { Avatar } from './ui/Avatar'

export function ThreadList() {
  const query = useUiStore((s) => s.searchQuery)
  const selectedThreadId = useUiStore((s) => s.selectedThreadId)
  const selectThread = useUiStore((s) => s.selectThread)
  const activeFolder = useUiStore((s) => s.activeFolder)
  const setSearchQuery = useUiStore((s) => s.setSearchQuery)
  const setSearchResults = useUiStore((s) => s.setSearchResults)

  // Category filter state
  const [categories, setCategories] = useState<TriageCategory[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)

  const inboxData = useInbox()
  const folderData = useFolder(activeFolder)

  const {
    threads,
    isLoading,
    apiError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = activeFolder === 'inbox' ? inboxData : folderData

  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  // Load categories
  useEffect(() => {
    window.quikmail.invoke('ai:categories:get').then((res) => {
      if (res.ok) setCategories(res.data.categories)
    })
  }, [])

  // Infinite Scroll Trigger
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchNextPage()
        }
      },
      { threshold: 0.1 }
    )
    if (loadMoreRef.current) observer.observe(loadMoreRef.current)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const searchResults = useUiStore((s) => s.searchResults)
  const filtered = searchResults !== null
    ? searchResults
    : query
      ? threads.filter((t) =>
        [t.from, t.fromEmail, t.subject, t.preview].some((f) =>
          (f || '').toLowerCase().includes(query.toLowerCase())
        )
      )
      : threads

  // Filter based on selected category pill
  const activeCategory = selectedCategoryId ? categories.find(c => c.id === selectedCategoryId) : null
  const finalFiltered = activeCategory
    ? filtered.filter((t) => t.category === activeCategory.name)
    : filtered

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Horizontally scrollable premium HSL Category Filter Pills */}
      {!isLoading && !apiError && categories.length > 0 && (
        <div className="flex items-center gap-2 border-b border-border px-6 py-2.5 overflow-x-auto scrollbar-none shrink-0 bg-surface select-none">
          <button
            type="button"
            onClick={() => setSelectedCategoryId(null)}
            className={`rounded-full px-3 py-1 text-xs font-semibold tracking-tight transition-all duration-150 active:scale-95 shrink-0 ${
              selectedCategoryId === null
                ? 'bg-fg text-surface'
                : 'bg-surface-muted text-fg-muted hover:bg-border/60 hover:text-fg'
            }`}
          >
            All Mails
          </button>
          {categories.map((cat) => {
            const active = selectedCategoryId === cat.id
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategoryId(cat.id)}
                className="rounded-full px-3.5 py-1 text-xs font-semibold tracking-tight transition-all duration-150 active:scale-95 shrink-0 cursor-pointer border"
                style={{
                  backgroundColor: active ? cat.color : 'var(--color-surface-muted)',
                  color: active ? '#ffffff' : 'var(--color-fg-muted)',
                  borderColor: active ? 'transparent' : 'var(--color-border)',
                }}
              >
                {cat.name}
              </button>
            )
          })}
        </div>
      )}

      {query.trim() && (
        <div className="flex items-center justify-between border-b border-border bg-surface-muted px-4 py-2.5 text-xs select-none">
          <div className="flex items-center gap-2 text-fg-muted min-w-0">
            <span className=" text-fg shrink-0">Search:</span>
            <span className="italic truncate font-medium text-fg">"{query}"</span>
            {searchResults !== null ? (
              <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10px]  text-accent">
                Conceptual & Server Search match
              </span>
            ) : (
              <span className="shrink-0 rounded-full bg-border/40 px-2 py-0.5 text-[10px]  text-fg-muted">
                Local keyword filter
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('')
              setSearchResults(null)
            }}
            className="text-fg-muted hover:text-accent font-semibold transition shrink-0 ml-3 hover:underline text-[11px]"
          >
            Clear
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-xs text-fg-subtle">
          Loading {activeFolder}…
        </div>
      ) : apiError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-fg-muted">
          <p className="text-xs">{apiError.message}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded border border-border bg-surface px-3 py-1 text-xs font-semibold"
          >
            Retry
          </button>
        </div>
      ) : finalFiltered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-xs text-fg-subtle">
          {query ? 'No matching messages' : selectedCategoryId ? 'No emails classified under this category' : `${activeFolder.charAt(0).toUpperCase() + activeFolder.slice(1)} is empty`}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <ol className="divide-y divide-border">
            {finalFiltered.map((thread) => (
              <ThreadRow
                key={thread.id}
                thread={thread}
                selected={thread.id === selectedThreadId}
                onSelect={() => selectThread(thread.id)}
              />
            ))}
          </ol>
          <div className="flex flex-col items-center justify-center px-4 py-6">
            {isFetchingNextPage ? (
              <span className="text-xs text-fg-subtle animate-pulse">Loading more…</span>
            ) : hasNextPage ? (
              <span className="text-[10px] text-fg-subtle">Scroll to load more</span>
            ) : (
              <span className="text-[10px] text-fg-subtle">All messages loaded</span>
            )}
            <div ref={loadMoreRef} className="h-1 w-full" />
          </div>
        </div>
      )}
    </div>
  )
}

function ThreadRow({
  thread,
  selected,
  onSelect,
}: {
  thread: MailThread
  selected: boolean
  onSelect: () => void
}) {
  const fromName = thread.from || thread.fromEmail || '(unknown sender)'

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={
          'group relative flex w-full items-center gap-4 px-6 py-3.5 text-left transition-colors duration-150 ' +
          (selected
            ? 'bg-surface-muted/90'
            : 'hover:bg-surface-muted/40')
        }
      >
        {/* Leftmost selection/read/unread dot visual indicator */}
        <div className="flex w-3 shrink-0 items-center justify-center select-none">
          {thread.unread ? (
            <span className="h-2 w-2 rounded-full bg-accent" />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-border-strong opacity-40" />
          )}
        </div>

        {/* Sender Area */}
        <div
          className={
            'w-40 shrink-0 truncate text-[13px] tracking-tight ' +
            (thread.unread ? ' text-fg font-semibold' : 'font-medium text-fg-muted')
          }
        >
          {fromName}
        </div>

        {/* Subject & Preview in single flexline row to maximize information density */}
        <div className="flex min-w-0 flex-1 items-baseline gap-2 truncate text-[13.5px]">
          <span
            className={
              'truncate shrink-0 max-w-[55%] ' +
              (thread.unread ? ' text-fg font-semibold' : 'font-semibold text-fg')
            }
          >
            {thread.subject || '(no subject)'}
          </span>
          <span className="truncate text-fg-subtle text-xs font-normal">
            — {thread.preview}
          </span>
        </div>

        {/* Dynamic Category Pill Badge */}
        {thread.category && (
          <span
            className="rounded px-2 py-0.5 text-[9.5px] font-semibold text-white tracking-tight uppercase select-none shrink-0"
            style={{ backgroundColor: thread.categoryColor || '#10b981' }}
          >
            {thread.category}
          </span>
        )}

        {/* Gmail Labels (amber colored tags) */}
        {thread.labels && thread.labels.length > 0 && (
          <div className="flex items-center gap-1.5 shrink-0 select-none">
            {thread.labels
              .filter(l => !['UNREAD', 'INBOX'].includes(l))
              .slice(0, 1)
              .map((label) => {
                return (
                  <span
                    key={label}
                    className="rounded bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-[9.5px]  tracking-tight capitalize"
                  >
                    {label.toLowerCase()}
                  </span>
                )
              })}
          </div>
        )}

        {/* Timestamp */}
        <div className="w-16 shrink-0 text-right text-[11.5px] text-fg-subtle font-medium tabular-nums select-none">
          {formatRelativeTime(thread.receivedAt)}
        </div>
      </button>
    </li>
  )
}
