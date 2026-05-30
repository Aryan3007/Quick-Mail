import { getValidAccessToken } from '../auth/google'

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'

export class GmailApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

async function gmailFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = await getValidAccessToken()
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new GmailApiError(`Gmail API ${res.status} ${path}: ${text}`, res.status)
  }
  return (await res.json()) as T
}

export type GmailListResponse = {
  messages?: Array<{ id: string; threadId: string }>
  nextPageToken?: string
  resultSizeEstimate?: number
}

export type GmailHeader = { name: string; value: string }

export type GmailMessage = {
  id: string
  threadId: string
  labelIds?: string[]
  snippet?: string
  internalDate?: string
  payload?: {
    headers?: GmailHeader[]
    mimeType?: string
    body?: { data?: string; size?: number }
    parts?: GmailMessage['payload'][]
  }
  sizeEstimate?: number
}

export async function listInboxMessageIds(
  maxResults: number,
  pageToken?: string,
  q?: string,
): Promise<{ messages: Array<{ id: string; threadId: string }>; nextPageToken?: string }> {
  const params = new URLSearchParams({
    labelIds: 'INBOX',
    maxResults: String(maxResults),
  })
  if (pageToken) params.set('pageToken', pageToken)
  if (q) params.set('q', q)
  const json = await gmailFetch<GmailListResponse>(`/messages?${params.toString()}`)
  return {
    messages: json.messages ?? [],
    ...(json.nextPageToken ? { nextPageToken: json.nextPageToken } : {}),
  }
}

const FOLDER_LABEL_MAP: Record<string, string> = {
  sent: 'SENT',
  drafts: 'DRAFT',
  trash: 'TRASH',
  spam: 'SPAM',
  starred: 'STARRED',
  archive: '-INBOX', // archived = not in INBOX and not in TRASH (we'll handle via a special query)
}

export async function listFolderMessageIds(
  folder: 'sent' | 'drafts' | 'trash' | 'spam' | 'starred' | 'archive',
  maxResults: number,
  pageToken?: string,
  q?: string,
): Promise<{ messages: Array<{ id: string; threadId: string }>; nextPageToken?: string }> {
  const params = new URLSearchParams({
    maxResults: String(maxResults),
  })
  
  let finalQ = q || ''
  if (folder === 'archive') {
    // Archived = has no INBOX label and not in TRASH — search for it
    const archiveQuery = '-in:inbox -in:trash -in:spam -in:sent'
    finalQ = finalQ ? `${archiveQuery} ${finalQ}` : archiveQuery
  } else {
    params.set('labelIds', FOLDER_LABEL_MAP[folder] ?? 'INBOX')
  }
  
  if (finalQ) {
    params.set('q', finalQ)
  }
  
  // CRITICAL: Include spam and trash so those folders actually populate with emails!
  params.set('includeSpamTrash', 'true')

  if (pageToken) params.set('pageToken', pageToken)
  const json = await gmailFetch<GmailListResponse>(`/messages?${params.toString()}`)
  return {
    messages: json.messages ?? [],
    ...(json.nextPageToken ? { nextPageToken: json.nextPageToken } : {}),
  }
}

export async function getMessageMetadata(id: string): Promise<GmailMessage> {
  const params = new URLSearchParams({
    format: 'metadata',
    metadataHeaders: 'From',
  })
  params.append('metadataHeaders', 'To')
  params.append('metadataHeaders', 'Subject')
  params.append('metadataHeaders', 'Date')
  return gmailFetch<GmailMessage>(`/messages/${id}?${params.toString()}`)
}

export async function getMessageFull(id: string): Promise<GmailMessage> {
  return gmailFetch<GmailMessage>(`/messages/${id}?format=full`)
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function buildMimeMessage(
  to: string,
  subject: string,
  bodyTextOrHtml: string,
  threadId?: string,
  attachments?: Array<{ name: string; mimeType: string; base64Data: string }>
): string {
  // If the body is plain text, convert it to standard HTML with paragraph spacing and custom line breaks
  const isHtml = /<[a-z][\s\S]*>/i.test(bodyTextOrHtml)
  const bodyHtml = isHtml 
    ? bodyTextOrHtml 
    : `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1a1a1a; white-space: pre-wrap;">${escapeHtml(bodyTextOrHtml)}</div>`

  if (!attachments || attachments.length === 0) {
    const parts = [
      `To: ${to}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=utf-8`,
    ]
    parts.push('', bodyHtml)
    return parts.join('\r\n')
  }

  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`

  const parts = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    `Content-Transfer-Encoding: 7bit`,
    '',
    bodyHtml
  ]

  for (const att of attachments) {
    let rawBase64 = att.base64Data
    if (rawBase64.includes(';base64,')) {
      rawBase64 = rawBase64.split(';base64,')[1]
    }
    rawBase64 = rawBase64.replace(/\s/g, '')

    parts.push(
      `--${boundary}`,
      `Content-Type: ${att.mimeType}; name="${att.name}"`,
      `Content-Disposition: attachment; filename="${att.name}"`,
      `Content-Transfer-Encoding: base64`,
      '',
      rawBase64
    )
  }

  parts.push(`--${boundary}--`, '')
  return parts.join('\r\n')
}

export async function createGmailDraft(
  to: string,
  subject: string,
  bodyHtml: string,
  threadId?: string,
  attachments?: Array<{ name: string; mimeType: string; base64Data: string }>
): Promise<{ id: string; threadId: string }> {
  const mime = buildMimeMessage(to, subject, bodyHtml, threadId, attachments)
  const raw = Buffer.from(mime).toString('base64url')

  const res = await gmailFetch<{ id: string; message: { id: string; threadId: string } }>('/drafts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        threadId,
        raw,
      },
    }),
  })
  return { id: res.id, threadId: res.message.threadId }
}

export async function sendGmailMessageDirect(
  to: string,
  subject: string,
  bodyHtml: string,
  threadId?: string,
  attachments?: Array<{ name: string; mimeType: string; base64Data: string }>
): Promise<{ id: string; threadId: string }> {
  const mime = buildMimeMessage(to, subject, bodyHtml, threadId, attachments)
  const raw = Buffer.from(mime).toString('base64url')

  const res = await gmailFetch<{ id: string; threadId: string }>('/messages/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      threadId,
      raw,
    }),
  })
  return { id: res.id, threadId: res.threadId }
}

export async function sendGmailDraft(draftId: string): Promise<boolean> {
  await gmailFetch<{ id: string }>(`/drafts/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: draftId,
    }),
  })
  return true
}

export async function modifyGmailMessageLabels(
  id: string,
  addLabelIds: string[],
  removeLabelIds: string[],
): Promise<boolean> {
  await gmailFetch<{ id: string }>(`/messages/${id}/modify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      addLabelIds,
      removeLabelIds,
    }),
  })
  return true
}

export async function trashGmailMessage(id: string): Promise<boolean> {
  await gmailFetch<{ id: string }>(`/messages/${id}/trash`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  })
  return true
}

