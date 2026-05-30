import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import {
  PERSONA_LIMITS,
  TONE_PRESETS,
  type AiDocument,
  type AiPersona,
  type TonePreset,
  type TriageCategory,
} from '../../../shared/ai'
import type { ThemePreference } from '../../../shared/ipc'
import { useAuth } from '../hooks/useAuth'
import { usePersona } from '../hooks/usePersona'
import { useThemeStore } from '../store/theme'
import { useUiStore, type SettingsSection } from '../store/ui'
import { Modal } from './Modal'

const SECTIONS: Array<{ key: SettingsSection; label: string }> = [
  { key: 'account', label: 'Account' },
  { key: 'appearance', label: 'Appearance' },
  { key: 'ai', label: 'AI' },
  { key: 'triage', label: 'Triage & Logs' },
]

export function SettingsModal() {
  const open = useUiStore((s) => s.settingsOpen)
  const close = useUiStore((s) => s.closeSettings)
  const section = useUiStore((s) => s.settingsSection)
  const setSection = useUiStore((s) => s.setSettingsSection)

  return (
    <Modal open={open} onClose={close} labelledBy="settings-title">
      <div className="flex h-[540px] w-[780px] overflow-hidden rounded-[24px] border border-border/85 bg-surface/75 backdrop-blur-2xl">
        <nav className="flex w-52 shrink-0 flex-col border-r border-border/40 bg-surface-elevated/40 p-3">
          <div className="px-3 pb-3.5 pt-1.5">
            <h2 id="settings-title" className="text-sm  tracking-tight text-fg">
              Settings
            </h2>
          </div>
          <ul className="space-y-1">
            {SECTIONS.map((s) => {
              const active = section === s.key
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => setSection(s.key)}
                    className={
                      'w-full rounded-xl px-3 py-2 text-left text-xs font-semibold transition-all duration-150 ' +
                      (active
                        ? 'bg-fg text-surface'
                        : 'text-fg-muted hover:bg-surface/60 hover:text-fg')
                    }
                  >
                    {s.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        <section className="relative flex-1 overflow-y-auto">
          <button
            type="button"
            onClick={close}
            aria-label="Close settings"
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition hover:bg-surface-elevated hover:text-fg"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 2l10 10M12 2L2 12" />
            </svg>
          </button>
          <div className="px-8 py-7">
            {section === 'account' && <AccountSection />}
            {section === 'appearance' && <AppearanceSection />}
            {section === 'ai' && <AiSection />}
            {section === 'triage' && <TriageSection />}
          </div>
        </section>
      </div>
    </Modal>
  )
}

function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6">
      <h3 className="text-base font-semibold">{title}</h3>
      {description ? <p className="mt-1 text-xs text-fg-muted">{description}</p> : null}
    </div>
  )
}

function Row({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-6 border-t border-border py-4 first:border-t-0 first:pt-0">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        {description ? <div className="mt-0.5 text-xs text-fg-muted">{description}</div> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function AccountSection() {
  const { status, disconnectGoogle } = useAuth()
  const close = useUiStore((s) => s.closeSettings)
  const google = status?.google.connected ? status.google : null

  return (
    <div>
      <SectionHeading title="Account" description="Manage the Google account connected to QuikMail." />
      {google ? (
        <>
          <Row title="Connected as">
            <div className="flex items-center gap-3">
              {google.picture ? (
                <img
                  src={google.picture}
                  alt=""
                  className="h-9 w-9 rounded-full"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-elevated text-sm font-medium">
                  {google.email.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="text-right">
                {google.name ? <div className="text-sm font-medium">{google.name}</div> : null}
                <div className="text-xs text-fg-muted">{google.email}</div>
              </div>
            </div>
          </Row>
          <Row title="Token expires">
            <span className="text-xs text-fg-muted">
              {new Date(google.expiresAt * 1000).toLocaleString()}
            </span>
          </Row>
          <Row title="Granted scopes" description="What QuikMail can access in your Google account.">
            <ul className="max-w-xs space-y-1 text-right text-[11px] text-fg-muted">
              {google.scopes.map((s) => (
                <li key={s} className="truncate">
                  {s.replace('https://www.googleapis.com/auth/', '')}
                </li>
              ))}
            </ul>
          </Row>
          <Row title="Disconnect" description="Sign out and remove the stored Google tokens.">
            <button
              type="button"
              onClick={async () => {
                await disconnectGoogle()
                close()
              }}
              className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/15"
            >
              Disconnect
            </button>
          </Row>
        </>
      ) : (
        <p className="text-sm text-fg-muted">No account connected.</p>
      )}
    </div>
  )
}

function AppearanceSection() {
  const preference = useThemeStore((s) => s.preference)
  const effective = useThemeStore((s) => s.effective)
  const setPreference = useThemeStore((s) => s.setPreference)

  const options: Array<{ key: ThemePreference; label: string; description: string }> = [
    { key: 'light', label: 'Light', description: 'Always light' },
    { key: 'system', label: 'System', description: 'Follow your OS appearance' },
    { key: 'dark', label: 'Dark', description: 'Always dark' },
  ]

  return (
    <div>
      <SectionHeading title="Appearance" description="Customize how QuikMail looks on this device." />
      <Row
        title="Theme"
        description={preference === 'system' ? `Following system (${effective})` : undefined}
      >
        <div
          role="radiogroup"
          aria-label="Theme"
          className="flex items-center rounded-md border border-border bg-surface-elevated p-0.5 text-xs"
        >
          {options.map((opt) => {
            const active = preference === opt.key
            return (
              <button
                key={opt.key}
                role="radio"
                aria-checked={active}
                type="button"
                onClick={() => setPreference(opt.key)}
                className={
                  'rounded px-2.5 py-1 transition ' +
                  (active ? 'bg-surface text-fg' : 'text-fg-muted hover:text-fg')
                }
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </Row>
    </div>
  )
}

function AiSection() {
  const {
    persona,
    isLoading,
    save,
    isSaving,
    saveError,
    addDoc,
    isAdding,
    addError,
    removeDoc,
    isRemoving,
  } = usePersona()

  return (
    <div>
      <SectionHeading
        title="AI Personalization"
        description="Teach the AI who you are so it can act and write like you."
      />
      {isLoading ? (
        <p className="text-sm text-fg-muted">Loading…</p>
      ) : (
        <PersonaForm
          persona={persona}
          isSaving={isSaving}
          saveError={saveError}
          onSave={save}
          onAddDoc={addDoc}
          onRemoveDoc={removeDoc}
          isAdding={isAdding}
          addError={addError}
          isRemoving={isRemoving}
        />
      )}
    </div>
  )
}

function PersonaForm({
  persona,
  isSaving,
  saveError,
  onSave,
  onAddDoc,
  onRemoveDoc,
  isAdding,
  addError,
  isRemoving,
}: {
  persona: AiPersona
  isSaving: boolean
  saveError: string | null
  onSave: (next: AiPersona) => Promise<unknown>
  onAddDoc: (input: { name: string; text: string; source: 'paste' | 'upload'; path?: string; pdfBase64?: string }) => Promise<AiDocument>
  onRemoveDoc: (id: string) => Promise<unknown>
  isAdding: boolean
  addError: string | null
  isRemoving: boolean
}) {
  const [draft, setDraft] = useState<AiPersona>(persona)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    setDraft(persona)
  }, [persona])

  const handleSave = async () => {
    const cleaned: AiPersona = { documents: persona.documents }
    if (draft.aboutMe && draft.aboutMe.trim().length > 0) cleaned.aboutMe = draft.aboutMe
    if (draft.signature && draft.signature.trim().length > 0) cleaned.signature = draft.signature
    if (draft.tonePreset) cleaned.tonePreset = draft.tonePreset
    


    cleaned.telegramEnabled = draft.telegramEnabled ?? false
    cleaned.telegramBotToken = draft.telegramBotToken ?? ''
    cleaned.telegramChatId = draft.telegramChatId ?? ''

    await onSave(cleaned)
    setSavedAt(Date.now())
  }

  return (
    <>
      <Row
        title="About me"
        description="Who you are, your role, how you write, what matters to you."
      >
        <div className="w-72">
          <textarea
            value={draft.aboutMe ?? ''}
            onChange={(e) => setDraft({ ...draft, aboutMe: e.target.value })}
            placeholder={
              "e.g. I'm a senior product manager at a fintech startup. I write in short, direct sentences. I avoid corporate jargon and prefer plain English."
            }
            rows={6}
            maxLength={PERSONA_LIMITS.aboutMeMax}
            className="w-full resize-y rounded-md border border-border bg-surface-elevated px-2 py-1.5 text-xs leading-relaxed focus:border-fg-subtle focus:outline-none"
          />
          <div className="mt-1 text-right text-[10px] text-fg-subtle">
            {(draft.aboutMe ?? '').length.toLocaleString()} / {PERSONA_LIMITS.aboutMeMax.toLocaleString()}
          </div>
        </div>
      </Row>

      <Row title="Email signature" description="Appended to drafted replies.">
        <div className="w-72">
          <textarea
            value={draft.signature ?? ''}
            onChange={(e) => setDraft({ ...draft, signature: e.target.value })}
            placeholder={'e.g.\nBest,\nAryan'}
            rows={3}
            maxLength={PERSONA_LIMITS.signatureMax}
            className="w-full resize-y rounded-md border border-border bg-surface-elevated px-2 py-1.5 text-xs leading-relaxed focus:border-fg-subtle focus:outline-none"
          />
          <div className="mt-1 text-right text-[10px] text-fg-subtle">
            {(draft.signature ?? '').length} / {PERSONA_LIMITS.signatureMax}
          </div>
        </div>
      </Row>

      <Row title="Default tone" description="The default tone for AI-drafted replies.">
        <TonePicker
          value={draft.tonePreset}
          onChange={(next) => setDraft({ ...draft, tonePreset: next })}
        />
      </Row>



      <div className="border-t border-border/40 my-4" />
      <h4 className="text-[11.5px] font-bold uppercase tracking-wider text-fg-subtle mb-3">Telegram Notification Concierge</h4>
      
      <Row title="Enable Telegram Alerts" description="Get instant AI-drafted responses for highly critical emails directly on Telegram (100% Free & Reliable).">
        <button
          type="button"
          onClick={() => setDraft({ ...draft, telegramEnabled: !draft.telegramEnabled })}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            draft.telegramEnabled ? 'bg-tag-sage' : 'bg-surface-muted border-border'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              draft.telegramEnabled ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </Row>

      {draft.telegramEnabled && (
        <>
          <Row title="Telegram Bot Token" description="Create a bot via BotFather and enter the bot token here.">
            <div className="w-72">
              <input
                type="password"
                value={draft.telegramBotToken ?? ''}
                onChange={(e) => setDraft({ ...draft, telegramBotToken: e.target.value.trim() })}
                placeholder="e.g. 123456789:ABCdefGh..."
                className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs focus:border-fg-subtle focus:outline-none bg-transparent"
              />
              <div className="mt-1 text-[10px] text-fg-subtle leading-normal">
                To create a bot: Search for <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-accent hover:underline">@BotFather</a> on Telegram, send `/newbot`, and copy the token.
              </div>
            </div>
          </Row>
          <Row title="Telegram Chat ID" description="Your personal Telegram numeric chat ID.">
            <div className="w-72">
              <input
                type="text"
                value={draft.telegramChatId ?? ''}
                onChange={(e) => setDraft({ ...draft, telegramChatId: e.target.value.trim() })}
                placeholder="e.g. 987654321"
                className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs focus:border-fg-subtle focus:outline-none bg-transparent"
              />
              <div className="mt-1 text-[10px] text-fg-subtle leading-normal">
                Send a message to <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer" className="text-accent hover:underline">@userinfobot</a> on Telegram to instantly get your Chat ID. <span className="text-tag-sage font-medium">(Make sure to message your new bot on Telegram first!)</span>
              </div>
            </div>
          </Row>
        </>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
        <div className="text-[11px] text-fg-subtle">
          {saveError ? (
            <span className="text-red-400">{saveError}</span>
          ) : savedAt ? (
            <span>Saved</span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-md bg-fg px-3 py-1.5 text-xs font-medium text-surface disabled:opacity-50"
        >
          {isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="mt-8">
        <h4 className="text-sm font-semibold">Knowledge</h4>
        <p className="mt-1 text-xs text-fg-muted">
          Add documents the AI can pull from when drafting (resume, product docs, context). Text and Markdown only.
        </p>
        <DocumentsList
          documents={persona.documents ?? []}
          onRemove={onRemoveDoc}
          isRemoving={isRemoving}
        />
        <DocumentAdd onAdd={onAddDoc} isAdding={isAdding} addError={addError} />
      </div>
    </>
  )
}

function TonePicker({
  value,
  onChange,
}: {
  value: TonePreset | undefined
  onChange: (next: TonePreset | undefined) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Default tone"
      className="flex flex-wrap items-center justify-end gap-1 rounded-md border border-border bg-surface-elevated p-0.5 text-xs"
    >
      <button
        role="radio"
        aria-checked={value === undefined}
        type="button"
        onClick={() => onChange(undefined)}
        className={
          'rounded px-2 py-1 transition ' +
          (value === undefined ? 'bg-surface text-fg' : 'text-fg-muted hover:text-fg')
        }
      >
        Auto
      </button>
      {TONE_PRESETS.map((t) => {
        const active = value === t.key
        return (
          <button
            key={t.key}
            role="radio"
            aria-checked={active}
            type="button"
            onClick={() => onChange(t.key)}
            title={t.description}
            className={
              'rounded px-2 py-1 transition ' +
              (active ? 'bg-surface text-fg' : 'text-fg-muted hover:text-fg')
            }
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

function DocumentsList({
  documents,
  onRemove,
  isRemoving,
}: {
  documents: AiDocument[]
  onRemove: (id: string) => Promise<unknown>
  isRemoving: boolean
}) {
  if (documents.length === 0) {
    return (
      <p className="mt-3 rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-fg-subtle">
        No documents yet.
      </p>
    )
  }
  return (
    <ul className="mt-3 space-y-1.5">
      {documents.map((doc) => (
        <li
          key={doc.id}
          className="flex items-center gap-3 rounded-md border border-border bg-surface-elevated px-3 py-2 text-xs"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{doc.name}</div>
            <div className="text-[10px] text-fg-subtle">
              {doc.chunkCount} {doc.chunkCount === 1 ? 'chunk' : 'chunks'} · {doc.charCount.toLocaleString()} chars · {doc.source}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRemove(doc.id)}
            disabled={isRemoving}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-50"
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  )
}

function DocumentAdd({
  onAdd,
  isAdding,
  addError,
}: {
  onAdd: (input: { name: string; text: string; source: 'paste' | 'upload'; path?: string; pdfBase64?: string }) => Promise<AiDocument>
  isAdding: boolean
  addError: string | null
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const fileInput = useRef<HTMLInputElement | null>(null)

  const reset = () => {
    setName('')
    setText('')
  }

  const handleFile = async (file: File) => {
    if (!/\.(txt|md|markdown|pdf)$/i.test(file.name)) {
      alert('Only .txt, .md, and .pdf files are supported.')
      return
    }
    const isPdf = /\.pdf$/i.test(file.name)
    try {
      if (isPdf) {
        const reader = new FileReader()
        reader.readAsDataURL(file)
        reader.onload = async () => {
          const dataUrl = reader.result as string
          const base64 = dataUrl.split(',')[1]
          if (base64) {
            try {
              await onAdd({
                name: file.name,
                text: '',
                path: file.path || '',
                pdfBase64: base64,
                source: 'upload',
              })
              setOpen(false)
              reset()
            } catch (err) {
              console.error('Failed to upload PDF:', err)
            }
          }
        }
      } else {
        const body = await file.text()
        await onAdd({ name: file.name, text: body, path: file.path || '', source: 'upload' })
        setOpen(false)
        reset()
      }
    } catch (err) {
      console.error('File reading failed:', err)
    }
  }

  const handlePasteSubmit = async () => {
    if (!name.trim() || !text.trim()) return
    try {
      await onAdd({ name: name.trim(), text, source: 'paste' })
      setOpen(false)
      reset()
    } catch {
      // surfaced via addError
    }
  }

  if (!open) {
    return (
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] text-fg-subtle">
          Up to {PERSONA_LIMITS.docCountMax} documents, {PERSONA_LIMITS.docCharMax.toLocaleString()} chars each.
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-xs font-medium"
        >
          Add document
        </button>
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-lg border border-border bg-surface-elevated p-3">
      <div className="flex items-center justify-between">
        <h5 className="text-xs font-semibold">Add document</h5>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            reset()
          }}
          className="rounded-md px-2 py-1 text-[11px] text-fg-muted hover:text-fg"
        >
          Cancel
        </button>
      </div>

      <div className="mt-3 space-y-3">
        <div>
          <label className="text-[11px] font-medium text-fg-muted">From file</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              accept=".txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleFile(f)
                e.target.value = ''
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={isAdding}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              Choose .txt, .md, or .pdf…
            </button>
          </div>
        </div>

        <div className="border-t border-border pt-3">
          <label className="text-[11px] font-medium text-fg-muted">Or paste text</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Document name"
            maxLength={PERSONA_LIMITS.docNameMax}
            className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-xs focus:border-fg-subtle focus:outline-none"
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste document body…"
            rows={6}
            maxLength={PERSONA_LIMITS.docCharMax}
            className="mt-2 w-full resize-y rounded-md border border-border bg-surface px-2 py-1.5 text-xs leading-relaxed focus:border-fg-subtle focus:outline-none"
          />
          <div className="mt-1 flex items-center justify-between">
            <span className="text-[10px] text-fg-subtle">
              {text.length.toLocaleString()} / {PERSONA_LIMITS.docCharMax.toLocaleString()}
            </span>
            <button
              type="button"
              onClick={handlePasteSubmit}
              disabled={isAdding || !name.trim() || !text.trim()}
              className="rounded-md bg-fg px-3 py-1.5 text-xs font-medium text-surface disabled:opacity-50"
            >
              {isAdding ? 'Embedding…' : 'Add'}
            </button>
          </div>
        </div>

        {addError ? (
          <p className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-400">
            {addError}
          </p>
        ) : null}
      </div>
    </div>
  )
}

const CURATED_COLORS = [
  'hsl(142, 60%, 45%)',  // Green (Job Apps)
  'hsl(24, 95%, 53%)',   // Orange (Billing)
  'hsl(263, 70%, 50%)',  // Purple (Newsletters)
  'hsl(45, 93%, 47%)',   // Yellow (Personal)
  'hsl(200, 85%, 45%)',  // Sky Blue
  'hsl(330, 80%, 50%)',  // Pink/Magenta
  'hsl(8, 80%, 50%)',    // Coral Red
  'hsl(170, 75%, 40%)',  // Emerald Green
]

function TriageSection() {
  const queryClient = useQueryClient()
  const [categories, setCategories] = useState<TriageCategory[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  // Editor form state
  const [editingCategory, setEditingCategory] = useState<TriageCategory | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [color, setColor] = useState(CURATED_COLORS[0])
  const [formError, setFormError] = useState('')
  const [isTriaging, setIsTriaging] = useState(false)

  const handleRetroactiveTriage = async () => {
    setIsTriaging(true)
    try {
      const res = await window.quikmail.invoke('ai:triage:retroactive')
      if (res.ok) {
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['inbox'] })
          queryClient.invalidateQueries({ queryKey: ['folder'] })
          window.quikmail.invoke('ai:audit_log:get').then((lRes) => {
            if (lRes.ok) setLogs(lRes.data)
            setIsTriaging(false)
          })
        }, 1500)
      } else {
        setIsTriaging(false)
      }
    } catch (err) {
      console.error(err)
      setIsTriaging(false)
    }
  }

  useEffect(() => {
    // Fetch categories
    window.quikmail.invoke('ai:categories:get').then((res) => {
      if (res.ok) setCategories(res.data.categories)
      setLoading(false)
    })
    // Fetch logs
    window.quikmail.invoke('ai:audit_log:get').then((res) => {
      if (res.ok) setLogs(res.data)
    })
  }, [])

  const openAddForm = () => {
    setEditingCategory(null)
    setName('')
    setPrompt('')
    setColor(CURATED_COLORS[Math.floor(Math.random() * CURATED_COLORS.length)])
    setFormError('')
    setIsFormOpen(true)
  }

  const openEditForm = (cat: TriageCategory) => {
    setEditingCategory(cat)
    setName(cat.name)
    setPrompt(cat.prompt)
    setColor(cat.color)
    setFormError('')
    setIsFormOpen(true)
  }

  const handleFormSave = async () => {
    if (!name.trim()) {
      setFormError('Category name is required')
      return
    }
    if (!prompt.trim()) {
      setFormError('Prompt definition is required')
      return
    }

    const updated = [...categories]
    if (editingCategory) {
      // Edit mode
      const idx = updated.findIndex((x) => x.id === editingCategory.id)
      if (idx !== -1) {
        updated[idx] = { ...editingCategory, name: name.trim(), prompt: prompt.trim(), color }
      }
    } else {
      // Add mode
      const catId = `cat_${Math.random().toString(36).slice(2, 9)}`
      if (updated.some((c) => c.name.toLowerCase() === name.trim().toLowerCase())) {
        setFormError('A category with this name already exists')
        return
      }
      updated.push({ id: catId, name: name.trim(), prompt: prompt.trim(), color })
    }

    setIsSaving(true)
    try {
      const res = await window.quikmail.invoke('ai:categories:set', { categories: updated })
      if (res.ok) {
        setCategories(res.data.categories)
        setIsFormOpen(false)

        // Trigger background retroactive triage
        void window.quikmail.invoke('ai:triage:retroactive').then(() => {
          // Invalidate inbox/folder lists to pick up new labels
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['inbox'] })
            queryClient.invalidateQueries({ queryKey: ['folder'] })
            // Fetch logs to show the new triage results
            window.quikmail.invoke('ai:audit_log:get').then((lRes) => {
              if (lRes.ok) setLogs(lRes.data)
            })
          }, 1000)
        })
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    const updated = categories.filter((c) => c.id !== id)
    setIsSaving(true)
    try {
      const res = await window.quikmail.invoke('ai:categories:set', { categories: updated })
      if (res.ok) {
        setCategories(res.data.categories)
        queryClient.invalidateQueries({ queryKey: ['inbox'] })
        queryClient.invalidateQueries({ queryKey: ['folder'] })
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6 select-none">
      <div className="flex items-center justify-between">
        <SectionHeading
          title="Automatic Category Triage"
          description="Define custom email categories in plain English. The AI agent classifies incoming emails automatically."
        />
        {!isFormOpen && (
          <button
            type="button"
            onClick={openAddForm}
            className="rounded bg-fg px-3 py-1.5 text-xs font-semibold text-surface transition hover:opacity-90 active:scale-95"
          >
            + Add Category
          </button>
        )}
      </div>

      {isFormOpen && (
        <div className="rounded-lg border border-border bg-surface-elevated p-4 space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-fg-subtle">
            {editingCategory ? 'Edit Category' : 'Create Category'}
          </h4>

          {formError && (
            <p className="text-[11px] font-medium text-red-500 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded">
              {formError}
            </p>
          )}

          <div className="space-y-3">
            <div>
              <label htmlFor="cat-name" className="block text-[11px] font-semibold text-fg-muted mb-1">
                Category Name
              </label>
              <input
                id="cat-name"
                type="text"
                placeholder="e.g. Job Applications"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-xs focus:border-fg-subtle focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="cat-prompt" className="block text-[11px] font-semibold text-fg-muted mb-1">
                Trigger Definition (in plain English)
              </label>
              <textarea
                id="cat-prompt"
                placeholder="e.g. Emails discussing interviews, recruiter reachouts, offer letters, or hiring loops."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-xs leading-relaxed focus:border-fg-subtle focus:outline-none resize-none"
              />
            </div>

            <div>
              <span className="block text-[11px] font-semibold text-fg-muted mb-2">
                Pill Color Token
              </span>
              <div className="flex flex-wrap gap-2">
                {CURATED_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className="h-6 w-6 rounded-full border border-border relative transition-transform hover:scale-110 active:scale-95 shrink-0 cursor-pointer"
                    style={{ backgroundColor: c }}
                    title={c}
                  >
                    {color === c && (
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white font-bold select-none drop-shadow">
                        ✓
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-fg-muted transition hover:bg-surface-muted hover:text-fg"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={handleFormSave}
              className="rounded-md bg-fg px-4 py-1.5 text-xs font-semibold text-surface transition hover:opacity-90 disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : editingCategory ? 'Save Changes' : 'Create Category'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-xs text-fg-subtle">
          Loading categories…
        </div>
      ) : categories.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-xs text-fg-subtle">
          No triage categories configured yet. Click "+ Add Category" to start.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="rounded-lg border border-border bg-surface-elevated p-4 flex flex-col gap-2 hover:border-border-strong transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <span
                  className="rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold text-white tracking-wide uppercase select-none shrink-0"
                  style={{ backgroundColor: cat.color }}
                >
                  {cat.name}
                </span>

                <div className="flex items-center gap-2 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => openEditForm(cat)}
                    className="text-fg-subtle hover:text-fg transition"
                  >
                    Edit
                  </button>
                  <span className="text-border">|</span>
                  <button
                    type="button"
                    onClick={() => handleDelete(cat.id)}
                    className="text-fg-subtle hover:text-red-400 transition"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <p className="text-xs text-fg-muted leading-relaxed font-sans mt-1 select-text">
                {cat.prompt}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-border pt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-semibold">AI Agent Audit Log</h4>
            <p className="text-[11px] text-fg-subtle">timeline of recent background triage and AI actions</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isTriaging}
              onClick={handleRetroactiveTriage}
              className="text-[10.5px] font-semibold text-accent hover:text-accent/90 disabled:opacity-50 transition"
            >
              {isTriaging ? 'Triaging Inbox…' : '⚡ Run Triage Now'}
            </button>
            {logs.length > 0 && (
              <>
                <span className="text-border">|</span>
                <button
                  type="button"
                  onClick={async () => {
                    await window.quikmail.invoke('ai:audit_log:get') // clear log trigger
                    setLogs([])
                  }}
                  className="text-[10.5px] font-medium text-red-400 hover:text-red-500 transition"
                >
                  Clear Logs
                </button>
              </>
            )}
          </div>
        </div>

        {logs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-xs text-fg-subtle">
            No audit logs recorded yet. Categorized threads will log their status here.
          </div>
        ) : (
          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-3 rounded-lg border border-border bg-surface-elevated p-3 text-xs"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-accent-soft text-[10px]  text-accent select-none font-bold">
                  {log.actionType[0]}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="rounded bg-surface px-1.5 py-0.5 tracking-wide uppercase text-[9px] text-fg-muted border border-border select-none">
                      {log.actionType}
                    </span>
                    <span className="text-[10px] text-fg-subtle tabular-nums select-none">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="font-semibold text-fg truncate select-text">
                    Subject: {log.threadSubject}
                  </p>
                  <p className="text-fg-muted leading-relaxed select-text">
                    {log.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
