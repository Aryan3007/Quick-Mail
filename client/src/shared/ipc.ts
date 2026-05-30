export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } }

export type AuthStatus = {
  hasDevice: boolean
  google:
    | { connected: false }
    | {
        connected: true
        email: string
        name?: string
        picture?: string
        scopes: string[]
        expiresAt: number
      }
}

export type AuthGoogleStartResult = {
  email: string
  name?: string
  picture?: string
}

export type ThemePreference = 'light' | 'dark' | 'system'
export type EffectiveTheme = 'light' | 'dark'

export type ThemeState = {
  preference: ThemePreference
  effective: EffectiveTheme
}

import type { AiDocument, AiPersona, TonePreset, TriageCategory, CalendarEventDetails, RetrievedChunk } from './ai'
import type { MailInboxPage, MailThread } from './mail'

export type IpcChannels = {
  'auth:status': () => IpcResult<AuthStatus>
  'auth:google:start': () => IpcResult<AuthGoogleStartResult>
  'auth:google:disconnect': () => IpcResult<true>
  'theme:get': () => IpcResult<ThemeState>
  'theme:set': (next: ThemePreference) => IpcResult<ThemeState>
  'mail:list:inbox': (args?: { maxResults?: number; pageToken?: string }) => IpcResult<MailInboxPage>
  'mail:list:folder': (args: { folder: 'sent' | 'drafts' | 'trash' | 'spam' | 'starred' | 'archive'; maxResults?: number; pageToken?: string }) => IpcResult<MailInboxPage>
  'mail:get': (id: string) => IpcResult<{ thread: MailThread; body: string; htmlBody: string | null }>
  'ai:info': () => IpcResult<AiInfo>
  'ai:persona:get': () => IpcResult<AiPersona>
  'ai:persona:set': (next: AiPersona) => IpcResult<AiPersona>
  'ai:doc:add': (input: { name: string; text: string; path?: string; source: 'paste' | 'upload' }) => IpcResult<AiDocument>
  'ai:doc:remove': (id: string) => IpcResult<AiPersona>
  'ai:knowledge:retrieve': (args: { prompt: string; documentIds?: string[] }) => IpcResult<RetrievedChunk[]>
  'ai:stream': (args: {
    prompt: string
    tone?: TonePreset
    threadId?: string
    streamId: string
    documentIds?: string[]
    attachments?: Array<{
      name: string
      mimeType: string
      base64Data?: string
      parsedText?: string
    }>
  }) => IpcResult<{ success: boolean }>
  'mail:draft:create': (args: { to: string; subject: string; body: string; threadId?: string }) => IpcResult<{ id: string; threadId: string }>
  'mail:send:direct': (args: { to: string; subject: string; body: string; threadId?: string }) => IpcResult<{ id: string; threadId: string }>
  'mail:draft:send': (args: { draftId: string }) => IpcResult<{ success: boolean }>
  'mail:star': (args: { id: string }) => IpcResult<{ success: boolean }>
  'mail:unstar': (args: { id: string }) => IpcResult<{ success: boolean }>
  'mail:archive': (args: { id: string }) => IpcResult<{ success: boolean }>
  'mail:trash': (args: { id: string }) => IpcResult<{ success: boolean }>
  'mail:search': (args: { query: string; folder?: string }) => IpcResult<MailThread[]>
  'ai:search': (args: { query: string }) => IpcResult<MailThread[]>
  'ai:triage:get_rules': () => IpcResult<{ rules: string }>
  'ai:triage:set_rules': (args: { rules: string }) => IpcResult<{ rules: string }>
  'ai:categories:get': () => IpcResult<{ categories: TriageCategory[] }>
  'ai:categories:set': (args: { categories: TriageCategory[] }) => IpcResult<{ categories: TriageCategory[] }>
  'ai:triage:retroactive': (args: { threads: MailThread[] }) => IpcResult<{ success: boolean }>
  'ai:calendar:detect': (args: { body: string; subject: string }) => IpcResult<CalendarEventDetails>
  'ai:calendar:ics_export': (args: { title: string; startIso: string; endIso: string; description: string }) => IpcResult<{ success: boolean }>
  'ai:audit_log:get': () => IpcResult<any[]>
  'file:parse': (args: { path: string; name: string; mimeType: string; pdfBase64?: string }) => IpcResult<{ text?: string; base64Data?: string }>
}

export type AiInfo = {
  provider: 'anthropic' | 'openai' | 'gemini'
  model: string
}

export type IpcChannel = keyof IpcChannels

export const IPC_CHANNELS: ReadonlyArray<IpcChannel> = [
  'auth:status',
  'auth:google:start',
  'auth:google:disconnect',
  'theme:get',
  'theme:set',
  'mail:list:inbox',
  'mail:list:folder',
  'mail:get',
  'ai:info',
  'ai:persona:get',
  'ai:persona:set',
  'ai:doc:add',
  'ai:doc:remove',
  'ai:knowledge:retrieve',
  'ai:stream',
  'mail:draft:create',
  'mail:send:direct',
  'mail:draft:send',
  'mail:star',
  'mail:unstar',
  'mail:archive',
  'mail:trash',
  'mail:search',
  'ai:search',
  'ai:triage:get_rules',
  'ai:triage:set_rules',
  'ai:categories:get',
  'ai:categories:set',
  'ai:triage:retroactive',
  'ai:calendar:detect',
  'ai:calendar:ics_export',
  'ai:audit_log:get',
  'file:parse',
]

export type IpcEvents = {
  'theme:changed': ThemeState
  'ai:stream:chunk': { streamId: string; chunk: string }
  'ai:stream:done': { streamId: string }
  'ai:stream:error': { streamId: string; error: string }
}

export type IpcEvent = keyof IpcEvents
export const IPC_EVENTS: ReadonlyArray<IpcEvent> = [
  'theme:changed',
  'ai:stream:chunk',
  'ai:stream:done',
  'ai:stream:error',
]
