import type { GmailHeader, GmailMessage } from './gmail'

export type ParsedSender = { name: string; email: string }

export function getHeader(headers: GmailHeader[] | undefined, name: string): string | undefined {
  if (!headers) return undefined
  const lower = name.toLowerCase()
  return headers.find((h) => h.name.toLowerCase() === lower)?.value
}

export function parseSender(raw: string | undefined): ParsedSender {
  if (!raw) return { name: '', email: '' }
  const match = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
  if (match) return { name: match[1]?.trim() ?? '', email: match[2]?.trim() ?? '' }
  return { name: '', email: raw.trim() }
}

export function isUnread(msg: GmailMessage): boolean {
  return (msg.labelIds ?? []).includes('UNREAD')
}

export function isStarred(msg: GmailMessage): boolean {
  return (msg.labelIds ?? []).includes('STARRED')
}

function base64UrlDecode(data: string): string {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(normalized, 'base64').toString('utf8')
}

function collectParts(part: GmailMessage['payload'] | undefined, into: GmailMessage['payload'][]): void {
  if (!part) return
  into.push(part)
  for (const child of part.parts ?? []) collectParts(child, into)
}

export function extractPlainBody(msg: GmailMessage): string {
  const all: GmailMessage['payload'][] = []
  collectParts(msg.payload, all)
  const plain = all.find((p) => p?.mimeType === 'text/plain' && p.body?.data)
  if (plain?.body?.data) return base64UrlDecode(plain.body.data)
  const html = all.find((p) => p?.mimeType === 'text/html' && p.body?.data)
  if (html?.body?.data) {
    return base64UrlDecode(html.body.data).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  }
  return msg.snippet ?? ''
}

export function extractHtmlBody(msg: GmailMessage): string | null {
  const all: GmailMessage['payload'][] = []
  collectParts(msg.payload, all)
  const html = all.find((p) => p?.mimeType === 'text/html' && p.body?.data)
  if (html?.body?.data) return base64UrlDecode(html.body.data)
  return null
}

export function receivedAtIso(msg: GmailMessage): string {
  if (msg.internalDate) return new Date(Number(msg.internalDate)).toISOString()
  return new Date().toISOString()
}
