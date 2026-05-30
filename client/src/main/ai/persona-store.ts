import type { AiDocument, AiPersona, TonePreset } from '../../shared/ai'
import { PERSONA_LIMITS } from '../../shared/ai'
import { readSecret, writeSecret } from '../secure-store'

const SECRET_NAME = 'ai-persona'

const ALLOWED_TONES: ReadonlyArray<TonePreset> = ['concise', 'friendly', 'formal']

function sanitize(input: unknown): AiPersona {
  if (!input || typeof input !== 'object') return {}
  const o = input as Record<string, unknown>
  const out: AiPersona = {}

  if (typeof o.aboutMe === 'string') {
    out.aboutMe = o.aboutMe.slice(0, PERSONA_LIMITS.aboutMeMax)
  }
  if (typeof o.signature === 'string') {
    out.signature = o.signature.slice(0, PERSONA_LIMITS.signatureMax)
  }
  if (typeof o.tonePreset === 'string' && ALLOWED_TONES.includes(o.tonePreset as TonePreset)) {
    out.tonePreset = o.tonePreset as TonePreset
  }
  if (Array.isArray(o.documents)) {
    out.documents = (o.documents as unknown[])
      .map((d) => sanitizeDoc(d))
      .filter((d): d is AiDocument => d !== null)
      .slice(0, PERSONA_LIMITS.docCountMax)
  }

  // WhatsApp Sanitization
  out.whatsappEnabled = typeof o.whatsappEnabled === 'boolean' ? o.whatsappEnabled : false
  if (typeof o.whatsappPhone === 'string') {
    out.whatsappPhone = o.whatsappPhone.trim()
  }
  if (typeof o.whatsappApiKey === 'string') {
    out.whatsappApiKey = o.whatsappApiKey.trim()
  }

  // Telegram Sanitization
  out.telegramEnabled = typeof o.telegramEnabled === 'boolean' ? o.telegramEnabled : false
  if (typeof o.telegramBotToken === 'string') {
    out.telegramBotToken = o.telegramBotToken.trim()
  }
  if (typeof o.telegramChatId === 'string') {
    out.telegramChatId = o.telegramChatId.trim()
  }

  return out
}

function sanitizeDoc(input: unknown): AiDocument | null {
  if (!input || typeof input !== 'object') return null
  const o = input as Record<string, unknown>
  if (typeof o.id !== 'string' || o.id.length === 0) return null
  if (typeof o.name !== 'string' || o.name.length === 0) return null
  if (o.source !== 'paste' && o.source !== 'upload') return null
  if (typeof o.addedAt !== 'number') return null
  if (typeof o.chunkCount !== 'number') return null
  if (typeof o.charCount !== 'number') return null
  return {
    id: o.id,
    name: o.name.slice(0, PERSONA_LIMITS.docNameMax),
    source: o.source,
    addedAt: o.addedAt,
    chunkCount: o.chunkCount,
    charCount: o.charCount,
  }
}

export function getPersona(): AiPersona {
  return readSecret<AiPersona>(SECRET_NAME) ?? {}
}

export function setPersona(next: unknown): AiPersona {
  const clean = sanitize(next)
  writeSecret(SECRET_NAME, clean)
  return clean
}

export function upsertDocument(doc: AiDocument): AiPersona {
  const current = getPersona()
  const docs = (current.documents ?? []).filter((d) => d.id !== doc.id)
  docs.push(doc)
  const next: AiPersona = { ...current, documents: docs }
  return setPersona(next)
}

export function removeDocument(docId: string): AiPersona {
  const current = getPersona()
  const docs = (current.documents ?? []).filter((d) => d.id !== docId)
  const next: AiPersona = { ...current, documents: docs }
  return setPersona(next)
}
