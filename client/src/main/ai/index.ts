import { randomBytes } from 'node:crypto'

import type { AiDocument, AiPersona } from '../../shared/ai'
import type { MailThread } from '../../shared/mail'
import { PERSONA_LIMITS } from '../../shared/ai'
import { chunkText } from './chunker'
import { embedTexts } from './embedder'
import { getPersona, removeDocument, setPersona, upsertDocument } from './persona-store'
import { insertChunks, removeDocChunks, topK, docExists, type RetrievedChunk } from './vector-store'

export { EmbeddingError } from './embedder'

export type AddDocumentInput = {
  name: string
  text: string
  source: 'paste' | 'upload'
}

function newDocId(): string {
  return `doc_${randomBytes(8).toString('hex')}`
}

export function readPersona(): AiPersona {
  return getPersona()
}

export function writePersona(next: unknown): AiPersona {
  return setPersona(next)
}

export async function addDocument(input: AddDocumentInput): Promise<AiDocument> {
  const text = input.text.trim()
  if (text.length === 0) throw new Error('document_empty')
  if (text.length > PERSONA_LIMITS.docCharMax) {
    throw new Error(
      `document_too_large (max ${PERSONA_LIMITS.docCharMax.toLocaleString()} chars)`,
    )
  }
  const current = getPersona()
  if ((current.documents?.length ?? 0) >= PERSONA_LIMITS.docCountMax) {
    throw new Error(`document_limit_reached (max ${PERSONA_LIMITS.docCountMax})`)
  }

  const chunks = chunkText(text)
  if (chunks.length === 0) throw new Error('document_no_chunks')

  const vectors = await embedTexts(chunks)
  if (vectors.length !== chunks.length) {
    throw new Error(
      `embedding_count_mismatch (chunks=${chunks.length} vectors=${vectors.length})`,
    )
  }

  const docId = newDocId()
  insertChunks(
    docId,
    chunks.map((text, i) => ({ text, vector: vectors[i]! })),
  )

  const doc: AiDocument = {
    id: docId,
    name: input.name.slice(0, PERSONA_LIMITS.docNameMax),
    source: input.source,
    addedAt: Date.now(),
    chunkCount: chunks.length,
    charCount: text.length,
  }
  upsertDocument(doc)
  return doc
}

export function deleteDocument(docId: string): AiPersona {
  removeDocChunks(docId)
  return removeDocument(docId)
}

export async function retrieveForQuery(query: string, k = 6): Promise<RetrievedChunk[]> {
  if (!query.trim()) return []
  const [queryVec] = await embedTexts([query])
  if (!queryVec) return []
  return topK(queryVec, k)
}

function metadataPath(): string {
  const join = require('node:path').join
  const app = require('electron').app
  return join(app.getPath('userData'), 'ai', 'indexed_threads.json')
}

export function loadMetadata(): MailThread[] {
  const fs = require('node:fs')
  const path = metadataPath()
  const dir = require('node:path').dirname(path)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  if (!fs.existsSync(path)) return []
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8')) as MailThread[]
  } catch {
    return []
  }
}

export function saveMetadata(threads: MailThread[]): void {
  const fs = require('node:fs')
  const path = metadataPath()
  const dir = require('node:path').dirname(path)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path, JSON.stringify(threads), 'utf8')
}

export function updateThreadInCache(
  id: string,
  updates: Partial<MailThread> | ((t: MailThread) => MailThread)
): void {
  try {
    const cached = loadMetadata()
    let changed = false
    const updated = cached.map((t) => {
      if (t.id === id) {
        changed = true
        const next = typeof updates === 'function' ? updates(t) : { ...t, ...updates }
        return next
      }
      return t
    })
    if (changed) {
      saveMetadata(updated)
    }
  } catch (err) {
    console.error('Failed to update thread in cache:', err)
  }
}

export async function indexEmailThreads(threads: MailThread[]): Promise<void> {
  const toIndex: MailThread[] = []
  
  for (const t of threads) {
    if (!docExists(`email_${t.id}`)) {
      toIndex.push(t)
    }
  }

  if (toIndex.length === 0) return

  const texts = toIndex.map(
    (t) => `Subject: ${t.subject} | From: ${t.from} <${t.fromEmail}> | Preview: ${t.preview}`,
  )

  try {
    const vectors = await embedTexts(texts)
    if (vectors.length !== toIndex.length) return

    for (let i = 0; i < toIndex.length; i++) {
      const thread = toIndex[i]!
      const vec = vectors[i]!
      insertChunks(`email_${thread.id}`, [{ text: texts[i]!, vector: vec }])
    }

    const cached = loadMetadata()
    const updated = [...cached]
    for (const t of toIndex) {
      if (!updated.some((x) => x.id === t.id)) {
        updated.push(t)
      }
    }
    saveMetadata(updated)
  } catch (err) {
    console.error('Failed to index email threads:', err)
  }
}

export async function semanticSearchEmails(query: string): Promise<MailThread[]> {
  if (!query.trim()) return []
  const [queryVec] = await embedTexts([query])
  if (!queryVec) return []

  const matches = topK(queryVec, 20)
  const emailMatches = matches.filter((m) => m.docId.startsWith('email_'))
  if (emailMatches.length === 0) return []

  const cached = loadMetadata()
  const results: MailThread[] = []
  for (const match of emailMatches) {
    const threadId = match.docId.slice(6)
    const found = cached.find((x) => x.id === threadId)
    if (found && !results.some((r) => r.id === found.id)) {
      results.push(found)
    }
  }
  return results
}
