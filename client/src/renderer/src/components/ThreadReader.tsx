import { useCallback, useEffect, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import { useQueryClient } from '@tanstack/react-query'
import { useThread } from '../hooks/useInbox'
import { useUiStore } from '../store/ui'
import { useThemeStore } from '../store/theme'
import { Avatar } from './ui/Avatar'
import type { CalendarEventDetails } from '../../../shared/ai'

export function ThreadReader() {
  const selectedThreadId = useUiStore((s) => s.selectedThreadId)
  const { data, isLoading, error } = useThread(selectedThreadId)
  const openCompose = useUiStore((s) => s.openCompose)
  const queryClient = useQueryClient()
  const selectThread = useUiStore((s) => s.selectThread)

  const [eventDetails, setEventDetails] = useState<CalendarEventDetails | null>(null)
  const [detecting, setDetecting] = useState(false)

  useEffect(() => {
    if (!selectedThreadId || !data?.body || !data?.thread) {
      setEventDetails(null)
      return
    }
    setEventDetails(null)
    setDetecting(true)
    window.quikmail.invoke('ai:calendar:detect', {
      body: data.body,
      subject: data.thread.subject,
    })
      .then((res) => {
        if (res.ok && res.data.detected) {
          setEventDetails(res.data)
        } else {
          setEventDetails(null)
        }
      })
      .catch((err) => {
        console.error(err)
        setEventDetails(null)
      })
      .finally(() => {
        setDetecting(false)
      })
  }, [selectedThreadId, data?.body, data?.thread?.subject])

  if (!selectedThreadId) {
    return (
      <EmptyReader title="No conversation selected" subtitle="Pick a thread on the left to read." />
    )
  }

  if (isLoading) {
    return <EmptyReader title="Loading…" subtitle="Fetching the latest message." />
  }

  if (error || !data) {
    return (
      <EmptyReader
        title="Couldn't open this thread"
        subtitle={error instanceof Error ? error.message : 'Try selecting it again.'}
      />
    )
  }

  const handleToggleStar = async () => {
    if (!data?.thread) return
    const isStarred = data.thread.starred
    const channel = isStarred ? 'mail:unstar' : 'mail:star'
    try {
      const res = await window.quikmail.invoke(channel, { id: data.thread.id })
      if (res.ok) {
        await queryClient.invalidateQueries({ queryKey: ['inbox'] })
        await queryClient.invalidateQueries({ queryKey: ['folder'] })
        await queryClient.invalidateQueries({ queryKey: ['thread', selectedThreadId] })
      } else {
        alert(`Failed to toggle star: ${res.error.message}`)
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleArchive = async () => {
    if (!data?.thread) return
    try {
      const res = await window.quikmail.invoke('mail:archive', { id: data.thread.id })
      if (res.ok) {
        selectThread(null)
        await queryClient.invalidateQueries({ queryKey: ['inbox'] })
        await queryClient.invalidateQueries({ queryKey: ['folder'] })
      } else {
        alert(`Failed to archive: ${res.error.message}`)
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleTrash = async () => {
    if (!data?.thread) return
    try {
      const res = await window.quikmail.invoke('mail:trash', { id: data.thread.id })
      if (res.ok) {
        selectThread(null)
        await queryClient.invalidateQueries({ queryKey: ['inbox'] })
        await queryClient.invalidateQueries({ queryKey: ['folder'] })
      } else {
        alert(`Failed to move to trash: ${res.error.message}`)
      }
    } catch (err) {
      console.error(err)
    }
  }

  const { thread, body, htmlBody } = data

  const handleAddGoogleCalendar = () => {
    if (!eventDetails || !eventDetails.rawIsoStart || !eventDetails.rawIsoEnd) return
    const title = encodeURIComponent(eventDetails.title || thread.subject)
    const start = eventDetails.rawIsoStart.replace(/[-:]/g, '').split('.')[0]
    const end = eventDetails.rawIsoEnd.replace(/[-:]/g, '').split('.')[0]
    const desc = encodeURIComponent(eventDetails.description || '')
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${desc}`
    window.open(url, '_blank')
  }

  const handleExportIcs = async () => {
    if (!eventDetails || !eventDetails.rawIsoStart || !eventDetails.rawIsoEnd) return
    await window.quikmail.invoke('ai:calendar:ics_export', {
      title: eventDetails.title || thread.subject,
      startIso: eventDetails.rawIsoStart,
      endIso: eventDetails.rawIsoEnd,
      description: eventDetails.description || '',
    })
  }

  const handleReplyAvailability = () => {
    if (!eventDetails) return
    openCompose({
      to: thread.fromEmail,
      subject: thread.subject.startsWith('Re:') ? thread.subject : 'Re: ' + thread.subject,
      body: `Hi ${thread.from.split(' ')[0] || ''},\n\nThanks for reaching out! Confirmed, I've added the meeting to my calendar:\n\n📅 ${eventDetails.title}\nWhen: ${eventDetails.date} at ${eventDetails.time} (${eventDetails.duration})\n\nLooking forward to speaking then!\n\nBest regards,`,
      threadId: thread.threadId,
    })
  }
  return (
    <div className="flex h-full flex-col bg-surface relative">
      {/* Top back navigation bar - Left aligned actions */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-8 py-3 bg-surface">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => useUiStore.getState().selectThread(null)}
            className="flex h-7 w-7 items-center justify-center rounded text-fg-muted hover:bg-surface-muted transition hover:text-fg"
            title="Back to inbox"
          >
            <ChevronLeftIcon />
          </button>

          <div className="h-4 w-px bg-border mx-1" />

          {/* Screenshot-like pagination indicators */}
          <span className="text-[11.5px] font-semibold text-fg-subtle">
            1 of 46
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button 
            type="button"
            onClick={handleToggleStar}
            title={thread.starred ? 'Unstar thread' : 'Star thread'} 
            className="text-fg-subtle hover:text-fg p-1.5 transition hover:scale-105 active:scale-95"
          >
            <StarIcon filled={thread.starred} />
          </button>
          <button 
            type="button"
            onClick={handleArchive}
            title="Archive conversation" 
            className="text-fg-subtle hover:text-fg p-1.5 transition hover:scale-105 active:scale-95"
          >
            <ArchiveIcon />
          </button>
          <button 
            type="button"
            onClick={handleTrash}
            title="Move to Trash" 
            className="text-fg-subtle hover:text-fg p-1.5 transition hover:scale-105 active:scale-95"
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {/* Main scrolling reader content pane */}
      <div className="flex-1 overflow-y-auto px-8 py-8 space-y-6">
        {/* Subject Header */}
        <h1 className="text-[20px]  text-fg tracking-tight leading-tight">
          {thread.subject || '(no subject)'}
        </h1>

        {/* Left-Aligned Sender Block matching Reference image */}
        <div className="flex items-start justify-between gap-4 pt-2">
          <div className="flex items-center gap-3">
            <Avatar
              name={thread.from}
              email={thread.fromEmail}
              size="md"
              className="h-9 w-9 text-xs "
            />
            <div>
              <div className="text-[13px]  text-fg leading-tight">
                {thread.from || thread.fromEmail}
              </div>
              <div className="text-[11.5px] text-fg-subtle mt-0.5">
                To: me <span className="text-[10px] opacity-60">▼</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 text-xs text-fg-subtle font-medium">
            <button
              onClick={() => openCompose({
                to: thread.fromEmail,
                subject: thread.subject.startsWith('Re:') ? thread.subject : 'Re: ' + thread.subject,
                body: '',
                threadId: thread.threadId,
              })}
              title="Reply"
              className="text-fg-subtle hover:text-fg transition p-1"
            >
              <ReplyIcon />
            </button>
            <span>{new Date(thread.receivedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}, {new Date(thread.receivedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>

        {/* AI Calendar & Appointment Detection Widget */}
        {detecting && (
          <div className="border-l-[3px] border-l-fg-subtle/40 bg-surface-elevated rounded-r border border-border p-4.5 mb-2 flex items-center gap-3 animate-pulse">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-fg-subtle">
              <svg className="animate-spin h-5 w-5 text-accent" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
            <div>
              <h4 className="text-[13px] font-semibold text-fg tracking-tight">AI Scheduling Scan</h4>
              <p className="mt-0.5 text-[11.5px] text-fg-subtle">Analyzing message for meeting slots, invitations, or scheduling dates...</p>
            </div>
          </div>
        )}

        {eventDetails && (
          <div className="border-l-[3px] border-l-accent bg-surface-elevated rounded-r border border-border p-4.5 mb-2 flex flex-col gap-4.5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent mt-0.5">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-[13.5px] font-semibold text-fg tracking-tight">{eventDetails.title || 'Meeting Proposed'}</h4>
                  <span className="rounded bg-accent/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent">
                    Calendar Event
                  </span>
                </div>
                <p className="mt-1.5 text-[12px] font-medium text-fg-muted flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="flex items-center gap-1 whitespace-nowrap">📅 {eventDetails.date}</span>
                  <span className="opacity-45">•</span>
                  <span className="flex items-center gap-1 whitespace-nowrap">⏰ {eventDetails.time}</span>
                  {eventDetails.duration && (
                    <>
                      <span className="opacity-45">•</span>
                      <span className="flex items-center gap-1 whitespace-nowrap">⏱️ {eventDetails.duration}</span>
                    </>
                  )}
                  {eventDetails.organizer && (
                    <>
                      <span className="opacity-45">•</span>
                      <span className="flex items-center gap-1 whitespace-nowrap">👤 {eventDetails.organizer}</span>
                    </>
                  )}
                </p>
                {eventDetails.description && (
                  <p className="mt-2 text-[11.5px] text-fg-subtle italic max-w-2xl leading-normal">
                    "{eventDetails.description}"
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-border/40">
              <button
                type="button"
                onClick={handleReplyAvailability}
                className="bg-accent text-white hover:bg-accent/90 transition text-xs font-semibold px-3.5 py-2 rounded flex items-center gap-1.5 cursor-pointer hover:scale-[0.98] active:scale-[0.96]"
              >
                <ReplyIcon />
                <span>Confirm & Reply</span>
              </button>
              <button
                type="button"
                onClick={handleAddGoogleCalendar}
                className="border border-border bg-surface hover:bg-surface-muted transition text-xs font-medium px-3.5 py-2 rounded flex items-center gap-1.5 text-fg-muted cursor-pointer hover:text-fg hover:scale-[0.98] active:scale-[0.96]"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                <span>Add to Google</span>
              </button>
              <button
                type="button"
                onClick={handleExportIcs}
                className="border border-border bg-surface hover:bg-surface-muted transition text-xs font-medium px-3.5 py-2 rounded flex items-center gap-1.5 text-fg-muted cursor-pointer hover:text-fg hover:scale-[0.98] active:scale-[0.96]"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Export .ics</span>
              </button>
            </div>
          </div>
        )}

        {/* Email content message body */}
        <div className="py-4 text-[13.5px] leading-relaxed text-fg">
          {htmlBody ? (
            <SandboxedHtml html={htmlBody} />
          ) : (
            <article className="max-w-none text-[13.5px] leading-relaxed text-fg-muted whitespace-pre-wrap font-sans">
              {body || <span className="text-fg-subtle italic">(empty message body)</span>}
            </article>
          )}
        </div>

        {/* Bottom clean action buttons grid matching screenshots exactly */}
        <div className="flex items-center gap-3 pt-6 border-t border-border/40">
          <button
            type="button"
            onClick={() => openCompose({
              to: thread.fromEmail,
              subject: thread.subject.startsWith('Re:') ? thread.subject : 'Re: ' + thread.subject,
              body: '',
              threadId: thread.threadId,
            })}
            className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-5 py-2 text-xs  text-fg-muted transition hover:bg-surface-muted hover:text-fg hover:scale-95"
          >
            <ReplyIcon />
            <span>Reply</span>
          </button>

          <button
            type="button"
            onClick={() => openCompose({
              to: '',
              subject: 'Fwd: ' + thread.subject,
              body: `\n\n---------- Forwarded message ---------\nFrom: ${thread.from} <${thread.fromEmail}>\nDate: ${new Date(thread.receivedAt).toLocaleString()}\nSubject: ${thread.subject}\n\n${body}`,
              threadId: thread.threadId,
            })}
            className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-5 py-2 text-xs  text-fg-muted transition hover:bg-surface-muted hover:text-fg hover:scale-95"
          >
            <ForwardIcon />
            <span>Forward</span>
          </button>

          <button
            type="button"
            onClick={() => {
              // Open AI Panel and prompt it to draft a response
              useUiStore.getState().setAiPanelOpen(true)
              setTimeout(() => {
                const aiTextarea = document.querySelector('aside[aria-label="AI Assistant"] textarea') as HTMLTextAreaElement
                if (aiTextarea) {
                  aiTextarea.value = 'Draft a quick reply to this email.'
                  const aiForm = aiTextarea.form
                  if (aiForm) {
                    const submitEvent = new Event('submit', { cancelable: true, bubbles: true })
                    aiForm.dispatchEvent(submitEvent)
                  }
                }
              }, 200)
            }}
            className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-5 py-2 text-xs  text-fg-muted transition hover:bg-surface-muted hover:text-fg hover:scale-95"
          >
            <SparkleIcon />
            <span>AI Draft</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function RecipientPill({ label }: { label: string }) {
  return (
    <span className="rounded-md bg-surface-muted px-1.5 py-0.5 text-[10.5px] font-medium text-fg-muted">
      {label}
    </span>
  )
}

function ReaderIconButton({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-md text-fg-muted transition hover:bg-surface-muted hover:text-fg"
    >
      {children}
    </button>
  )
}

function EmptyReader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-surface-elevated">
      <div className="text-center">
        <p className="font-serif-display text-lg text-fg">{title}</p>
        <p className="mt-1 text-sm text-fg-subtle">{subtitle}</p>
      </div>
    </div>
  )
}

function SandboxedHtml({ html }: { html: string }) {
  const effective = useThemeStore((s) => s.effective)
  const isDark = effective === 'dark'
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const writeToIframe = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const clean = DOMPurify.sanitize(html, {
      WHOLE_DOCUMENT: true,
      ALLOW_UNKNOWN_PROTOCOLS: false,
      FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'textarea', 'button'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
      ADD_ATTR: ['target'],
    })

    const doc = iframe.contentDocument
    if (!doc) return

    doc.open()
    doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      font-size: 14.5px;
      line-height: 1.6;
      background-color: ${isDark ? '#eeeeee' : '#ffffff'};
      color: #1a1a1a;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    img, picture, video {
      max-width: 100%;
      height: auto;
      ${isDark ? 'filter: invert(1) hue-rotate(180deg);' : ''}
    }
    a { color: #2563eb; }
    pre, code { white-space: pre-wrap; max-width: 100%; overflow-x: auto; }
    table { max-width: 100%; border-collapse: collapse; }
  </style>
</head>
<body style="background-color: ${isDark ? '#eeeeee' : '#ffffff'}; color: #1a1a1a;">${clean}</body>
</html>`)
    doc.close()

    // open links in external browser
    doc.querySelectorAll('a').forEach((a) => {
      a.setAttribute('target', '_blank')
      a.setAttribute('rel', 'noopener noreferrer')
    })

    // auto-resize iframe to content height
    const resize = () => {
      if (iframe && doc.body) {
        iframe.style.height = `${doc.body.scrollHeight}px`
      }
    }
    resize()

    const imgs = doc.querySelectorAll('img')
    if (imgs.length > 0) {
      let loaded = 0
      imgs.forEach((img) => {
        if (img.complete) { loaded++; return }
        img.addEventListener('load', () => { loaded++; if (loaded >= imgs.length) resize() })
        img.addEventListener('error', () => { loaded++; if (loaded >= imgs.length) resize() })
      })
      if (loaded >= imgs.length) resize()
    }
  }, [html, isDark])

  useEffect(() => {
    writeToIframe()
  }, [writeToIframe])

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-same-origin"
      title="Email content"
      className="w-full border-0 transition-all duration-200"
      style={{
        minHeight: 200,
        backgroundColor: isDark ? '#eeeeee' : '#ffffff',
        filter: isDark ? 'invert(1) hue-rotate(180deg)' : 'none'
      }}
    />
  )
}

function ReplyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4 2 8l4 4M2 8h7a4 4 0 0 1 4 4v1" />
    </svg>
  )
}
function ForwardIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m10 4 4 4-4 4M14 8H7a4 4 0 0 0-4 4v1" />
    </svg>
  )
}
function ArchiveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4h12v2.5H2zM3 6.5v6A1.5 1.5 0 0 0 4.5 14h7A1.5 1.5 0 0 0 13 12.5v-6M6 9h4" />
    </svg>
  )
}

function ChevronLeftIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 3L5 8l5 5" />
    </svg>
  )
}
function StarIcon({ filled }: { filled?: boolean }) {
  return (
    <svg 
      width="14" 
      height="14" 
      viewBox="0 0 16 16" 
      fill={filled ? '#eab308' : 'none'} 
      stroke={filled ? '#eab308' : 'currentColor'} 
      strokeWidth="1.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="m8 2 1.8 3.7 4 .6-2.9 2.8.7 4L8 11.2 4.4 13.1l.7-4L2.2 6.3l4-.6L8 2Z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h10M5 6v7a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V6M6 4h4M7 2h2" />
    </svg>
  )
}

function PaperclipIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  )
}

function TonePresetIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
      <path d="M12 2a10 10 0 0 1 10 10h-2a8 8 0 0 0-8-8V2z" />
      <path d="M21.18 8H16V2.82A10 10 0 0 1 21.18 8z" />
    </svg>
  )
}

function SendArrowIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12 14-7-7 14-2-7-5-2Z" />
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
