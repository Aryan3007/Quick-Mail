// Naïve but reasonable chunker:
// - Splits on paragraph boundaries first (double newlines).
// - If a paragraph itself is longer than the target, splits it on sentence boundaries.
// - Merges adjacent chunks until they reach the target size.
// - Adds a small overlap between chunks to preserve context across boundaries.

const TARGET_CHARS = 1800 // ~450 tokens for English text
const OVERLAP_CHARS = 150
const MAX_CHARS = 2400 // hard ceiling so a single chunk never explodes

function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function splitSentences(text: string): string[] {
  // crude sentence splitter — fine for chunking, not for NLP
  return text.split(/(?<=[.!?])\s+(?=[A-Z])/).map((s) => s.trim()).filter(Boolean)
}

function splitLongParagraph(para: string): string[] {
  if (para.length <= MAX_CHARS) return [para]
  const sentences = splitSentences(para)
  const out: string[] = []
  let buf = ''
  for (const s of sentences) {
    if (buf.length + s.length + 1 > MAX_CHARS) {
      if (buf) out.push(buf)
      buf = s
    } else {
      buf = buf ? `${buf} ${s}` : s
    }
  }
  if (buf) out.push(buf)
  return out.length > 0 ? out : [para.slice(0, MAX_CHARS)]
}

export function chunkText(text: string): string[] {
  const paragraphs = splitParagraphs(text).flatMap(splitLongParagraph)
  if (paragraphs.length === 0) return []

  const chunks: string[] = []
  let buf = ''
  for (const para of paragraphs) {
    if (!buf) {
      buf = para
      continue
    }
    if (buf.length + para.length + 2 <= TARGET_CHARS) {
      buf = `${buf}\n\n${para}`
    } else {
      chunks.push(buf)
      const tail = buf.length > OVERLAP_CHARS ? buf.slice(-OVERLAP_CHARS) : ''
      buf = tail ? `${tail}\n\n${para}` : para
    }
  }
  if (buf) chunks.push(buf)
  return chunks
}
