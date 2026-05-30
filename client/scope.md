# QuikMail MVP Plan

## Guiding principles

- **Email client first, AI second.** If the inbox is broken, no one cares about agents. Ship a usable Gmail+IMAP client before the agent loop.
- **Phased MVP.** Don't try to ship all 4 agentic capabilities at once. Each phase is independently shippable and dogfood-able.
- **Backend is thin but real.** Token broker + AI proxy + nothing else for v1. No mail sync in the cloud — desktop talks to Gmail/IMAP directly, backend only brokers OAuth and proxies LLM calls.

---

## Architecture at a glance

```
┌─────────────────────────────────────────────────────────┐
│  Electron app (this repo)                               │
│  ┌────────────┐  IPC  ┌──────────────────────────────┐  │
│  │ Renderer   │◀────▶│ Main process                  │  │
│  │ React + TW │       │ ┌─────────────────────────┐   │  │
│  │ Zustand    │       │ │ Mail engine             │   │  │
│  │ TanStack Q │       │ │  ├─ Gmail provider     │───┼──┼─▶ Gmail API
│  │            │       │ │  └─ IMAP provider      │───┼──┼─▶ IMAP/SMTP
│  │            │       │ │ Sync service            │   │  │
│  │            │       │ │ Local DB (SQLite+FTS5)  │   │  │
│  │            │       │ │ Agent runtime           │───┼──┼─▶ Backend ─▶ Claude
│  │            │       │ │ Scheduler               │   │  │
│  │            │       │ └─────────────────────────┘   │  │
│  └────────────┘       └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Backend (separate repo, deploy on Fly/Railway)         │
│  - OAuth token exchange (Gmail)                         │
│  - LLM proxy (Claude API) with per-user rate limits     │
│  - Usage metering                                       │
└─────────────────────────────────────────────────────────┘
```

**Why split main/renderer this way:** OAuth tokens, IMAP credentials, SQLite, and the agent loop all live in main. Renderer is dumb UI. This keeps secrets off `window` and lets sync run while the UI is closed.

---

## Phase 0 — Foundation (week 1)

Just plumbing. No user-visible features beyond "I can see my inbox."

- [ ] **Project structure** — set up `src/main/`, `src/preload/`, `src/renderer/` properly. Path aliases (`@main`, `@renderer`, `@shared`).
- [ ] **IPC contract** — typed bridge in preload using a single `invoke`/`on` pattern. Shared TypeScript types in `src/shared/`.
- [ ] **SQLite setup** — `better-sqlite3` in main, schema for `accounts`, `folders`, `messages`, `threads`, `labels`, `attachments_meta`, FTS5 virtual table over `messages`. Migration runner.
- [ ] **Secret storage** — Electron `safeStorage` for OAuth tokens and IMAP passwords. Never plaintext.
- [ ] **State boundary** — Zustand for UI state (selected thread, sidebar collapse), TanStack Query for everything that comes from main via IPC (treat IPC as the "server").

**Deliverable:** empty app with a sidebar/list/reader three-pane layout, dark mode, no real data.

---

## Phase 1 — Read-only Gmail (week 2)

- [ ] **Gmail OAuth flow** — backend issues `client_id`/exchanges code, app receives access+refresh tokens, stored via `safeStorage`.
- [ ] **Initial sync** — fetch last 30 days of `INBOX` via Gmail API. Store messages + threads in SQLite. Parse MIME, sanitize HTML (DOMPurify) before render.
- [ ] **Incremental sync** — Gmail history API (`historyId`) to pull deltas. Poll every 60s when app is focused, every 5min when backgrounded.
- [ ] **Three-pane UI** — folders/labels list, thread list with virtualization (`@tanstack/react-virtual`), thread reader with collapsible quoted text.
- [ ] **Local search** — FTS5 query over subject/body/from/to.

**Acceptance:** you use it as your secondary Gmail client for a day without rage-quitting.

---

## Phase 2 — Send + IMAP (week 3)

- [ ] **Compose + send via Gmail API** — new message, reply, reply-all, forward. Drafts saved server-side. Markdown→HTML for the editor (Tiptap or Lexical).
- [ ] **IMAP/SMTP provider** — `imapflow` + `nodemailer`. Same `MailProvider` interface as Gmail so the rest of the app doesn't know which it's talking to. App password flow (iCloud, Fastmail) before generic IMAP.
- [ ] **Multi-account** — one DB, `account_id` foreign key everywhere. Account switcher in sidebar.
- [ ] **Attachments** — upload/download, virus-of-the-week disclaimer not needed for MVP but cap size at 25MB.

**Acceptance:** you can send and receive on Gmail + one IMAP account. This is your "real email client" milestone.

---

## Phase 3 — AI assist (week 4)

The first AI features. All read-only or single-shot — no agent loop yet.

- [ ] **Backend LLM proxy** — `POST /v1/messages` style endpoint that forwards to Claude with your API key, per-user rate limit, request logging. Prompt caching for system prompts.
- [ ] **Thread summarize** — button in reader, streams summary into a panel. Cache result in DB keyed by thread `historyId`.
- [ ] **Smart reply drafting** — "Draft a reply" button with tone selector (concise / friendly / formal). Inserts into composer, user edits before sending.
- [ ] **Smart compose suggestions** — inline ghost-text completion in composer while typing. Debounced, cancellable.
- [ ] **Rewrite selection** — select text in composer → "rewrite as X."

**Important:** every AI action must be cancellable and show a token/cost indicator. People hate opaque AI charges.

---

## Phase 4 — Triage agent (week 5–6)

First taste of "agentic." Bounded, deterministic-ish.

- [ ] **Rule + AI hybrid triage** — user defines high-level intents in natural language ("anything from my landlord is urgent," "newsletters go to Newsletter label and skip inbox"). Backend converts intent → structured rule + LLM fallback for fuzzy matches.
- [ ] **Triage runs on new mail** — sync hook calls triage agent for each new message, applies labels/archives.
- [ ] **Undo queue** — every agent action lands in a `pending_actions` table for 10s before committing to Gmail. User can undo from a toast. Critical for trust.
- [ ] **Audit log** — `agent_actions` table: what the agent did, why, on which message. View in settings.

**Trust gate:** ship triage behind a "review before applying" mode first. Only after user has approved 50 actions does it offer to auto-apply.

---

## Phase 5 — Multi-step agent (week 7–8)

The "find the Stripe invoice and forward to accounting" feature.

- [ ] **Tool schema for the agent** — `searchMessages`, `readMessage`, `getAttachment`, `composeDraft`, `sendDraft`, `applyLabel`, `archive`. All scoped to the active account. All return structured JSON.
- [ ] **Agent loop in main process** — Claude tool use, max N iterations (default 8), max wall time (default 60s), explicit budget per task.
- [ ] **Plan-first UX** — user types intent → agent produces a plan as bullet points → user clicks "Run." No silent autonomy until the user has built trust.
- [ ] **Action approval modes** — three levels: "ask every step" / "ask only on send/delete" / "full auto with audit log." Default to middle. Send/archive/delete always confirmable.
- [ ] **Cancel button that actually works** — abort signal threaded through every tool call.

This is the phase where most agentic email apps die because they over-promise. Keep tool surface small, keep the plan visible, keep undo loud.

---

## Phase 6 — Scheduled agents (week 9)

- [ ] **Cron-like scheduler in main process** — survives sleep/wake via `node-schedule` or `croner` + missed-run replay.
- [ ] **Built-in agents to ship with:**
  - "Daily digest at 8am" — summarize what came in overnight
  - "Weekly cleanup" — propose archives for unread newsletters older than 7 days
- [ ] **Custom scheduled agent** — user writes natural-language intent + cron, agent saved in DB, runs in background, result delivered as a local notification + in-app inbox-style log.

---

## Tech decisions worth locking now

| Concern | Choice | Why |
|---|---|---|
| Editor | **Tiptap** | Better composition for email than Lexical; battle-tested |
| HTML sanitization | **DOMPurify** + sandboxed iframe for email render | Email HTML is hostile — don't render in your main DOM |
| IMAP | **imapflow** | Maintained, promise-based, supports IDLE |
| SMTP | **nodemailer** | Standard, supports OAuth2 for Gmail |
| MIME parsing | **mailparser** | Pairs with imapflow |
| SQLite | **better-sqlite3** | Sync API, fast, FTS5 available |
| Logging | **pino** in main, console in renderer | Structured logs help when agent actions go wrong |
| Error tracking | **Sentry** (main + renderer) | Add before Phase 4 — you'll need it for agent debugs |
| LLM SDK | **@anthropic-ai/sdk** | Use prompt caching for system prompts, streaming for all UX-facing calls |

---

## What I'm explicitly cutting from MVP

- Calendar / contacts integration
- Search across accounts (per-account only in v1)
- Encryption (PGP/S-MIME)
- Mobile / web versions
- Real-time collaboration / shared inboxes
- Custom themes beyond light/dark
- Plugin system
- Self-hosted backend option (one hosted backend only)

---

## Biggest risks, ranked

1. **Agent doing destructive things silently.** Mitigation: undo queue, approval modes, plan-first UX, audit log. Build these *before* the agent that needs them.
2. **Gmail API quota.** 1B quota units/day per project sounds infinite until your sync logic spins. Implement backoff + dedupe at the provider layer from day one.
3. **IMAP edge cases.** Every server is non-compliant in its own way. Test against Gmail-via-IMAP, iCloud, Fastmail, and one self-hosted (mailcow/dovecot) before claiming "IMAP support."
4. **Token cost runaway.** A user with 50k emails who hits "summarize all" can rack up real money. Per-account daily token cap on the backend, enforced before the request hits Claude.
5. **`better-sqlite3` + Electron upgrades.** Native module rebuilds. Pin Electron version, automate `electron-rebuild` in CI.

---

## What's next, after MVP ships

- Per-folder agents ("anything in /support gets auto-categorized")
- Email → task extraction (creates entries in Linear/Notion/etc.)
- Voice compose
- Cross-account unified inbox + unified search
- Encrypted local backup / export
