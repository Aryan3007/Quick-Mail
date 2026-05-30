import { useEffect, useRef, useState } from 'react'

import { useUiStore } from '../store/ui'
import { TONE_PRESETS, type TonePreset, type AiDocument } from '../../../shared/ai'

interface PanelAttachment {
  id: string
  name: string
  path: string
  size: number
  mimeType: string
  parsedText?: string
  base64Data?: string
}

export function Composer() {
  const composeOpen = useUiStore((s) => s.composeOpen)
  const closeCompose = useUiStore((s) => s.closeCompose)
  const composeData = useUiStore((s) => s.composeData)
  const queueSend = useUiStore((s) => s.queueSend)

  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  // AI draft state
  const [prompt, setPrompt] = useState('')
  const [tone, setTone] = useState<TonePreset | undefined>(undefined)
  const [isDrafting, setIsDrafting] = useState(false)
  const [draftingError, setDraftingError] = useState<string | null>(null)

  // Attachment states
  const [attachments, setAttachments] = useState<PanelAttachment[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isParsing, setIsParsing] = useState(false)

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
          const buffer = await file.arrayBuffer()
          let binary = ''
          const bytes = new Uint8Array(buffer)
          const len = bytes.byteLength
          const chunkSize = 8192
          for (let k = 0; k < len; k += chunkSize) {
            const chunk = bytes.subarray(k, k + chunkSize)
            binary += String.fromCharCode.apply(null, chunk as any)
          }
          const base64 = btoa(binary)
          
          const res = await window.quikmail.invoke('file:parse', {
            path: 'dummy.pdf',
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
          base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(file)
          })
        } else {
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

  const handlePaste = async (e: React.ClipboardEvent) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      e.preventDefault()
      await handleAttachFiles(e.clipboardData.files)
    }
  }

  // RAG / Knowledge Base states
  const [availableDocs, setAvailableDocs] = useState<AiDocument[]>([])
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])
  const [retrievedChunks, setRetrievedChunks] = useState<any[]>([])
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  const bodyRef = useRef<HTMLTextAreaElement | null>(null)

  // Initialize Composer data when it is opened with presets (e.g. Reply)
  useEffect(() => {
    if (!composeOpen) return
    if (composeData) {
      setTo(composeData.to ?? '')
      setSubject(composeData.subject ?? '')
      setBody(composeData.body ?? '')
    } else {
      setTo('')
      setSubject('')
      setBody('')
    }
    setPrompt('')
    setTone(undefined)
    setDraftingError(null)
    setIsDrafting(false)
  }, [composeOpen, composeData])

  useEffect(() => {
    if (!composeOpen) return
    window.quikmail.invoke('ai:persona:get')
      .then((res) => {
        if (res.ok && res.data?.documents) {
          setAvailableDocs(res.data.documents)
          // Default to all selected
          setSelectedDocIds(res.data.documents.map((d: any) => d.id))
        } else {
          setAvailableDocs([])
          setSelectedDocIds([])
        }
      })
      .catch((err) => {
        console.error('Failed to load persona documents for composer RAG:', err)
      })
    setRetrievedChunks([])
    setPreviewing(false)
    setPreviewError(null)
    setShowPreview(false)
  }, [composeOpen])

  if (!composeOpen) return null

  const handleDraftWithAi = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim() || isDrafting) return

    setIsDrafting(true)
    setDraftingError(null)

    const activeAttachments = [...attachments]
    setAttachments([])

    // Auto-extract email from prompt and fill To: field if empty
    if (!to.trim()) {
      const emailMatch = prompt.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/i)
      if (emailMatch) {
        setTo(emailMatch[0])
      }
    }

    // Clear body to start fresh with the incoming stream
    setBody('')

    const streamId = `draft_${Math.random().toString(36).slice(2, 9)}`
    let accumulatedText = ''

    // Register chunk listener
    const cleanupChunk = window.quikmail.on('ai:stream:chunk', (payload) => {
      if (payload.streamId === streamId) {
        accumulatedText += payload.chunk
        
        let displayBody = accumulatedText
        const dividerIdx = accumulatedText.indexOf('\n---')
        
        if (dividerIdx !== -1) {
          // Headers are complete! Extract them and show ONLY the clean body text
          const headersSection = accumulatedText.slice(0, dividerIdx)
          displayBody = accumulatedText.slice(dividerIdx + 4).trim()
          
          const toMatch = headersSection.match(/Recipient-To:\s*(.+)/i)
          const subMatch = headersSection.match(/Subject:\s*(.+)/i)
          
          if (toMatch && toMatch[1].trim()) {
            setTo(toMatch[1].trim())
          }
          if (subMatch && subMatch[1].trim()) {
            setSubject(subMatch[1].trim())
          }
        } else if (accumulatedText.startsWith('Recipient-To:') || accumulatedText.startsWith('Subject:')) {
          // Headers are actively streaming: hide them from the email body textarea box
          displayBody = ''
          
          const toMatch = accumulatedText.match(/Recipient-To:\s*([^\n]+)/i)
          const subMatch = accumulatedText.match(/Subject:\s*([^\n]+)/i)
          
          if (toMatch && toMatch[1].trim() && !toMatch[1].includes('---')) {
            setTo(toMatch[1].trim())
          }
          if (subMatch && subMatch[1].trim() && !subMatch[1].includes('---')) {
            setSubject(subMatch[1].trim())
          }
        }

        setBody(displayBody)
        if (bodyRef.current) {
          bodyRef.current.scrollTop = bodyRef.current.scrollHeight
        }
      }
    })

    // Register done listener
    const cleanupDone = window.quikmail.on('ai:stream:done', (payload) => {
      if (payload.streamId === streamId) {
        setIsDrafting(false)

        let finalBody = accumulatedText
        const dividerIdx = accumulatedText.indexOf('\n---')
        
        if (dividerIdx !== -1) {
          const headersSection = accumulatedText.slice(0, dividerIdx)
          finalBody = accumulatedText.slice(dividerIdx + 4).trim()
          
          const toMatch = headersSection.match(/Recipient-To:\s*(.+)/i)
          const subMatch = headersSection.match(/Subject:\s*(.+)/i)
          
          if (toMatch && toMatch[1].trim()) {
            setTo(toMatch[1].trim())
          }
          if (subMatch && subMatch[1].trim()) {
            setSubject(subMatch[1].trim())
          }
        } else {
          // Fall back to standard Subject header extraction if metadata divider was not present
          const subjectLineMatch = accumulatedText.match(/^[ \t]*Subject:\s*(.+?)\r?\n+/i)
          if (subjectLineMatch) {
            if (!subject.trim()) {
              setSubject(subjectLineMatch[1].trim())
            }
            finalBody = accumulatedText.replace(/^[ \t]*Subject:\s*.+?\r?\n+/i, '').trim()
          }
        }

        setBody(finalBody)
        cleanups()
      }
    })

    // Register error listener
    const cleanupError = window.quikmail.on('ai:stream:error', (payload) => {
      if (payload.streamId === streamId) {
        setDraftingError(payload.error)
        setIsDrafting(false)
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
        prompt,
        tone,
        threadId: composeData?.threadId,
        streamId,
        documentIds: selectedDocIds.length > 0 ? selectedDocIds : undefined,
        attachments: activeAttachments.map(att => ({
          name: att.name,
          mimeType: att.mimeType,
          base64Data: att.base64Data,
          parsedText: att.parsedText
        }))
      })
      if (!res.ok) {
        setDraftingError(res.error.message)
        setIsDrafting(false)
        cleanups()
      }
    } catch (err) {
      setDraftingError(err instanceof Error ? err.message : 'Draft generation failed')
      setIsDrafting(false)
      cleanups()
    }
  }

  const handlePreviewRagContext = async () => {
    if (!prompt.trim()) return
    if (showPreview) {
      setShowPreview(false)
      return
    }

    setPreviewing(true)
    setPreviewError(null)
    try {
      const res = await window.quikmail.invoke('ai:knowledge:retrieve', {
        prompt,
        documentIds: selectedDocIds.length > 0 ? selectedDocIds : undefined
      })
      if (res.ok) {
        setRetrievedChunks(res.data)
        setShowPreview(true)
      } else {
        setPreviewError(res.error.message)
      }
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Failed to search RAG context')
    } finally {
      setPreviewing(false)
    }
  }

  const handleSend = () => {
    if (!to.trim()) {
      alert('Please specify a recipient')
      return
    }

    // Wrap the send inside our visual Undo-Send queue
    queueSend(
      'direct',
      { to, subject, body, threadId: composeData?.threadId },
      async () => {
        const res = await window.quikmail.invoke('mail:send:direct', {
          to,
          subject,
          body,
          threadId: composeData?.threadId,
        })
        if (!res.ok) {
          alert(`Failed to send email: ${res.error.message}`)
        }
      }
    )
  }

  const handleSaveDraft = async () => {
    if (!to.trim() && !subject.trim() && !body.trim()) {
      closeCompose()
      return
    }

    try {
      const res = await window.quikmail.invoke('mail:draft:create', {
        to,
        subject,
        body,
        threadId: composeData?.threadId,
      })
      if (res.ok) {
        closeCompose()
      } else {
        alert(`Failed to save draft: ${res.error.message}`)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Save draft failed')
    }
  }

  return (
    <div 
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPaste={handlePaste}
      className="fixed right-8 bottom-8 z-50 flex w-[550px] flex-col overflow-hidden rounded-[24px] border border-border bg-surface/75 backdrop-blur-2xl animate-in fade-in slide-in-from-bottom-8 duration-300"
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={async (e) => {
          if (e.target.files && e.target.files.length > 0) {
            await handleAttachFiles(e.target.files)
          }
        }}
        multiple
        className="hidden"
      />

      {isDragging && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-accent/40 bg-surface px-8 py-6 text-center shadow-lg animate-in zoom-in-95 duration-300">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
              <PaperclipIcon />
            </div>
            <div>
              <p className="text-sm font-semibold text-fg">Drop files to attach</p>
              <p className="text-xs text-fg-subtle mt-1">Supports PDF, Image, Markdown & text files</p>
            </div>
          </div>
        </div>
      )}

      {isParsing && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/50 backdrop-blur-sm animate-in fade-in duration-250">
          <div className="flex items-center gap-2 rounded-full bg-surface px-4 py-2 border border-border shadow-md">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <span className="text-[11.5px] font-semibold text-fg">Reading files...</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-border/50 bg-surface px-4">
        <h3 className="text-[13px]  tracking-tight text-fg">
          {composeData?.threadId ? 'Reply to conversation' : 'New Message'}
        </h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleSaveDraft}
            className="flex h-7 w-7 items-center justify-center rounded-full text-fg-subtle transition hover:bg-surface-muted hover:text-fg"
            title="Save draft & close"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* Form Fields */}
      <div className="flex flex-col bg-transparent p-5 space-y-4">
        <div className="flex items-center gap-3 border-b border-border/30 pb-2">
          <span className="w-12 text-xs  text-fg-subtle">To:</span>
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="recipient@example.com"
            className="flex-1 bg-transparent text-[12.5px] font-medium text-fg focus:outline-none placeholder:text-fg-subtle"
          />
        </div>
        <div className="flex items-center gap-3 border-b border-border/30 pb-2">
          <span className="w-12 text-xs  text-fg-subtle">Subject:</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Enter subject..."
            className="flex-1 bg-transparent text-[12.5px] font-medium text-fg focus:outline-none placeholder:text-fg-subtle"
          />
        </div>
        <div className="relative pt-2">
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type your email here..."
            rows={9}
            className="w-full resize-none bg-transparent text-[13px] leading-relaxed text-fg focus:outline-none placeholder:text-fg-subtle"
          />
          {isDrafting && (
            <div className="absolute top-2 right-2 flex items-center gap-1.5 rounded-full bg-accent-soft/90 backdrop-blur-sm px-3 py-1 text-[10px]  text-accent animate-pulse">
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-ping" />
              AI drafting…
            </div>
          )}
        </div>
      </div>

      {/* RAG Context / AI Prompter section */}
      <div className="border-t border-border bg-surface-sunken p-4">
        <form onSubmit={handleDraftWithAi} className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
                <SparkleIcon />
                AI Draft Assistant
              </span>
              {availableDocs.length > 0 && (
                <span className="rounded-full bg-tag-sage/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-tag-sage animate-pulse">
                  RAG Active
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {TONE_PRESETS.map((t) => {
                const active = tone === t.key
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTone(active ? undefined : t.key)}
                    className={
                      'rounded px-2 py-0.5 text-[10px] font-medium transition ' +
                      (active
                        ? 'bg-accent-soft text-accent border border-accent/25'
                        : 'bg-surface border border-border text-fg-muted hover:text-fg')
                    }
                    title={t.description}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Attachments preview row */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pb-1 animate-in fade-in slide-in-from-bottom-1 duration-200">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-[10.5px] font-medium text-fg shadow-sm transition hover:border-border-strong"
                >
                  {att.base64Data ? (
                    <div className="h-3.5 w-3.5 overflow-hidden rounded-full border border-border/55">
                      <img src={att.base64Data} alt={att.name} className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <span className="text-[9.5px] opacity-75">📕</span>
                  )}
                  <span className="max-w-[120px] truncate text-fg-muted">{att.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== att.id))}
                    className="ml-1 text-[9.5px] text-fg-subtle hover:text-red-500 transition cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 relative">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Decline invitation, invite them next Tuesday at 3pm"
              disabled={isDrafting}
              className="flex-1 rounded-lg border border-border bg-surface pl-3 pr-8 py-1.5 text-[12px] text-fg placeholder:text-fg-subtle focus:border-border-strong focus:outline-none"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute right-[85px] p-1 text-fg-subtle transition hover:text-fg cursor-pointer hover:bg-surface-muted rounded-full"
              title="Attach files"
            >
              <PaperclipIcon />
            </button>
            <button
              type="submit"
              disabled={isDrafting || !prompt.trim()}
              className="rounded-lg bg-fg px-4 py-1.5 text-[12px] font-semibold text-surface transition hover:opacity-90 disabled:opacity-40"
            >
              Draft
            </button>
          </div>

          {prompt.trim().length > 0 && availableDocs.length > 0 && (
            <div className="flex items-center justify-end -mt-1">
              <button
                type="button"
                onClick={handlePreviewRagContext}
                disabled={previewing}
                className="text-[9.5px] font-bold text-accent hover:underline flex items-center gap-1 cursor-pointer transition active:scale-95"
              >
                {previewing ? 'Searching Knowledge...' : showPreview ? '✕ Hide Matched Facts' : '🔍 Preview Matched Facts'}
              </button>
            </div>
          )}

          {/* RAG Context Matched Facts accordian details */}
          {showPreview && (
            <div className="rounded-lg border border-border/50 bg-surface p-3 max-h-36 overflow-y-auto space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between text-[9.5px] font-bold uppercase tracking-wider text-fg-subtle border-b border-border/30 pb-1">
                <span>Retrieved Database Snippets</span>
                <span className="text-accent text-[9px] font-normal normal-case">
                  {retrievedChunks.length} snippets matched
                </span>
              </div>
              {previewError && <p className="text-[10px] text-red-500">{previewError}</p>}
              {retrievedChunks.length === 0 ? (
                <p className="text-[10.5px] text-fg-subtle italic py-1">No matching facts found in your indexed documents.</p>
              ) : (
                <ul className="space-y-1 text-[10.5px] leading-normal text-fg-muted list-disc pl-3">
                  {retrievedChunks.map((chunk, i) => {
                    const docName = availableDocs.find(d => d.id === chunk.docId)?.name || 'Document'
                    return (
                      <li key={i} className="line-clamp-2">
                        <span className="font-semibold text-fg-subtle">[{docName}]</span> {chunk.text}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}

          {/* RAG Knowledge Selector switchers */}
          {availableDocs.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/30 mt-1">
              <span className="text-[9.5px] font-semibold text-fg-subtle uppercase tracking-wider">RAG Knowledge Filters:</span>
              {availableDocs.map((doc) => {
                const isSelected = selectedDocIds.includes(doc.id)
                return (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setSelectedDocIds(selectedDocIds.filter((id) => id !== doc.id))
                      } else {
                        setSelectedDocIds([...selectedDocIds, doc.id])
                      }
                    }}
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition flex items-center gap-1 cursor-pointer border ${
                      isSelected
                        ? 'bg-accent-soft text-accent border-accent/20'
                        : 'bg-surface border-border text-fg-subtle hover:text-fg'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-accent' : 'bg-fg-subtle/50'}`} />
                    {doc.name}
                  </button>
                )
              })}
            </div>
          )}

          {draftingError && (
            <p className="text-[10.5px] font-medium text-red-500">{draftingError}</p>
          )}
        </form>
      </div>

      {/* Footer controls */}
      <div className="flex items-center justify-between border-t border-border bg-surface-elevated px-4 py-3">
        <button
          type="button"
          onClick={handleSaveDraft}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-fg-muted transition hover:text-fg"
        >
          Save Draft
        </button>
        <button
          type="button"
          onClick={handleSend}
          className="rounded-md bg-accent px-4 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
        >
          Send Now
        </button>
      </div>
    </div>
  )
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="m4 4 8 8M12 4l-8 8" />
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

function PaperclipIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  )
}
