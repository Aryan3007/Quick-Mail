import { GmailApiError, getMessageFull, getMessageMetadata, listInboxMessageIds, listFolderMessageIds } from './gmail'
import {
  extractHtmlBody,
  extractPlainBody,
  getHeader,
  isStarred,
  isUnread,
  parseSender,
  receivedAtIso,
} from './parse'
import type { MailThread } from '../../shared/mail'
import { indexEmailThreads, readPersona, loadMetadata, saveMetadata } from '../ai/index'
import { triageIncomingEmails, getThreadCategories, getTriageCategories } from '../ai/triage'
import { loadTriagedIds, saveTriagedId, evaluateAndTriageNewEmail } from '../whatsapp'

const CONCURRENCY = 8

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
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

export type InboxPage = {
  threads: MailThread[]
  nextPageToken?: string
}

export async function listInboxThreads(
  maxResults: number,
  pageToken?: string,
): Promise<InboxPage> {
  const { messages: ids, nextPageToken } = await listInboxMessageIds(maxResults, pageToken)
  if (ids.length === 0) return { threads: [] }

  const cachedThreads = loadMetadata()
  const cacheMap = new Map(cachedThreads.map(t => [t.id, t]))

  const threadCategories = getThreadCategories()
  const categories = getTriageCategories()

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
    const messages = await mapWithConcurrency(threadsToFetch, CONCURRENCY, async ({ id }) => {
      try {
        return await getMessageMetadata(id)
      } catch (err) {
        if (err instanceof GmailApiError) return null
        throw err
      }
    })

    const threadCategories = getThreadCategories()
    const categories = getTriageCategories()

    for (const msg of messages) {
      if (!msg) continue
      const headers = msg.payload?.headers
      const sender = parseSender(getHeader(headers, 'From'))
      const subject = getHeader(headers, 'Subject') ?? '(no subject)'

      const catId = threadCategories[msg.threadId] || threadCategories[msg.id]
      const matchedCat = catId ? categories.find((c) => c.id === catId) : null
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

  // Index in background vector store asynchronously!
  void indexEmailThreads(threads).catch((err: any) => console.error('BG indexing failed:', err))

  // Run natural language triage on incoming threads!
  void triageIncomingEmails(threads).catch((err: any) => console.error('BG triage failed:', err))

  // Trigger Telegram smart-triage for any un-triaged new threads in the background!
  void (async () => {
    try {
      const persona = readPersona()
      const hasTelegram = persona.telegramEnabled && persona.telegramBotToken && persona.telegramChatId
      if (!hasTelegram) {
        return
      }
      
      const triaged = loadTriagedIds() as Set<string>
      
      // Triage top 3 threads in the page to keep it fast and responsive
      const candidateThreads = threads.slice(0, 3).filter(t => !triaged.has(t.id))
      
      for (const t of candidateThreads) {
        // Mark as triaged immediately to prevent duplicate runs
        saveTriagedId(t.id)
        
        // Fetch full thread body context
        const full = await getThreadFull(t.id)
        if (full && full.body) {
          await evaluateAndTriageNewEmail(t, full.body)
        }
      }
    } catch (err) {
      console.error('Telegram background sync triage failed:', err)
    }
  })()

  return { threads, ...(nextPageToken ? { nextPageToken } : {}) }
}

export async function listFolderThreads(
  folder: 'sent' | 'drafts' | 'trash' | 'spam' | 'starred' | 'archive',
  maxResults: number,
  pageToken?: string,
): Promise<InboxPage> {
  const { messages: ids, nextPageToken } = await listFolderMessageIds(folder, maxResults, pageToken)
  if (ids.length === 0) return { threads: [] }

  const cachedThreads = loadMetadata()
  const cacheMap = new Map(cachedThreads.map(t => [t.id, t]))

  const threadCategories = getThreadCategories()
  const categories = getTriageCategories()

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
    const messages = await mapWithConcurrency(threadsToFetch, CONCURRENCY, async ({ id }) => {
      try {
        return await getMessageMetadata(id)
      } catch (err) {
        if (err instanceof GmailApiError) return null
        throw err
      }
    })

    const threadCategories = getThreadCategories()
    const categories = getTriageCategories()

    for (const msg of messages) {
      if (!msg) continue
      const headers = msg.payload?.headers
      const sender = parseSender(getHeader(headers, 'From'))
      const subject = getHeader(headers, 'Subject') ?? '(no subject)'

      const catId = threadCategories[msg.threadId] || threadCategories[msg.id]
      const matchedCat = catId ? categories.find((c) => c.id === catId) : null
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
  return { threads, ...(nextPageToken ? { nextPageToken } : {}) }
}

export async function getThreadFull(id: string): Promise<{ thread: MailThread; body: string; htmlBody: string | null }> {
  const msg = await getMessageFull(id)
  const headers = msg.payload?.headers
  const sender = parseSender(getHeader(headers, 'From'))
  const subject = getHeader(headers, 'Subject') ?? '(no subject)'
  const body = extractPlainBody(msg)
  const htmlBody = extractHtmlBody(msg)

  const threadCategories = getThreadCategories()
  const categories = getTriageCategories()
  const catId = threadCategories[msg.threadId] || threadCategories[msg.id]
  const matchedCat = catId ? categories.find((c) => c.id === catId) : null
  const category = matchedCat ? matchedCat.name : null
  const categoryColor = matchedCat ? matchedCat.color : null

  return {
    thread: {
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
    },
    body,
    htmlBody,
  }
}
