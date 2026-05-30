import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

type StoredChunk = {
  docId: string
  index: number
  text: string
  vector: number[]
}

type FileShape = {
  version: 1
  chunks: StoredChunk[]
}

function storePath(): string {
  const dir = join(app.getPath('userData'), 'ai')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'vectors.json')
}

let cache: FileShape | null = null

function load(): FileShape {
  if (cache) return cache
  const path = storePath()
  if (!existsSync(path)) {
    cache = { version: 1, chunks: [] }
    return cache
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as FileShape
    if (raw && raw.version === 1 && Array.isArray(raw.chunks)) {
      cache = raw
      return cache
    }
  } catch {
    // fall through to fresh state
  }
  cache = { version: 1, chunks: [] }
  return cache
}

function persist(): void {
  if (!cache) return
  writeFileSync(storePath(), JSON.stringify(cache), 'utf8')
}

export function insertChunks(
  docId: string,
  chunks: Array<{ text: string; vector: number[] }>,
): void {
  const state = load()
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]
    if (!c) continue
    state.chunks.push({ docId, index: i, text: c.text, vector: c.vector })
  }
  persist()
}

export function removeDocChunks(docId: string): void {
  const state = load()
  state.chunks = state.chunks.filter((c) => c.docId !== docId)
  persist()
}

export function clearAll(): void {
  cache = { version: 1, chunks: [] }
  persist()
}

function cosine(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const va = a[i]!
    const vb = b[i]!
    dot += va * vb
    normA += va * va
    normB += vb * vb
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export type RetrievedChunk = {
  docId: string
  text: string
  score: number
}

export function topK(query: number[], k: number): RetrievedChunk[] {
  const state = load()
  if (state.chunks.length === 0) return []
  const scored = state.chunks.map((c) => ({
    docId: c.docId,
    text: c.text,
    score: cosine(query, c.vector),
  }))
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, k)
}

export function chunkCountFor(docId: string): number {
  return load().chunks.filter((c) => c.docId === docId).length
}

export function docExists(docId: string): boolean {
  return load().chunks.some((c) => c.docId === docId)
}

