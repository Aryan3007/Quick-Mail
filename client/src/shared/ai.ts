export type TonePreset = 'concise' | 'friendly' | 'formal'

export type AiDocument = {
  id: string
  name: string
  source: 'paste' | 'upload'
  addedAt: number
  chunkCount: number
  charCount: number
}

export type AiPersona = {
  aboutMe?: string
  signature?: string
  tonePreset?: TonePreset
  documents?: AiDocument[]
  whatsappEnabled?: boolean
  whatsappPhone?: string
  whatsappApiKey?: string
  telegramEnabled?: boolean
  telegramBotToken?: string
  telegramChatId?: string
}

export const TONE_PRESETS: ReadonlyArray<{ key: TonePreset; label: string; description: string }> = [
  { key: 'concise', label: 'Concise', description: 'Short, to the point. Minimal pleasantries.' },
  { key: 'friendly', label: 'Friendly', description: 'Warm and conversational.' },
  { key: 'formal', label: 'Formal', description: 'Professional, structured.' },
]

export const PERSONA_LIMITS = {
  aboutMeMax: 4000,
  signatureMax: 500,
  docNameMax: 200,
  docCharMax: 200_000, // per document
  docCountMax: 50,
} as const

export interface TriageCategory {
  id: string
  name: string
  prompt: string
  color: string // HSL color string, e.g. "hsl(142, 60%, 45%)"
}

export interface CalendarEventDetails {
  detected: boolean
  title?: string       // e.g. "MedTech Project Sync"
  date?: string        // e.g. "Friday, May 29, 2026"
  time?: string        // e.g. "3:00 PM"
  duration?: string    // e.g. "30 mins"
  organizer?: string   // e.g. "Aniruddha Patel"
  description?: string // context summary
  rawIsoStart?: string // ISO timestamp for link templating, e.g., "2026-05-29T15:00:00Z"
  rawIsoEnd?: string   // ISO timestamp for link templating, e.g., "2026-05-29T15:30:00Z"
}

export interface RetrievedChunk {
  id: number
  docId: string
  text: string
  score?: number
}

