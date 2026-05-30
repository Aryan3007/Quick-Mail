import { useEffect, useRef, useState } from 'react'

import { useUiStore } from '../store/ui'
import { useThread } from '../hooks/useInbox'

type ChatMessage = {
  role: 'user' | 'assistant'
  text: string
  attachments?: {
    name: string
    mimeType: string
    base64Data?: string
  }[]
  isDraft?: boolean
  draftData?: {
    to: string
    subject: string
    body: string
    emailAttachments?: {
      name: string
      mimeType: string
      base64Data: string
    }[]
  }
}

type PanelAttachment = {
  id: string
  name: string
  path: string
  size: number
  mimeType: string
  parsedText?: string
  base64Data?: string
}

const THREAD_ACTIONS = [
  { id: 'summarize', label: 'Summarize', icon: 'sparkle' as const },
  { id: 'reply', label: 'Draft Reply', icon: 'reply' as const },
  { id: 'write_email', label: 'Write Email', icon: 'pen' as const },
]

const INBOX_ACTIONS = [
  { id: 'write_email', label: 'Write Email', icon: 'pen' as const },
  { id: 'summarize_inbox', label: 'Summarize Inbox', icon: 'sparkle' as const },
]

const THREAD_SUGGESTIONS = [
  'Summarize this thread',
  'Draft a polite decline',
  'Extract action items',
  'Draft a short reply agreeing with direction',
]

const INBOX_SUGGESTIONS = [
  'Summarize my inbox',
  'Show important messages',
]

export function AiPanel() {
  const selectedThreadId = useUiStore((s) => s.selectedThreadId)
  const openCompose = useUiStore((s) => s.openCompose)
  const queueSend = useUiStore((s) => s.queueSend)
  const selectThread = useUiStore((s) => s.selectThread)

  const { data: threadData } = useThread(selectedThreadId)

  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [streamingError, setStreamingError] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<PanelAttachment[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isParsing, setIsParsing] = useState(false)

  // Inline editing state for grounded drafts
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null)
  const [editTo, setEditTo] = useState('')
  const [editSubject, setEditSubject] = useState('')
  const [editBody, setEditBody] = useState('')

  const [streamingDraft, setStreamingDraft] = useState<{
    isDraft: boolean
    to: string
    subject: string
    body: string
  } | null>(null)

  const [editAttachments, setEditAttachments] = useState<Array<{ name: string; mimeType: string; base64Data: string }>>([])

  const handleSaveInlineEdit = (idx: number) => {
    setMessages((prev) =>
      prev.map((m, i) =>
        i === idx
          ? {
              ...m,
              draftData: m.draftData
                ? {
                    ...m.draftData,
                    to: editTo,
                    subject: editSubject,
                    body: editBody,
                    emailAttachments: editAttachments
                  }
                : undefined,
              text: editBody
            }
          : m
      )
    )
    setEditingMessageIndex(null)
  }

  const handleCancelInlineEdit = (idx: number) => {
    const msg = messages[idx]
    if (
      msg &&
      msg.isDraft &&
      (!msg.draftData || (!msg.draftData.to && !msg.draftData.subject && !msg.draftData.body))
    ) {
      setMessages((prev) => prev.filter((_, i) => i !== idx))
    }
    setEditingMessageIndex(null)
  }

  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleAttachFiles = async (files: FileList) => {
    setIsParsing(true)
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      
      try {
        let text = ''
        let base64Data = ''

        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
        const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(file.name)

        if (isPdf) {
          // Read as arrayBuffer, convert to base64, and let the main process parse the PDF buffer!
          const buffer = await file.arrayBuffer()
          
          // Ultra-fast chunked conversion to base64 to handle large files flawlessly
          let binary = ''
          const bytes = new Uint8Array(buffer)
          const len = bytes.byteLength
          const chunkSize = 8192
          for (let k = 0; k < len; k += chunkSize) {
            const chunk = bytes.subarray(k, k + chunkSize)
            binary += String.fromCharCode.apply(null, chunk as any)
          }
          const base64 = btoa(binary)
          
          // Call main process to parse PDF from base64!
          const res = await window.quikmail.invoke('file:parse', {
            path: 'dummy.pdf', // dummy trigger
            name: file.name,
            mimeType: file.type,
            pdfBase64: base64
          })

          if (res.ok) {
            text = res.data.text || ''
          } else {
            alert(`Failed to parse PDF: ${res.error.message}`)
            continue
          }
        } else if (isImage) {
          // Read directly in the renderer as base64 data URL!
          base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(file)
          })
        } else {
          // Plain text/MD/JSON files: read directly in the renderer!
          text = await file.text()
        }

        const newAtt: PanelAttachment = {
          id: `att_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          name: file.name,
          path: (file as any).path || '',
          size: file.size,
          mimeType: file.type,
          parsedText: text,
          base64Data: base64Data
        }
        setAttachments((prev) => [...prev, newAtt])
      } catch (err) {
        console.error('Failed to parse file attachment:', err)
        alert(`Failed to attach file ${file.name}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    setIsParsing(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleAttachFiles(e.dataTransfer.files)
    }
  }

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await handleAttachFiles(e.target.files)
      e.target.value = ''
    }
  }

  const handlePaste = async (e: React.ClipboardEvent) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      e.preventDefault()
      await handleAttachFiles(e.clipboardData.files)
    }
  }

  // Clear chat history when active thread changes so it stays relevant
  useEffect(() => {
    setMessages([])
    setStreamText('')
    setIsStreaming(false)
    setStreamingError(null)
  }, [selectedThreadId])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamText])

  const isThreadView = selectedThreadId !== null
  const actions = isThreadView ? THREAD_ACTIONS : INBOX_ACTIONS
  const suggestions = isThreadView ? THREAD_SUGGESTIONS : INBOX_SUGGESTIONS

  const executeAiPrompt = async (promptText: string, actionOverride?: string) => {
    if (!promptText.trim() || isStreaming) return

    // 1. Add user message
    const userMsg: ChatMessage = { 
      role: 'user', 
      text: promptText,
      attachments: attachments.map(att => ({
        name: att.name,
        mimeType: att.mimeType,
        base64Data: att.base64Data
      }))
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsStreaming(true)
    setStreamingError(null)
    setStreamText('')

    const isDraftRequest =
      actionOverride === 'reply' ||
      actionOverride === 'write_email' ||
      /\b(draft|write|compose|reply|send)\b/i.test(promptText) ||
      promptText.toLowerCase().includes('email to') ||
      promptText.toLowerCase().includes('email about')

    if (isDraftRequest) {
      setStreamingDraft({
        isDraft: true,
        to: '',
        subject: '',
        body: ''
      })
    } else {
      setStreamingDraft(null)
    }

    // 1.5. Prepare attachments context and pass as parameters
    const activeAttachments = [...attachments] // copy active attachments
    setAttachments([]) // Clear from input bar instantly

    const streamId = `ai_chat_${Date.now()}`
    let accumulatedText = ''

    // Register chunk, done, and error listeners
    const cleanupChunk = window.quikmail.on('ai:stream:chunk', (payload) => {
      if (payload.streamId === streamId) {
        accumulatedText += payload.chunk
        
        let displayText = accumulatedText
        const dividerIdx = accumulatedText.indexOf('\n---')
        if (dividerIdx !== -1) {
          displayText = accumulatedText.slice(dividerIdx + 4).trim()
        } else if (accumulatedText.startsWith('Recipient-To:') || accumulatedText.startsWith('Subject:')) {
          displayText = ''
        }
        
        setStreamText(displayText)

        if (isDraftRequest) {
          let currentTo = ''
          let currentSubject = ''
          let bodyText = accumulatedText

          const dIdx = accumulatedText.indexOf('\n---')
          if (dIdx !== -1) {
            const headersSection = accumulatedText.slice(0, dIdx)
            bodyText = accumulatedText.slice(dIdx + 4).trim()
            
            const toMatch = headersSection.match(/Recipient-To:\s*(.+)/i)
            const subMatch = headersSection.match(/Subject:\s*(.+)/i)
            if (toMatch && toMatch[1].trim()) {
              currentTo = toMatch[1].trim()
            }
            if (subMatch && subMatch[1].trim()) {
              currentSubject = subMatch[1].trim()
            }
          } else if (accumulatedText.startsWith('Recipient-To:') || accumulatedText.startsWith('Subject:')) {
            bodyText = ''
            const toMatch = accumulatedText.match(/Recipient-To:\s*([^\n]*)/i)
            const subMatch = accumulatedText.match(/Subject:\s*([^\n]*)/i)
            if (toMatch && toMatch[1].trim() && !toMatch[1].includes('---')) {
              currentTo = toMatch[1].trim()
            }
            if (subMatch && subMatch[1].trim() && !subMatch[1].includes('---')) {
              currentSubject = subMatch[1].trim()
            }
          }
          setStreamingDraft({
            isDraft: true,
            to: currentTo,
            subject: currentSubject,
            body: bodyText
          })
        }
      }
    })

    const cleanupDone = window.quikmail.on('ai:stream:done', (payload) => {
      if (payload.streamId === streamId) {
        setIsStreaming(false)
        setStreamingDraft(null)
        
        // Determine if this completed response actually contains an email draft
        const hasDivider = accumulatedText.indexOf('\n---') !== -1 || accumulatedText.startsWith('Recipient-To:') || accumulatedText.startsWith('Subject:')
        const isDraft = actionOverride === 'reply' || 
          actionOverride === 'write_email' ||
          (hasDivider && (
            /\b(draft|write|compose|reply|send)\b/i.test(promptText) ||
            promptText.toLowerCase().includes('email to') ||
            promptText.toLowerCase().includes('email about')
          ))
        
        let draftTo = ''
        let draftSubject = ''
        let finalBody = accumulatedText

        const dividerIdx = accumulatedText.indexOf('\n---')
        if (dividerIdx !== -1) {
          const headersSection = accumulatedText.slice(0, dividerIdx)
          finalBody = accumulatedText.slice(dividerIdx + 4).trim()
          
          const toMatch = headersSection.match(/Recipient-To:\s*(.+)/i)
          const subMatch = headersSection.match(/Subject:\s*(.+)/i)
          
          if (toMatch && toMatch[1].trim()) {
            draftTo = toMatch[1].trim()
          }
          if (subMatch && subMatch[1].trim()) {
            draftSubject = subMatch[1].trim()
          }
        } else if (isDraft) {
          const emailMatch = promptText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)
          if (emailMatch) {
            draftTo = emailMatch[0]
          } else if (threadData && (actionOverride === 'reply' || /reply/i.test(promptText))) {
            draftTo = threadData.thread.fromEmail
          }
          
          const subjectMatch = promptText.match(/(?:about|regarding|re:|subject:?)\s+([^,\.]+)/i)
          if (subjectMatch && subjectMatch[1]) {
            draftSubject = subjectMatch[1].trim()
          } else if (threadData && (actionOverride === 'reply' || /reply/i.test(promptText))) {
            draftSubject = threadData.thread.subject.startsWith('Re:')
              ? threadData.thread.subject
              : 'Re: ' + threadData.thread.subject
          }
        }
        
        const emailAttachments = activeAttachments
          .map((att) => ({
            name: att.name,
            mimeType: att.mimeType,
            base64Data: att.base64Data || ''
          }))
          .filter((att) => att.base64Data !== '')

        const assistantMsg: ChatMessage = {
          role: 'assistant',
          text: finalBody,
          isDraft,
          draftData: isDraft ? {
            to: draftTo,
            subject: draftSubject,
            body: finalBody,
            emailAttachments: emailAttachments
          } : undefined
        }
        setMessages((prev) => [...prev, assistantMsg])
        setStreamText('')
        cleanups()
      }
    })

    const cleanupError = window.quikmail.on('ai:stream:error', (payload) => {
      if (payload.streamId === streamId) {
        setStreamingError(payload.error)
        setIsStreaming(false)
        setStreamingDraft(null)
        setStreamText('')
        cleanups()
      }
    })

    const cleanups = () => {
      cleanupChunk()
      cleanupDone()
      cleanupError()
    }

    try {
      const res = await window.quikmail.invoke('ai:stream', {
        prompt: promptText,
        threadId: selectedThreadId ?? undefined,
        streamId,
        attachments: activeAttachments.map(att => ({
          name: att.name,
          mimeType: att.mimeType,
          base64Data: att.base64Data,
          parsedText: att.parsedText
        }))
      })
      if (!res.ok) {
        setStreamingError(res.error.message)
        setIsStreaming(false)
        setStreamingDraft(null)
        cleanups()
      }
    } catch (err) {
      setStreamingError(err instanceof Error ? err.message : 'AI query failed')
      setIsStreaming(false)
      setStreamingDraft(null)
      cleanups()
    }
  }

  const handleAction = (actionId: string) => {
    if (actionId === 'write_email') {
      const blankDraft: ChatMessage = {
        role: 'assistant',
        text: '',
        isDraft: true,
        draftData: {
          to: '',
          subject: '',
          body: ''
        }
      }
      setEditingMessageIndex(messages.length)
      setEditTo('')
      setEditSubject('')
      setEditBody('')
      setMessages((prev) => [...prev, blankDraft])
    } else if (actionId === 'summarize') {
      executeAiPrompt('Summarize this thread highlighting key details and actionable next steps.', 'summarize')
    } else if (actionId === 'reply') {
      executeAiPrompt('Draft a concise, professional reply addressing the points in the email thread.', 'reply')
    } else if (actionId === 'summarize_inbox') {
      executeAiPrompt('Summarize my recent inbox messages.', 'summarize_inbox')
    }
  }

  const handleSendDraft = (idx: number, draft: NonNullable<ChatMessage['draftData']>) => {
    const messageToClear = messages[idx]
    queueSend(
      'direct',
      { to: draft.to, subject: draft.subject, body: draft.body, threadId: selectedThreadId ?? undefined },
      async () => {
        const res = await window.quikmail.invoke('mail:send:direct', {
          to: draft.to,
          subject: draft.subject,
          body: draft.body,
          threadId: selectedThreadId ?? undefined,
          attachments: draft.emailAttachments
        })
        if (!res.ok) {
          alert(`Failed to send email: ${res.error.message}`)
        } else {
          setMessages((prev) => prev.filter((m) => m !== messageToClear))
        }
      }
    )
  }

  const renderDraftCard = (m: ChatMessage, idx: number) => {
    const isEditing = editingMessageIndex === idx

    const handleFileSelection = async (files: FileList) => {
      const parsedList: Array<{ name: string; mimeType: string; base64Data: string }> = []
      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(f)
        })
        parsedList.push({
          name: f.name,
          mimeType: f.type,
          base64Data: base64
        })
      }

      if (isEditing) {
        setEditAttachments((prev) => [...prev, ...parsedList])
      } else {
        setMessages((prev) =>
          prev.map((m, i) =>
            i === idx && m.draftData
              ? {
                  ...m,
                  draftData: {
                    ...m.draftData,
                    emailAttachments: [
                      ...(m.draftData.emailAttachments || []),
                      ...parsedList
                    ]
                  }
                }
              : m
          )
        )
      }
    }

    if (isEditing) {
      return (
        <div className="mt-2.5 overflow-hidden rounded-[20px] border border-border bg-surface/95 w-full animate-in zoom-in-98 duration-200">
          <input
            type="file"
            multiple
            id={`draft-file-input-${idx}`}
            className="hidden"
            onChange={async (e) => {
              if (e.target.files && e.target.files.length > 0) {
                await handleFileSelection(e.target.files)
                e.target.value = ''
              }
            }}
          />

          <div className="flex items-center justify-between border-b border-border/40 bg-surface px-4 py-2.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-fg-subtle">Inline Composer</span>
            <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[9px] font-extrabold text-accent">Editing</span>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 border-b border-border/30 pb-1.5">
              <span className="w-14 text-[10.5px] font-bold text-fg-subtle">To:</span>
              <input
                type="email"
                value={editTo}
                onChange={(e) => setEditTo(e.target.value)}
                placeholder="recipient@example.com"
                className="flex-1 bg-transparent text-[12px] font-medium text-fg focus:outline-none placeholder:text-fg-subtle"
              />
            </div>
            <div className="flex items-center gap-2 border-b border-border/30 pb-1.5">
              <span className="w-14 text-[10.5px] font-bold text-fg-subtle">Subject:</span>
              <input
                type="text"
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                placeholder="Enter subject..."
                className="flex-1 bg-transparent text-[12px] font-medium text-fg focus:outline-none placeholder:text-fg-subtle"
              />
            </div>
            <div className="pt-1">
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                placeholder="Type your email here..."
                rows={8}
                className="w-full resize-none bg-transparent text-[12.5px] leading-relaxed text-fg focus:outline-none placeholder:text-fg-subtle font-sans"
              />
            </div>

            {/* Inline Editor Attachments row */}
            {editAttachments.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/20">
                {editAttachments.map((att, attIdx) => {
                  const isImg = att.mimeType.startsWith('image/')
                  const isPdf = att.mimeType === 'application/pdf' || att.name.toLowerCase().endsWith('.pdf')
                  return (
                    <div
                      key={attIdx}
                      className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-0.5 text-[10px] font-semibold text-fg-muted"
                    >
                      {isImg ? (
                        <img src={att.base64Data} className="h-3 w-3 rounded-full object-cover border border-border/40" alt="" />
                      ) : isPdf ? (
                        <span className="text-[11px] flex items-center">📕</span>
                      ) : (
                        <span className="text-[11px] flex items-center">📄</span>
                      )}
                      <span className="max-w-[100px] truncate text-[9.5px]">{att.name}</span>
                      <button
                        type="button"
                        onClick={() => setEditAttachments((prev) => prev.filter((_, i) => i !== attIdx))}
                        className="ml-1 text-[11px] text-fg-subtle hover:text-red-400 font-bold select-none cursor-pointer leading-none"
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-border/40 bg-surface-sunken p-2.5">
            <div className="flex items-center pl-1.5">
              <button
                type="button"
                onClick={() => document.getElementById(`draft-file-input-${idx}`)?.click()}
                className="p-1.5 rounded-full border border-border bg-surface text-fg-subtle hover:text-accent transition cursor-pointer active:scale-90 flex items-center justify-center"
                title="Attach files (PDF, Resume, Images)"
              >
                <PaperclipIcon />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleCancelInlineEdit(idx)}
                className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-[10px] font-semibold text-fg-muted transition hover:text-fg hover:scale-95 active:scale-90"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSaveInlineEdit(idx)}
                className="rounded-full bg-accent text-white px-3.5 py-1.5 text-[10px] font-semibold transition hover:opacity-90 hover:scale-95 active:scale-90"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => handleSendDraft(idx, { to: editTo, subject: editSubject, body: editBody, emailAttachments: editAttachments })}
                className="rounded-full bg-fg text-surface px-4 py-1.5 text-[10px] font-bold transition hover:opacity-90 hover:scale-95 active:scale-90"
              >
                Send Direct
              </button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="mt-2.5 overflow-hidden rounded-[20px] border border-border bg-surface/90 w-full animate-in zoom-in-95 duration-250 shadow-sm">
        <input
          type="file"
          multiple
          id={`draft-file-input-${idx}`}
          className="hidden"
          onChange={async (e) => {
            if (e.target.files && e.target.files.length > 0) {
              await handleFileSelection(e.target.files)
              e.target.value = ''
            }
          }}
        />

        <div className="flex items-center justify-between border-b border-border/40 bg-surface px-4 py-2.5">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-fg-subtle">Grounded Mail Draft</span>
        </div>
        
        {/* Sleek preview grid */}
        <div className="p-4 border-b border-border/30 bg-surface-muted/10 space-y-2">
          <div className="text-[11.5px] leading-normal text-fg-muted flex items-start gap-1">
            <span className="font-bold text-fg-subtle w-14 shrink-0">To:</span>
            <span className="truncate text-fg font-medium">{m.draftData?.to || <span className="text-fg-subtle/40 italic">No Recipient</span>}</span>
          </div>
          <div className="text-[11.5px] leading-normal text-fg-muted flex items-start gap-1">
            <span className="font-bold text-fg-subtle w-14 shrink-0">Subject:</span>
            <span className="text-fg font-medium">{m.draftData?.subject || <span className="text-fg-subtle/40 italic">No Subject</span>}</span>
          </div>
        </div>

        <div className="p-4 text-[12.5px] leading-relaxed text-fg whitespace-pre-wrap font-sans border-b border-border/30 max-h-72 overflow-y-auto">
          {m.draftData?.body}
        </div>

        {/* Attached Files List Pills in View Mode */}
        {m.draftData?.emailAttachments && m.draftData.emailAttachments.length > 0 && (
          <div className="p-4 border-b border-border/30 bg-surface-muted/5 space-y-2">
            <div className="text-[9.5px] font-extrabold uppercase tracking-wider text-fg-subtle">Attachments</div>
            <div className="flex flex-wrap gap-1.5">
              {m.draftData.emailAttachments.map((att, attIdx) => {
                const isImg = att.mimeType.startsWith('image/')
                const isPdf = att.mimeType === 'application/pdf' || att.name.toLowerCase().endsWith('.pdf')
                return (
                  <div
                    key={attIdx}
                    className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-fg-muted shadow-sm hover:border-border-strong transition"
                  >
                    {isImg ? (
                      <img src={att.base64Data} className="h-3.5 w-3.5 rounded-full object-cover border border-border/40" alt="" />
                    ) : isPdf ? (
                      <span className="text-[11px] flex items-center">📕</span>
                    ) : (
                      <span className="text-[11px] flex items-center">📄</span>
                    )}
                    <span className="max-w-[150px] truncate text-[10.5px]">{att.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setMessages((prev) =>
                          prev.map((m, i) =>
                            i === idx && m.draftData && m.draftData.emailAttachments
                              ? {
                                  ...m,
                                  draftData: {
                                    ...m.draftData,
                                    emailAttachments: m.draftData.emailAttachments.filter((_, attI) => attI !== attIdx)
                                  }
                                }
                              : m
                          )
                        )
                      }}
                      className="ml-1 text-[11px] text-fg-subtle hover:text-red-400 font-bold select-none cursor-pointer leading-none"
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between bg-surface p-2.5">
          <div className="flex items-center pl-1.5">
            <button
              type="button"
              onClick={() => document.getElementById(`draft-file-input-${idx}`)?.click()}
              className="p-1.5 rounded-full border border-border bg-surface text-fg-subtle hover:text-accent transition cursor-pointer active:scale-90 flex items-center justify-center"
              title="Attach files (PDF, Resume, Images)"
            >
              <PaperclipIcon />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEditingMessageIndex(idx)
                setEditTo(m.draftData?.to || '')
                setEditSubject(m.draftData?.subject || '')
                setEditBody(m.draftData?.body || '')
                setEditAttachments(m.draftData?.emailAttachments || [])
              }}
              className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-[10px] font-semibold text-fg-muted transition hover:text-fg hover:scale-95 active:scale-90"
            >
              Edit Inline
            </button>
            <button
              type="button"
              onClick={() => handleSendDraft(idx, m.draftData!)}
              className="rounded-full bg-fg text-surface px-4 py-1.5 text-[10px] font-bold transition hover:opacity-90 hover:scale-95 active:scale-90"
            >
              Send Direct
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <aside
      aria-label="AI Assistant"
      className="flex h-full w-full flex-col bg-surface relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPaste={handlePaste}
    >
      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-surface-elevated/85 backdrop-blur px-6 py-8 border-2 border-dashed border-accent m-3 rounded-2xl animate-in fade-in duration-200">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent mb-4 animate-bounce">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <h3 className="text-xs font-bold text-fg tracking-tight">Drop files to attach</h3>
          <p className="mt-1 text-[10.5px] text-fg-subtle text-center max-w-[180px] leading-normal">
            Attach PDFs, Markdown, images, or text documents directly as context.
          </p>
        </div>
      )}

      {/* Parsing progress indicator */}
      {isParsing && (
        <div className="absolute inset-x-0 top-0 z-40 bg-accent/15 px-4 py-2 text-center text-[10.5px] font-semibold text-accent flex items-center justify-center gap-2 animate-in slide-in-from-top duration-200">
          <svg className="animate-spin h-3.5 w-3.5 text-accent" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3.5" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Parsing and loading attachment context...</span>
        </div>
      )}

      {/* Panel Header - Clean flat header row matching Copilot */}
      <div className="flex h-12 shrink-0 items-center justify-between  px-5 bg-surface">
        <div className="flex items-center gap-2">
        <h1 className="text-[13px]  text-fg tracking-tight">
          {selectedThreadId ? 'Thread Assistant' : 'Inbox Assistant'}
        </h1>
        </div>
      </div>

      {isStreaming && (
        <div className="h-[2px] w-full bg-border/20 relative overflow-hidden shrink-0">
          <div className="absolute top-0 bottom-0 left-0 bg-accent animate-indeterminate w-1/2 rounded-full" />
        </div>
      )}

      {/* Messages / suggestions view */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {messages.length === 0 && !isStreaming ? (
          <div className="space-y-5">
            <p className="text-[12.5px] leading-relaxed text-fg-muted font-medium">
              {isThreadView
                ? 'How should we address this thread? Click a quick action or instruct me below.'
                : 'How can I help you manage your inbox today?'}
            </p>

            {/* Quick Actions Grid */}
            <div className="grid grid-cols-3 gap-2">
              {actions.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => handleAction(a.id)}
                  className="flex flex-col items-center justify-center gap-2 rounded-[14px] border border-border/80 bg-surface/50 px-2.5 py-3 text-[10.5px]  text-fg-muted transition-all duration-300 hover:border-border-strong hover:bg-surface/90 hover:scale-[1.03]"
                >
                  <span className="text-accent scale-105">
                    {a.icon === 'sparkle' ? <SparkleIcon /> : a.icon === 'reply' ? <ReplyIcon /> : <PenIcon />}
                  </span>
                  <span>{a.label}</span>
                </button>
              ))}
            </div>

            {/* Suggestions list */}
            <div className="pt-2">
              <div className="mb-2 px-1 text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-fg-subtle">
                Suggestions
              </div>
              <ul className="space-y-2">
                {suggestions.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => executeAiPrompt(s)}
                      className="flex w-full items-center gap-2.5 rounded-[12px] border border-border/80 bg-surface/40 px-3 py-2.5 text-left text-[12px] text-fg-muted font-medium transition-all duration-300 hover:bg-surface/80 hover:scale-[1.01]"
                    >
                      <ArrowIcon />
                      <span className="truncate">{s}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m, idx) => (
              <div key={idx} className="flex flex-col w-full">
                <div className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} w-full`}>
                  {m.role === 'user' ? (
                    <div className="max-w-[85%] rounded-[18px] px-4 py-2.5 text-[12.5px] leading-relaxed bg-fg text-surface-elevated">
                      <div className="flex flex-col gap-1">
                        <div>{m.text}</div>
                        {m.attachments && m.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5 pt-1.5 border-t border-surface-elevated/20">
                            {m.attachments.map((att, attIdx) => {
                              const isImg = att.mimeType.startsWith('image/')
                              const isPdf = att.mimeType === 'application/pdf' || att.name.toLowerCase().endsWith('.pdf')
                              return (
                                <div
                                  key={attIdx}
                                  className="flex items-center gap-1 rounded-full bg-surface-elevated/25 px-2 py-0.5 text-[9.5px] font-semibold text-surface-elevated border border-surface-elevated/15"
                                >
                                  {isImg && att.base64Data ? (
                                    <img src={att.base64Data} className="h-3.5 w-3.5 rounded-full object-cover border border-surface-elevated/10" alt="" />
                                  ) : isPdf ? (
                                    <span className="text-[10px] flex items-center">📕</span>
                                  ) : (
                                    <span className="text-[10px] flex items-center">📄</span>
                                  )}
                                  <span className="max-w-[80px] truncate text-[9.5px]">{att.name}</span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : m.isDraft && m.draftData ? (
                    renderDraftCard(m, idx)
                  ) : (
                    <div className="max-w-[85%] rounded-[18px] px-4 py-2.5 text-[12.5px] leading-relaxed bg-surface/60 border border-border text-fg font-medium">
                      <AssistantMessageRenderer text={m.text} onOpenThread={selectThread} />
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Real-time Streaming Draft Card */}
            {isStreaming && streamingDraft?.isDraft && (
              <div className="mt-2.5 overflow-hidden rounded-[20px] border border-border bg-surface/90 w-full animate-in zoom-in-95 duration-250 shadow-sm">
                <div className="flex items-center justify-between border-b border-border/40 bg-surface px-4 py-2.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-fg-subtle">Grounded Mail Draft</span>
                  <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[9px] font-extrabold text-accent animate-pulse">Drafting...</span>
                </div>
                
                {/* Sleek preview grid */}
                <div className="p-4 border-b border-border/30 bg-surface-muted/10 space-y-2">
                  <div className="text-[11.5px] leading-normal text-fg-muted flex items-start gap-1">
                    <span className="font-bold text-fg-subtle w-14 shrink-0">To:</span>
                    <span className="truncate text-fg font-medium">{streamingDraft.to || <span className="text-fg-subtle/30 italic">Extracting...</span>}</span>
                  </div>
                  <div className="text-[11.5px] leading-normal text-fg-muted flex items-start gap-1">
                    <span className="font-bold text-fg-subtle w-14 shrink-0">Subject:</span>
                    <span className="text-fg font-medium">{streamingDraft.subject || <span className="text-fg-subtle/30 italic">Extracting...</span>}</span>
                  </div>
                </div>

                <div className="p-4 text-[12.5px] leading-relaxed text-fg whitespace-pre-wrap font-sans max-h-72 overflow-y-auto">
                  {streamingDraft.body || <span className="text-fg-subtle/40 italic animate-pulse">Drafting email body...</span>}
                  <span className="inline-block w-1.5 h-4 bg-accent ml-0.5 animate-pulse select-none align-middle" />
                </div>
              </div>
            )}

            {/* Standard Stream Display */}
            {isStreaming && !streamingDraft?.isDraft && streamText && (
              <div className="flex flex-col items-start w-full">
                <div className="max-w-[85%] rounded-[18px] bg-surface/50 border border-border px-4 py-2.5 text-[12.5px] leading-relaxed text-fg animate-pulse">
                  <AssistantMessageRenderer text={streamText} onOpenThread={selectThread} />
                  <span className="inline-block w-1.5 h-4 bg-accent ml-0.5 animate-pulse select-none align-middle" />
                </div>
              </div>
            )}

            {/* Pulsing Loading indicator while AI is thinking */}
            {isStreaming && !streamText && (!streamingDraft || !streamingDraft.body) && (
              <div className="flex flex-col items-start w-full animate-in fade-in duration-200">
                <div className="flex items-center gap-1.5 rounded-[18px] bg-surface/30 border border-border/50 px-4 py-3 text-[12.5px] text-fg-subtle">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-accent [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-accent [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-accent" />
                  <span className="text-[11px] font-medium text-fg-muted pl-1.5 uppercase tracking-wider animate-pulse">Thinking...</span>
                </div>
              </div>
            )}

            {streamingError && (
              <p className="rounded-[12px] border border-red-500/20 bg-red-500/5 px-3.5 py-2.5 text-xs  text-red-500">
                {streamingError}
              </p>
            )}

            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {/* Input Form Composer */}
      <div className="  px-5 py-4 bg-transparent shrink-0">
        {/* Hidden File Input */}
        <input
          type="file"
          multiple
          ref={fileInputRef}
          onChange={handleFileInputChange}
          className="hidden"
          accept=".pdf,.txt,.md,.markdown,.json,.csv,.js,.ts,.html,.css,image/*"
        />

        {/* Attached Files List Pills */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2.5 max-h-24 overflow-y-auto px-1">
            {attachments.map((att) => {
              const isImg = att.mimeType.startsWith('image/')
              const isPdf = att.mimeType === 'application/pdf' || att.name.toLowerCase().endsWith('.pdf')
              return (
                <div
                  key={att.id}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-surface-muted/60 pl-1.5 pr-2.5 py-1 text-[11px] font-semibold text-fg-muted animate-in zoom-in-95 duration-150 hover:bg-surface-muted animate-out fade-out"
                >
                  {isImg && att.base64Data ? (
                    <img src={att.base64Data} className="h-4 w-4 rounded-full object-cover border border-border" alt="" />
                  ) : isPdf ? (
                    <span className="text-red-400 font-bold text-[12px] flex items-center">📕</span>
                  ) : (
                    <span className="text-accent text-[12px] flex items-center">📄</span>
                  )}
                  <span className="max-w-[100px] truncate text-[10.5px]">{att.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                    className="ml-1 text-[13px] text-fg-subtle hover:text-red-400 cursor-pointer font-bold select-none leading-none"
                  >
                    &times;
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            executeAiPrompt(input)
          }}
          className="rounded-[18px] border border-border bg-surface/40 p-3.5 transition-all duration-300 focus-within:border-border-strong focus-within:bg-surface/75 focus-within:ring-4 focus-within:ring-accent/5"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isThreadView ? "Instruct AI to draft reply, summarize..." : "Ask anything, or draft email..."}
            rows={2}
            maxLength={2000}
            className="w-full resize-none bg-transparent text-[12.5px] font-medium text-fg placeholder:text-fg-subtle focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                executeAiPrompt(input)
              }
            }}
          />
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[9.5px]  text-fg-subtle uppercase tracking-wider">
              <span>⌘↵ send</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 rounded-full border border-border bg-surface text-fg-subtle hover:text-accent transition cursor-pointer active:scale-90 flex items-center justify-center"
                title="Attach files (PDF, Markdown, Images, Text)"
              >
                <PaperclipIcon />
              </button>
              <button
                type="submit"
                disabled={input.trim().length === 0 || isStreaming}
                className="rounded-full bg-fg px-4 py-1.5 text-[11px]  text-surface transition hover:opacity-90 disabled:opacity-40 hover:scale-95"
              >
                Send
              </button>
            </div>
          </div>
        </form>
      </div>
    </aside>
  )
}

function SparkleIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1.5 9 6l4.5 1L9 8l-1 4.5L7 8 2.5 7 7 6 8 1.5Z" />
    </svg>
  )
}
function ReplyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4 2 8l4 4M2 8h7a4 4 0 0 1 4 4v1" />
    </svg>
  )
}
function CloseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  )
}
function ArrowIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="text-fg-subtle">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  )
}
function PenIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4l-8 8H2v-2l8-8 2 2z" />
    </svg>
  )
}

function AssistantMessageRenderer({ text, onOpenThread }: { text: string; onOpenThread: (id: string) => void }) {
  const regex = /\[([^\]]+)\]\(thread:([a-zA-Z0-9_-]+)\)/g
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match
  const threadsToRender: { subject: string; id: string }[] = []

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index))
    }
    const [_, subject, threadId] = match
    threadsToRender.push({ subject, id: threadId })
    
    parts.push(
      <button
        key={match.index}
        type="button"
        onClick={() => onOpenThread(threadId)}
        className="font-bold text-accent hover:underline inline-flex items-center gap-0.5 cursor-pointer align-baseline"
      >
        "{subject}"
      </button>
    )
    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex))
  }

  return (
    <div className="space-y-3.5 w-full">
      <div className="whitespace-pre-wrap">{parts.length > 0 ? parts : text}</div>
      {threadsToRender.length > 0 && (
        <div className="grid gap-2 pt-2.5 w-full animate-in fade-in duration-200 text-fg">
          <div className="text-[9px] font-bold uppercase tracking-wider text-fg-subtle">
            Interactive Action Cards
          </div>
          <div className="flex flex-col gap-1.5 max-w-[280px]">
            {threadsToRender.map((t, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onOpenThread(t.id)}
                className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-left text-xs font-semibold text-fg-muted transition hover:border-border-strong hover:bg-surface-muted cursor-pointer active:scale-95"
              >
                <div className="truncate flex items-center gap-1.5 max-w-[75%]">
                  <span className="text-accent text-[12px]">✉️</span>
                  <span className="truncate text-[11.5px]">{t.subject}</span>
                </div>
                <span className="text-[8.5px] font-bold uppercase tracking-wider text-accent shrink-0 bg-accent-soft px-1.5 py-0.5 rounded flex items-center gap-0.5">
                  Open →
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PaperclipIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  )
}
