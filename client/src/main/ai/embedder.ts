import { authHeaders } from '../auth/device'
import { API_BASE_URL } from '../config'

const BATCH_SIZE = 64

type EmbeddingResponse =
  | { ok: true; model: string; vectors: number[][]; usage: { total_tokens: number } }
  | { ok: false; error: { code: string; message: string } }

export class EmbeddingError extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
  }
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  const out: number[][] = []
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    const res = await fetch(`${API_BASE_URL}/v1/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ input: batch }),
    })
    const json = (await res.json()) as EmbeddingResponse
    if (!json.ok) {
      throw new EmbeddingError(json.error.message, json.error.code)
    }
    for (const v of json.vectors) out.push(v)
  }
  return out
}
