import { ipcMain, dialog } from 'electron'
import { writeFileSync } from 'node:fs'

import type { AiDocument, AiPersona, TriageCategory, RetrievedChunk } from '../shared/ai'
import type {
  AiInfo,
  AuthStatus,
  IpcChannel,
  IpcResult,
  ThemePreference,
  ThemeState,
} from '../shared/ipc'
import type { MailInboxPage, MailThread } from '../shared/mail'
import {
  EmbeddingError,
  addDocument,
  deleteDocument,
  readPersona,
  writePersona,
  retrieveForQuery,
} from './ai'
import { authHeaders, ensureDevice } from './auth/device'
import { clearGoogleAccount, readGoogleAccount, startGoogleSignIn } from './auth/google'
import { API_BASE_URL } from './config'
import { GmailApiError, createGmailDraft, sendGmailMessageDirect, sendGmailDraft, modifyGmailMessageLabels, trashGmailMessage, listInboxMessageIds, listFolderMessageIds, getMessageMetadata } from './mail/gmail'
import { getThreadFull, listInboxThreads, listFolderThreads } from './mail/sync'
import { getThemeState, setThemePreference } from './theme'
import { semanticSearchEmails, loadMetadata, saveMetadata, updateThreadInCache } from './ai/index'
import { parseSender, getHeader, receivedAtIso, isUnread, isStarred } from './mail/parse'
import { getTriageRules, setTriageRules, getTriageCategories, setTriageCategories, triageIncomingEmailsRetroactive, getThreadCategories } from './ai/triage'
import { getAuditLogs } from './ai/audit'
import { evaluateAndTriageNewEmail } from './whatsapp'

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}

function fail(code: string, message: string): IpcResult<never> {
  return { ok: false, error: { code, message } }
}

async function parsePdfBuffer(buffer: Buffer): Promise<string> {
  const pdfModule = require('pdf-parse')

  // 1. Check if the module exports a PDFParse class (modern pdf-parse v2.4.5)
  const PDFParseClass = pdfModule.PDFParse || (pdfModule.default && pdfModule.default.PDFParse)
  if (PDFParseClass) {
    const parser = new PDFParseClass({ data: buffer })
    const res = await parser.getText()
    return res.text || ''
  }

  // 2. Fall back to classic pdf-parse function exports
  const pdfFn = typeof pdfModule === 'function'
    ? pdfModule
    : (pdfModule && typeof pdfModule.default === 'function')
      ? pdfModule.default
      : (pdfModule && typeof pdfModule.pdf === 'function')
        ? pdfModule.pdf
        : null

  if (!pdfFn) {
    throw new Error('Could not locate pdf-parse resolver function')
  }

  const res = await pdfFn(buffer)
  return res.text || ''
}

async function handleAuthStatus(): Promise<IpcResult<AuthStatus>> {
  try {
    await ensureDevice()
  } catch (err) {
    return fail('device_register_failed', err instanceof Error ? err.message : 'unknown')
  }
  const account = readGoogleAccount()
  if (!account) return ok({ hasDevice: true, google: { connected: false } })
  return ok({
    hasDevice: true,
    google: {
      connected: true,
      email: account.profile.email,
      ...(account.profile.name ? { name: account.profile.name } : {}),
      ...(account.profile.picture ? { picture: account.profile.picture } : {}),
      scopes: account.tokens.scope.split(' ').filter(Boolean),
      expiresAt: account.tokens.expires_at,
    },
  })
}

async function handleGoogleStart(): Promise<IpcResult<{ email: string; name?: string; picture?: string }>> {
  try {
    const account = await startGoogleSignIn()
    return ok({
      email: account.profile.email,
      ...(account.profile.name ? { name: account.profile.name } : {}),
      ...(account.profile.picture ? { picture: account.profile.picture } : {}),
    })
  } catch (err) {
    return fail('google_signin_failed', err instanceof Error ? err.message : 'unknown')
  }
}

async function handleGoogleDisconnect(): Promise<IpcResult<true>> {
  clearGoogleAccount()
  return ok(true)
}

async function handleThemeGet(): Promise<IpcResult<ThemeState>> {
  return ok(getThemeState())
}

async function handleThemeSet(next: unknown): Promise<IpcResult<ThemeState>> {
  if (next !== 'light' && next !== 'dark' && next !== 'system') {
    return fail('invalid_theme', `Expected light|dark|system, got ${String(next)}`)
  }
  return ok(setThemePreference(next as ThemePreference))
}

async function handleMailListInbox(args: unknown): Promise<IpcResult<MailInboxPage>> {
  const obj = args && typeof args === 'object' ? (args as Record<string, unknown>) : {}
  const maxResults = typeof obj.maxResults === 'number' ? obj.maxResults : 30
  const pageToken = typeof obj.pageToken === 'string' && obj.pageToken.length > 0 ? obj.pageToken : undefined
  try {
    return ok(await listInboxThreads(maxResults, pageToken))
  } catch (err) {
    if (err instanceof GmailApiError) {
      if (err.status === 401) return fail('gmail_unauthorized', 'Access token rejected; please sign in again')
      if (err.status === 429) return fail('gmail_rate_limited', 'Gmail rate limit hit; try again shortly')
      return fail('gmail_error', err.message)
    }
    return fail('mail_list_failed', err instanceof Error ? err.message : 'unknown')
  }
}

async function handleMailListFolder(args: unknown): Promise<IpcResult<MailInboxPage>> {
  const obj = args && typeof args === 'object' ? (args as Record<string, unknown>) : {}
  const folder = typeof obj.folder === 'string' ? obj.folder as 'sent' | 'drafts' | 'trash' | 'spam' | 'starred' | 'archive' : 'sent'
  const maxResults = typeof obj.maxResults === 'number' ? obj.maxResults : 30
  const pageToken = typeof obj.pageToken === 'string' && obj.pageToken.length > 0 ? obj.pageToken : undefined
  try {
    return ok(await listFolderThreads(folder, maxResults, pageToken))
  } catch (err) {
    if (err instanceof GmailApiError) {
      if (err.status === 401) return fail('gmail_unauthorized', 'Access token rejected; please sign in again')
      if (err.status === 429) return fail('gmail_rate_limited', 'Gmail rate limit hit; try again shortly')
      return fail('gmail_error', err.message)
    }
    return fail('mail_folder_list_failed', err instanceof Error ? err.message : 'unknown')
  }
}

async function handleMailGet(id: unknown): Promise<IpcResult<{ thread: MailThread; body: string; htmlBody: string | null }>> {
  if (typeof id !== 'string' || id.length === 0) {
    return fail('invalid_id', 'Expected non-empty message id')
  }
  try {
    return ok(await getThreadFull(id))
  } catch (err) {
    if (err instanceof GmailApiError) {
      return fail('gmail_error', err.message)
    }
    return fail('mail_get_failed', err instanceof Error ? err.message : 'unknown')
  }
}

async function handleAiInfo(): Promise<IpcResult<AiInfo>> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/ai/info`, { headers: await authHeaders() })
    const json = (await res.json()) as
      | { ok: true; provider: AiInfo['provider']; model: string }
      | { ok: false; error: { code: string; message: string } }
    if (!('ok' in json) || !json.ok) {
      const message = 'error' in json && json.error ? json.error.message : 'AI info unavailable'
      const code = 'error' in json && json.error ? json.error.code : 'ai_info_failed'
      return fail(code, message)
    }
    return ok({ provider: json.provider, model: json.model })
  } catch (err) {
    return fail('ai_info_failed', err instanceof Error ? err.message : 'unknown')
  }
}

async function handlePersonaGet(): Promise<IpcResult<AiPersona>> {
  try {
    return ok(readPersona())
  } catch (err) {
    return fail('persona_read_failed', err instanceof Error ? err.message : 'unknown')
  }
}

async function handlePersonaSet(next: unknown): Promise<IpcResult<AiPersona>> {
  try {
    return ok(writePersona(next))
  } catch (err) {
    return fail('persona_write_failed', err instanceof Error ? err.message : 'unknown')
  }
}

async function handleDocAdd(input: unknown): Promise<IpcResult<AiDocument>> {
  if (!input || typeof input !== 'object') {
    return fail('invalid_input', 'Expected { name, text, source }')
  }
  const o = input as Record<string, unknown>
  const name = typeof o.name === 'string' ? o.name.trim() : ''
  let text = typeof o.text === 'string' ? o.text : ''
  const path = typeof o.path === 'string' ? o.path : undefined
  const pdfBase64 = typeof o.pdfBase64 === 'string' ? o.pdfBase64 : undefined
  const source = o.source === 'paste' || o.source === 'upload' ? o.source : 'paste'

  if (name.length === 0) return fail('invalid_input', 'Document name is required')

  if (pdfBase64) {
    try {
      const buffer = Buffer.from(pdfBase64, 'base64')
      text = await parsePdfBuffer(buffer)
    } catch (err) {
      return fail('pdf_parse_failed', `Failed to parse PDF data: ${err instanceof Error ? err.message : String(err)}`)
    }
  } else if (path && path.toLowerCase().endsWith('.pdf')) {
    try {
      const fs = require('node:fs')
      const buffer = fs.readFileSync(path)
      text = await parsePdfBuffer(buffer)
    } catch (err) {
      return fail('pdf_parse_failed', `Failed to parse PDF file: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (text.trim().length === 0) return fail('invalid_input', 'Document text is empty')

  try {
    const doc = await addDocument({ name, text, source })
    return ok(doc)
  } catch (err) {
    if (err instanceof EmbeddingError) {
      return fail(err.code, err.message)
    }
    return fail('doc_add_failed', err instanceof Error ? err.message : 'unknown')
  }
}

async function handleDocRemove(id: unknown): Promise<IpcResult<AiPersona>> {
  if (typeof id !== 'string' || id.length === 0) {
    return fail('invalid_id', 'Expected non-empty document id')
  }
  try {
    return ok(deleteDocument(id))
  } catch (err) {
    return fail('doc_remove_failed', err instanceof Error ? err.message : 'unknown')
  }
}

async function handleAiStream(
  event: any,
  args: unknown,
): Promise<IpcResult<{ success: boolean }>> {
  const obj = args && typeof args === 'object' ? (args as Record<string, unknown>) : {}
  const prompt = typeof obj.prompt === 'string' ? obj.prompt : ''
  const tone = typeof obj.tone === 'string' ? obj.tone : undefined
  const threadId = typeof obj.threadId === 'string' && obj.threadId.length > 0 ? obj.threadId : undefined
  const streamId = typeof obj.streamId === 'string' ? obj.streamId : ''
  const documentIds = Array.isArray(obj.documentIds) ? (obj.documentIds as string[]) : undefined
  const attachments = Array.isArray(obj.attachments) ? (obj.attachments as Array<{
    name: string
    mimeType: string
    base64Data?: string
    parsedText?: string
  }>) : undefined

  if (!prompt || !streamId) {
    return fail('invalid_args', 'Missing prompt or streamId')
  }

  // Run async stream in background, returning OK immediately
  void (async () => {
    try {
      // 1. Search vector database for RAG context
      let ragContext = ''
      let matchingEmailsContext = ''
      try {
        let chunks = await retrieveForQuery(prompt, 8)
        
        // Split chunks into documents vs email threads
        const docChunks = chunks.filter((c) => !c.docId.startsWith('email_'))
        const emailChunks = chunks.filter((c) => c.docId.startsWith('email_'))
        
        // 1a. Format document RAG chunks
        let filteredDocChunks = docChunks
        if (documentIds) {
          filteredDocChunks = docChunks.filter((c) => documentIds.includes(c.docId))
        }
        if (filteredDocChunks.length > 0) {
          ragContext = filteredDocChunks.map((c) => `- FROM DOCUMENT: ${c.text}`).join('\n')
        }
        
        // 1b. Format email thread RAG matches
        if (emailChunks.length > 0) {
          const cached = loadMetadata()
          const matchedThreads: MailThread[] = []
          for (const chunk of emailChunks) {
            const tId = chunk.docId.slice(6)
            const found = cached.find((x) => x.id === tId)
            if (found && !matchedThreads.some((x) => x.id === found.id)) {
              matchedThreads.push(found)
            }
          }
          if (matchedThreads.length > 0) {
            matchingEmailsContext = `RECENT RELEVANT EMAILS MATCHING QUERY:\n` +
              matchedThreads.map((t) => 
                `- Thread ID: ${t.id}\n` +
                `  From: ${t.from} <${t.fromEmail}>\n` +
                `  Subject: ${t.subject}\n` +
                `  Preview: ${t.preview}\n` +
                `  Received: ${new Date(t.receivedAt).toLocaleString()}\n`
              ).join('\n')
          }
        }
      } catch (err) {
        console.error('RAG vector retrieval failed:', err)
      }

      // 2. Fetch active thread context
      let threadContext = ''
      if (threadId) {
        try {
          const threadData = await getThreadFull(threadId)
          threadContext = `ORIGINAL EMAIL THREAD DETAILS:\n` +
            `From: ${threadData.thread.from} <${threadData.thread.fromEmail}>\n` +
            `Subject: ${threadData.thread.subject}\n` +
            `Body:\n${threadData.body}`
        } catch (err) {
          console.error('Failed to fetch thread context:', err)
        }
      }

      // 3. Read persona settings
      const persona = readPersona()
      const selectedTone = tone || persona.tonePreset || 'friendly'

      let systemPrompt = ''
      const isDraftRequest =
        tone !== undefined ||
        /\b(draft|write|compose|reply|send)\b/i.test(prompt) ||
        prompt.toLowerCase().includes('email to') ||
        prompt.toLowerCase().includes('email about')

      if (isDraftRequest) {
        systemPrompt = `You are QuikMail AI — an expert email writing assistant. Write clear, human-sounding emails that feel like they came from a real person, not a template.

## OUTPUT FORMAT
- You MUST scan the prompt, thread history, and ALL attached documents/images (especially attached job descriptions, hiring posts, email screenshots, etc.) to extract the recipient's email address and craft an excellent subject line.
- You ALWAYS prepend your response with exactly this metadata block:
  Recipient-To: [email address if found/inferred from attachments or prompt, e.g. hiring@firm.com, otherwise leave completely empty]
  Subject: [compelling subject line matching context or image instructions, e.g. "SDE 1 Application | Piyush Singhal", otherwise leave completely empty]
  ---
  [Start your email body here]

- No preamble like "Here is your email:".
- No greeting (e.g. "Dear [Name]") unless the user provides the recipient's name or it is found in the thread/attachments.
- No sign-off or signature unless one is explicitly provided by the user.
- No placeholders like [Your Name] or [Insert detail] — if you don't have the information, write around it naturally.

## CONTEXT USAGE (from resume/profile)
You have been provided background context about the sender. Use it with extreme restraint:
- Extract ONLY the 1–2 facts most relevant to this specific email's goal.
- Never summarize the person's background. Never list skills, roles, or achievements unless the email's purpose demands it.
- If the email goal is NOT self-promotional (e.g. scheduling a meeting, following up, asking a question), use ZERO facts from the context.
- Think: "What is the single credential or detail that makes THIS email more credible?" Use only that. Nothing else.
- The email should still sound like a human dashed it off — not like they attached their resume to every sentence.

## LENGTH & STRUCTURE
- Default: 2–4 short paragraphs. Lean shorter when in doubt.
- Only write longer emails if the user explicitly asks for detail or the request is clearly complex (e.g. investor pitch, formal complaint, detailed proposal).
- One idea per paragraph. No walls of text.

## TONE
Write in a ${selectedTone} tone. Tone should feel natural, not performed. A "formal" email should still sound human — not like a legal document. A "casual" email should still be professional enough to send.

## STRICT CONTENT RULES
1. NEVER invent details the user hasn't provided — no phone numbers, LinkedIn URLs, GitHub links, portfolios, addresses, certifications, job titles, or company names.
2. If context/background is provided, use it only to match tone and relevance — do NOT paste it into the email or turn it into a bio.
3. If critical information is missing (recipient name, context, goal), write the best possible email with what's available. Do not ask clarifying questions — just write.
4. Do not moralize, add disclaimers, or suggest the user reconsider their request. Just write the email.

## QUALITY BAR
Every email you write should pass this test: could a confident, well-spoken professional have written this themselves? If it sounds like AI filler — "I hope this email finds you well", "Please do not hesitate to reach out" — rewrite it.`
      } else {
        systemPrompt = `You are QuikMail AI Assistant — an intelligent email and productivity coach. Help the user manage, analyze, and conversational-search their inbox.

## GENERAL RULES
- Be direct, professional, friendly, and concise.
- Answer the user's questions accurately based on the matched context provided below.
- If the user is looking for specific emails, refer to the "RECENT RELEVANT EMAILS MATCHING QUERY" section. 
- When listing or referencing matching emails, ALWAYS format them as markdown links using the custom 'thread' protocol. Format: [Subject of Email](thread:ThreadID)
- For example, if referencing an email with subject "Design Spec" and Thread ID "12345", write: "I found [Design Spec](thread:12345) from..."
- This allows the UI to render interactive cards. Always make sure to use this format for matched emails! Do not make up thread IDs; only use the exact IDs provided in the matching emails context.`
      }

      if (persona.aboutMe) {
        systemPrompt += `\n\nCONTEXT ABOUT THE USER (use as background context only — do NOT copy this into the email):\n${persona.aboutMe}`
      }

      if (persona.signature) {
        systemPrompt += `\n\nUSER'S EMAIL SIGNATURE (append exactly this at the end of the email body):\n${persona.signature}`
      }

      if (ragContext) {
        systemPrompt += `\n\nRELEVANT KNOWLEDGE (use to inform the email or answer questions only if directly relevant):\n${ragContext}`
      }

      if (matchingEmailsContext) {
        systemPrompt += `\n\n${matchingEmailsContext}`
      }

      if (threadContext) {
        systemPrompt += `\n\n${threadContext}`
      }

      let textAttachmentsContext = ''
      if (attachments && attachments.length > 0) {
        const textAtts = attachments.filter(att => !att.mimeType.startsWith('image/'))
        if (textAtts.length > 0) {
          textAttachmentsContext = `\n\nATTACHED DOCUMENTS FROM USER (use as grounded context):\n` +
            textAtts.map(att => 
              `[FILE: ${att.name}]\n` +
              `Content:\n"""\n${att.parsedText || ''}\n"""`
            ).join('\n\n')
        }
      }

      if (textAttachmentsContext) {
        systemPrompt += textAttachmentsContext
      }

      let messagesContent: any = prompt
      if (attachments && attachments.length > 0) {
        const imageAtts = attachments.filter(att => att.mimeType.startsWith('image/'))
        if (imageAtts.length > 0) {
          messagesContent = [{ type: 'text', text: prompt }]
          for (const img of imageAtts) {
            if (img.base64Data) {
              let rawBase64 = img.base64Data
              if (rawBase64.includes(';base64,')) {
                rawBase64 = rawBase64.split(';base64,')[1]
              }
              messagesContent.push({
                type: 'image',
                image: {
                  mimeType: img.mimeType,
                  base64: rawBase64,
                },
              })
            }
          }
        }
      }

      // 4. Request the Fastify server stream
      const response = await fetch(`${API_BASE_URL}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(await authHeaders()),
        },
        body: JSON.stringify({
          system: systemPrompt,
          messages: [{ role: 'user', content: messagesContent }],
          stream: true,
        }),
      })

      if (!response.ok) {
        const text = await response.text()
        event.sender.send('ai:stream:error', { streamId, error: `Backend API error ${response.status}: ${text}` })
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        event.sender.send('ai:stream:error', { streamId, error: 'Empty stream response' })
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        let currentEvent = ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          if (trimmed.startsWith('event:')) {
            currentEvent = trimmed.slice(6).trim()
          } else if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.slice(5).trim()
            try {
              const parsed = JSON.parse(dataStr)
              if (currentEvent === 'text_delta' && parsed.text) {
                event.sender.send('ai:stream:chunk', { streamId, chunk: parsed.text })
              } else if (currentEvent === 'error') {
                event.sender.send('ai:stream:error', { streamId, error: parsed.message || 'Stream error' })
              }
            } catch (err) {
              console.error('Failed to parse SSE JSON:', err)
            }
          }
        }
      }
      event.sender.send('ai:stream:done', { streamId })
    } catch (err) {
      console.error('AI streaming handler crash:', err)
      event.sender.send('ai:stream:error', { streamId, error: err instanceof Error ? err.message : 'Unknown streaming error' })
    }
  })()

  return ok({ success: true })
}

async function handleMailDraftCreate(
  _event: any,
  args: unknown,
): Promise<IpcResult<{ id: string; threadId: string }>> {
  const obj = args && typeof args === 'object' ? (args as Record<string, unknown>) : {}
  const to = typeof obj.to === 'string' ? obj.to : ''
  const subject = typeof obj.subject === 'string' ? obj.subject : ''
  const rawBody = typeof obj.body === 'string' ? obj.body : ''
  const threadId = typeof obj.threadId === 'string' && obj.threadId.length > 0 ? obj.threadId : undefined
  const attachments = Array.isArray(obj.attachments) ? (obj.attachments as Array<{
    name: string
    mimeType: string
    base64Data: string
  }>) : undefined
  const bodyHtml = plainTextToHtml(rawBody)

  try {
    const res = await createGmailDraft(to, subject, bodyHtml, threadId, attachments)
    return ok(res)
  } catch (err) {
    return fail('mail_draft_failed', err instanceof Error ? err.message : 'unknown')
  }
}

/** Convert plain-text email body to styled HTML so Gmail renders it nicely */
function plainTextToHtml(text: string): string {
  if (!text.trim()) return ''
  // If it already looks like HTML, pass through
  if (text.trimStart().startsWith('<') && (text.includes('</') || text.includes('/>'))) return text
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
  // Convert blank lines to paragraphs, single newlines to <br>
  const paragraphs = escaped.split(/\n{2,}/)
  return paragraphs
    .map((p) => `<p style="margin:0 0 1em 0;line-height:1.6">${p.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

async function handleMailSendDirect(
  _event: any,
  args: unknown,
): Promise<IpcResult<{ id: string; threadId: string }>> {
  const obj = args && typeof args === 'object' ? (args as Record<string, unknown>) : {}
  const to = typeof obj.to === 'string' ? obj.to : ''
  const subject = typeof obj.subject === 'string' ? obj.subject : ''
  const rawBody = typeof obj.body === 'string' ? obj.body : ''
  const threadId = typeof obj.threadId === 'string' && obj.threadId.length > 0 ? obj.threadId : undefined
  const attachments = Array.isArray(obj.attachments) ? (obj.attachments as Array<{
    name: string
    mimeType: string
    base64Data: string
  }>) : undefined
  const bodyHtml = plainTextToHtml(rawBody)

  try {
    const res = await sendGmailMessageDirect(to, subject, bodyHtml, threadId, attachments)
    return ok(res)
  } catch (err) {
    return fail('mail_send_failed', err instanceof Error ? err.message : 'unknown')
  }
}

async function handleMailDraftSend(
  _event: any,
  args: unknown,
): Promise<IpcResult<{ success: boolean }>> {
  const obj = args && typeof args === 'object' ? (args as Record<string, unknown>) : {}
  const draftId = typeof obj.draftId === 'string' ? obj.draftId : ''

  if (!draftId) return fail('invalid_args', 'Missing draftId')

  try {
    const success = await sendGmailDraft(draftId)
    return ok({ success })
  } catch (err) {
    return fail('mail_send_draft_failed', err instanceof Error ? err.message : 'unknown')
  }
}

async function handleMailStar(_event: any, args: unknown): Promise<IpcResult<{ success: boolean }>> {
  const obj = args && typeof args === 'object' ? (args as Record<string, unknown>) : {}
  const id = typeof obj.id === 'string' ? obj.id : ''
  if (!id) return fail('invalid_args', 'Missing message id')
  try {
    const success = await modifyGmailMessageLabels(id, ['STARRED'], [])
    if (success) {
      updateThreadInCache(id, (t) => ({
        ...t,
        starred: true,
        labels: Array.from(new Set([...(t.labels ?? []), 'STARRED'])),
      }))
    }
    return ok({ success })
  } catch (err) {
    return fail('mail_star_failed', err instanceof Error ? err.message : 'unknown')
  }
}

async function handleMailUnstar(_event: any, args: unknown): Promise<IpcResult<{ success: boolean }>> {
  const obj = args && typeof args === 'object' ? (args as Record<string, unknown>) : {}
  const id = typeof obj.id === 'string' ? obj.id : ''
  if (!id) return fail('invalid_args', 'Missing message id')
  try {
    const success = await modifyGmailMessageLabels(id, [], ['STARRED'])
    if (success) {
      updateThreadInCache(id, (t) => ({
        ...t,
        starred: false,
        labels: (t.labels ?? []).filter((l) => l !== 'STARRED'),
      }))
    }
    return ok({ success })
  } catch (err) {
    return fail('mail_unstar_failed', err instanceof Error ? err.message : 'unknown')
  }
}

async function handleMailArchive(_event: any, args: unknown): Promise<IpcResult<{ success: boolean }>> {
  const obj = args && typeof args === 'object' ? (args as Record<string, unknown>) : {}
  const id = typeof obj.id === 'string' ? obj.id : ''
  if (!id) return fail('invalid_args', 'Missing message id')
  try {
    const success = await modifyGmailMessageLabels(id, [], ['INBOX'])
    if (success) {
      updateThreadInCache(id, (t) => ({
        ...t,
        labels: (t.labels ?? []).filter((l) => l !== 'INBOX'),
      }))
    }
    return ok({ success })
  } catch (err) {
    return fail('mail_archive_failed', err instanceof Error ? err.message : 'unknown')
  }
}

async function handleMailTrash(_event: any, args: unknown): Promise<IpcResult<{ success: boolean }>> {
  const obj = args && typeof args === 'object' ? (args as Record<string, unknown>) : {}
  const id = typeof obj.id === 'string' ? obj.id : ''
  if (!id) return fail('invalid_args', 'Missing message id')
  try {
    const success = await trashGmailMessage(id)
    if (success) {
      updateThreadInCache(id, (t) => ({
        ...t,
        labels: Array.from(new Set([...(t.labels ?? []), 'TRASH'])),
      }))
    }
    return ok({ success })
  } catch (err) {
    return fail('mail_trash_failed', err instanceof Error ? err.message : 'unknown')
  }
}

async function handleMailSearch(_event: any, args: unknown): Promise<IpcResult<MailThread[]>> {
  const obj = args && typeof args === 'object' ? (args as Record<string, unknown>) : {}
  const query = typeof obj.query === 'string' ? obj.query.trim() : ''
  const folder = typeof obj.folder === 'string' ? obj.folder : 'inbox'
  if (!query) return ok([])

  try {
    let ids: Array<{ id: string; threadId: string }> = []
    if (folder === 'inbox') {
      const res = await listInboxMessageIds(50, undefined, query)
      ids = res.messages
    } else {
      const res = await listFolderMessageIds(folder as any, 50, undefined, query)
      ids = res.messages
    }

    if (ids.length === 0) return ok([])

    const cachedThreads = loadMetadata()
    const cacheMap = new Map(cachedThreads.map((t) => [t.id, t]))

    const threadCategories = getThreadCategories()
    const categories = getTriageCategories()

    const threadsToFetch: typeof ids = []
    const resolvedThreads: MailThread[] = []

    for (const item of ids) {
      const cached = cacheMap.get(item.id)
      if (cached) {
        const catId = threadCategories[cached.threadId] || threadCategories[cached.id]
        const matchedCat = catId ? categories.find((c) => c.id === catId) : null
        cached.category = matchedCat ? matchedCat.name : null
        cached.categoryColor = matchedCat ? matchedCat.color : null
        resolvedThreads.push(cached)
      } else {
        threadsToFetch.push(item)
      }
    }

    let newFetchedThreads: MailThread[] = []
    if (threadsToFetch.length > 0) {
      const CONCURRENCY = 8
      const mapWithConcurrency = async <T, R>(
        items: T[],
        limit: number,
        fn: (item: T, index: number) => Promise<R>
      ): Promise<R[]> => {
        const results: R[] = new Array(items.length)
        let next = 0
        const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
          while (true) {
            const i = next++
            if (i >= items.length) return
            results[i] = await fn(items[i]!, i)
          }
        })
        await Promise.all(workers)
        return results
      }

      const messagesMetadata = await mapWithConcurrency(threadsToFetch, CONCURRENCY, async ({ id }) => {
        try {
          return await getMessageMetadata(id)
        } catch (err) {
          if (err instanceof GmailApiError) return null
          throw err
        }
      })

      const triage = require('./ai/triage')
      const { getThreadCategories, getTriageCategories } = triage

      const threadCategories = getThreadCategories()
      const categories = getTriageCategories()

      for (const msg of messagesMetadata) {
        if (!msg) continue
        const headers = msg.payload?.headers
        const sender = parseSender(getHeader(headers, 'From'))
        const subject = getHeader(headers, 'Subject') ?? '(no subject)'

        const catId = threadCategories[msg.threadId] || threadCategories[msg.id]
        const matchedCat = catId ? categories.find((c: any) => c.id === catId) : null
        const category = matchedCat ? matchedCat.name : null
        const categoryColor = matchedCat ? matchedCat.color : null

        newFetchedThreads.push({
          id: msg.id,
          threadId: msg.threadId,
          from: sender.name || sender.email,
          fromEmail: sender.email,
          subject,
          preview: msg.snippet ?? '',
          receivedAt: receivedAtIso(msg),
          unread: isUnread(msg),
          starred: isStarred(msg),
          labels: msg.labelIds ?? [],
          category,
          categoryColor,
        })
      }

      if (newFetchedThreads.length > 0) {
        const updated = [...cachedThreads]
        for (const t of newFetchedThreads) {
          if (!updated.some((x) => x.id === t.id)) {
            updated.push(t)
          }
        }
        saveMetadata(updated)
      }
    }

    const threads = [...resolvedThreads, ...newFetchedThreads]
    threads.sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1))
    return ok(threads)
  } catch (err) {
    return fail('mail_search_failed', err instanceof Error ? err.message : 'unknown')
  }
}

async function handleAiSearch(_event: any, args: unknown): Promise<IpcResult<MailThread[]>> {
  const obj = args && typeof args === 'object' ? (args as Record<string, unknown>) : {}
  const query = typeof obj.query === 'string' ? obj.query : ''
  try {
    const res = await semanticSearchEmails(query)
    return ok(res)
  } catch (err) {
    return fail('ai_search_failed', err instanceof Error ? err.message : 'unknown')
  }
}

async function handleTriageGetRules(): Promise<IpcResult<{ rules: string }>> {
  try {
    return ok({ rules: getTriageRules() })
  } catch (err) {
    return fail('triage_get_failed', err instanceof Error ? err.message : 'unknown')
  }
}

async function handleTriageSetRules(_event: any, args: unknown): Promise<IpcResult<{ rules: string }>> {
  const obj = args && typeof args === 'object' ? (args as Record<string, unknown>) : {}
  const rules = typeof obj.rules === 'string' ? obj.rules : ''
  try {
    return ok({ rules: setTriageRules(rules) })
  } catch (err) {
    return fail('triage_set_failed', err instanceof Error ? err.message : 'unknown')
  }
}

async function handleTriageGetCategories(): Promise<IpcResult<{ categories: TriageCategory[] }>> {
  try {
    return ok({ categories: getTriageCategories() })
  } catch (err) {
    return fail('triage_categories_get_failed', err instanceof Error ? err.message : 'unknown')
  }
}

async function handleTriageSetCategories(_event: any, args: unknown): Promise<IpcResult<{ categories: TriageCategory[] }>> {
  const obj = args && typeof args === 'object' ? (args as Record<string, unknown>) : {}
  const categories = Array.isArray(obj.categories) ? (obj.categories as TriageCategory[]) : []
  try {
    return ok({ categories: setTriageCategories(categories) })
  } catch (err) {
    return fail('triage_categories_set_failed', err instanceof Error ? err.message : 'unknown')
  }
}

async function handleTriageRetroactive(_event: any, _args: unknown): Promise<IpcResult<{ success: boolean }>> {
  try {
    // Dynamically fetch the recent 15 threads from Gmail on the main process
    const inbox = await listInboxThreads(15)
    void triageIncomingEmailsRetroactive(inbox.threads).catch((err) => console.error('Retroactive triage background run failed:', err))

    // Trigger Telegram smart triage retroactively for testing!
    void (async () => {
      try {
        const persona = readPersona()
        const hasTelegram = persona.telegramEnabled && persona.telegramBotToken && persona.telegramChatId
        if (!hasTelegram) return

        // Force evaluate top 5 threads for instant testing, ignoring triaged list!
        const candidateThreads = inbox.threads.slice(0, 5)
        for (const t of candidateThreads) {
          const full = await getThreadFull(t.id)
          if (full && full.body) {
            await evaluateAndTriageNewEmail(t, full.body)
          }
        }
      } catch (err) {
        console.error('Retroactive Telegram triage failed:', err)
      }
    })()

    return ok({ success: true })
  } catch (err) {
    return fail('triage_retroactive_failed', err instanceof Error ? err.message : 'unknown')
  }
}

async function handleCalendarDetect(
  _event: any,
  args: unknown,
): Promise<IpcResult<CalendarEventDetails>> {
  const obj = args && typeof args === 'object' ? (args as Record<string, unknown>) : {}
  const body = typeof obj.body === 'string' ? obj.body : ''
  const subject = typeof obj.subject === 'string' ? obj.subject : ''

  if (!body.trim()) return ok({ detected: false })

  const currentLocalTime = new Date().toString()
  const systemPrompt = `You are a professional assistant designed to detect meetings, events, appointments, or scheduling schedules inside email bodies.
Analyze the email content and decide if there is an invitation, proposed meeting, scheduled call, or calendar appointment mentioned.

## CURRENT LOCAL TIME
Current local time is: ${currentLocalTime}
Use this as the baseline to compute absolute calendar dates. For example:
- "tomorrow at 3 PM" when today is Tuesday May 27, means Wednesday May 28 at 15:00:00.
- "this Friday" means the upcoming Friday relative to May 27.
- "next Monday" means the Monday of next week.

## EXTRACTION RULES
If a scheduling/event IS detected:
1. Set "detected": true
2. Set "title": the name or subject of the meeting/discussion (e.g. "Frontend Interview Loop" or "MedTech Sync").
3. Set "date": the human-readable date (e.g. "Friday, May 29, 2026").
4. Set "time": the human-readable local time (e.g. "3:00 PM").
5. Set "duration": the estimated duration of the event (e.g. "30 minutes", "1 hour"), defaulting to "30 minutes" if not specified.
6. Set "organizer": the name of the meeting organizer or sender, if apparent.
7. Set "description": a concise 1-sentence summary of the context (e.g. "Project updates and PSUR graph code review").
8. Set "rawIsoStart": the absolute, computed ISO 8601 string of the start time (e.g., "2026-05-29T15:00:00"). Ensure it is local timezone format without the Z offset or in proper ISO format.
9. Set "rawIsoEnd": the absolute, computed ISO 8601 string of the end time (e.g., "2026-05-29T15:30:00"), based on start time and duration.

If NO calendar event, proposal, or schedule is mentioned:
1. Set "detected": false

You MUST respond with a single valid JSON object containing these keys. Do not include markdown code block syntax (like \`\`\`json) or conversational text.
`

  try {
    const res = await fetch(`${API_BASE_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(await authHeaders()),
      },
      body: JSON.stringify({
        system: systemPrompt,
        messages: [{ role: 'user', content: `Subject: ${subject}\n\nEmail Body:\n${body}` }],
        stream: true,
      }),
    })

    if (!res.ok) return ok({ detected: false })

    const reader = res.body?.getReader()
    if (!reader) return ok({ detected: false })

    const decoder = new TextDecoder()
    let accumulatedText = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      accumulatedText += decoder.decode(value, { stream: true })
    }

    const lines = accumulatedText.split('\n')
    let jsonText = ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('data:')) {
        try {
          const parsed = JSON.parse(trimmed.slice(5).trim())
          if (parsed.type === 'text_delta' && parsed.text) {
            jsonText += parsed.text
          }
        } catch {
          // ignore
        }
      }
    }

    const cleanedJson = jsonText.replace(/```json/g, '').replace(/```/g, '').trim()
    const result = JSON.parse(cleanedJson) as CalendarEventDetails
    return ok(result)
  } catch (err) {
    console.error('Calendar detection failed:', err)
    return ok({ detected: false })
  }
}

async function handleCalendarIcsExport(
  _event: any,
  args: unknown,
): Promise<IpcResult<{ success: boolean }>> {
  const obj = args && typeof args === 'object' ? (args as Record<string, unknown>) : {}
  const title = typeof obj.title === 'string' ? obj.title : 'Event'
  const startIso = typeof obj.startIso === 'string' ? obj.startIso : ''
  const endIso = typeof obj.endIso === 'string' ? obj.endIso : ''
  const description = typeof obj.description === 'string' ? obj.description : ''

  if (!startIso || !endIso) return fail('invalid_args', 'Missing start or end ISO timestamps')

  const formatIcsDate = (iso: string) => {
    const cleaned = iso.split('.')[0] || iso
    return cleaned.replace(/[-:]/g, '')
  }

  const icsStart = formatIcsDate(startIso)
  const icsEnd = formatIcsDate(endIso)

  const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//QuikMail AI//Calendar Export//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
SUMMARY:${title}
DTSTART:${icsStart}
DTEND:${icsEnd}
DESCRIPTION:${description}
STATUS:CONFIRMED
SEQUENCE:0
END:VEVENT
END:VCALENDAR`

  try {
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Export Calendar Event',
      defaultPath: `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.ics`,
      filters: [{ name: 'iCalendar files', extensions: ['ics'] }],
    })

    if (canceled || !filePath) return ok({ success: false })

    writeFileSync(filePath, icsContent, 'utf-8')
    return ok({ success: true })
  } catch (err) {
    return fail('ics_export_failed', err instanceof Error ? err.message : 'unknown')
  }
}

async function handleAuditLogGet(): Promise<IpcResult<any[]>> {
  try {
    return ok(getAuditLogs())
  } catch (err) {
    return fail('audit_log_get_failed', err instanceof Error ? err.message : 'unknown')
  }
}

async function handleKnowledgeRetrieve(
  _event: any,
  args: unknown,
): Promise<IpcResult<RetrievedChunk[]>> {
  if (!args || typeof args !== 'object') {
    return fail('invalid_input', 'Expected { prompt }')
  }
  const obj = args as Record<string, unknown>
  const prompt = typeof obj.prompt === 'string' ? obj.prompt.trim() : ''
  const documentIds = Array.isArray(obj.documentIds) ? (obj.documentIds as string[]) : undefined

  if (prompt.length === 0) {
    return ok([])
  }

  try {
    let chunks = await retrieveForQuery(prompt, 6)
    if (documentIds) {
      chunks = chunks.filter((c) => documentIds.includes(c.docId))
    }
    return ok(chunks)
  } catch (err) {
    return fail('knowledge_retrieve_failed', err instanceof Error ? err.message : 'unknown')
  }
}

const HANDLERS: Record<IpcChannel, (event: any, ...args: unknown[]) => Promise<IpcResult<unknown>>> = {
  'auth:status': (_e) => handleAuthStatus(),
  'auth:google:start': (_e) => handleGoogleStart(),
  'auth:google:disconnect': (_e) => handleGoogleDisconnect(),
  'theme:get': (_e) => handleThemeGet(),
  'theme:set': (_e, next) => handleThemeSet(next),
  'mail:list:inbox': (_e, args) => handleMailListInbox(args),
  'mail:list:folder': (_e, args) => handleMailListFolder(args),
  'mail:get': (_e, id) => handleMailGet(id),
  'ai:info': (_e) => handleAiInfo(),
  'ai:persona:get': (_e) => handlePersonaGet(),
  'ai:persona:set': (_e, next) => handlePersonaSet(next),
  'ai:doc:add': (_e, input) => handleDocAdd(input),
  'ai:doc:remove': (_e, id) => handleDocRemove(id),
  'ai:knowledge:retrieve': (event, args) => handleKnowledgeRetrieve(event, args),
  'ai:stream': (event, args) => handleAiStream(event, args),
  'mail:draft:create': (event, args) => handleMailDraftCreate(event, args),
  'mail:send:direct': (event, args) => handleMailSendDirect(event, args),
  'mail:draft:send': (event, args) => handleMailDraftSend(event, args),
  'mail:star': (event, args) => handleMailStar(event, args),
  'mail:unstar': (event, args) => handleMailUnstar(event, args),
  'mail:archive': (event, args) => handleMailArchive(event, args),
  'mail:trash': (event, args) => handleMailTrash(event, args),
  'mail:search': (event, args) => handleMailSearch(event, args),
  'ai:search': (event, args) => handleAiSearch(event, args),
  'ai:triage:get_rules': (_event) => handleTriageGetRules(),
  'ai:triage:set_rules': (event, args) => handleTriageSetRules(event, args),
  'ai:categories:get': (_event) => handleTriageGetCategories(),
  'ai:categories:set': (event, args) => handleTriageSetCategories(event, args),
  'ai:triage:retroactive': (event, args) => handleTriageRetroactive(event, args),
  'ai:calendar:detect': (event, args) => handleCalendarDetect(event, args),
  'ai:calendar:ics_export': (event, args) => handleCalendarIcsExport(event, args),
  'ai:audit_log:get': (_event) => handleAuditLogGet(),
  'file:parse': (event, args) => handleFileParse(event, args),
}

async function handleFileParse(_event: any, args: unknown): Promise<IpcResult<{ text?: string; base64Data?: string }>> {
  try {
    const obj = args && typeof args === 'object' ? (args as Record<string, unknown>) : {}
    const path = typeof obj.path === 'string' ? obj.path : ''
    const mimeType = typeof obj.mimeType === 'string' ? obj.mimeType : ''
    const pdfBase64 = typeof obj.pdfBase64 === 'string' ? obj.pdfBase64 : undefined

    if (pdfBase64) {
      try {
        const buffer = Buffer.from(pdfBase64, 'base64')
        const parsedText = await parsePdfBuffer(buffer)
        return ok({ text: parsedText })
      } catch (err) {
        return fail('pdf_parse_failed', err instanceof Error ? err.message : 'Unknown PDF parsing error')
      }
    }

    if (!path) {
      return fail('invalid_input', 'File path is required')
    }

    const fs = require('node:fs')
    if (!fs.existsSync(path)) {
      return fail('not_found', `File does not exist: ${path}`)
    }

    if (path.toLowerCase().endsWith('.pdf')) {
      try {
        const buffer = fs.readFileSync(path)
        const parsedText = await parsePdfBuffer(buffer)
        return ok({ text: parsedText })
      } catch (err) {
        return fail('pdf_parse_failed', err instanceof Error ? err.message : 'Unknown PDF parsing error')
      }
    }

    const isImage = mimeType.startsWith('image/') || 
      /\.(png|jpe?g|webp|gif|svg)$/i.test(path)

    if (isImage) {
      const base64 = fs.readFileSync(path, 'base64')
      const activeMime = mimeType || (path.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : 'image/png')
      return ok({ base64Data: `data:${activeMime};base64,${base64}` })
    }

    // Default to text parsing
    const text = fs.readFileSync(path, 'utf8')
    return ok({ text })
  } catch (err) {
    return fail('file_parse_error', err instanceof Error ? err.message : String(err))
  }
}

export function registerIpc(): void {
  for (const [channel, handler] of Object.entries(HANDLERS)) {
    ipcMain.handle(channel, (event, ...args) => handler(event, ...args))
  }
}
