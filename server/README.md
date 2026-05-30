# QuikMail Server

Thin backend for the QuikMail Electron client. Phase-aligned with [`../client/scope.md`](../client/scope.md).

Scope:
- OAuth token exchange (Gmail) — Phase 1
- LLM proxy to Anthropic with per-user rate limits + usage metering — Phase 3
- No mail sync. The desktop app talks to Gmail/IMAP directly.

## Stack
- Node 20+, TypeScript (strict, ESM)
- Fastify 5 (`@fastify/cors`, `@fastify/rate-limit`, `@fastify/sensible`)
- Zod for runtime validation
- `@anthropic-ai/sdk` for Claude
- `pino` for structured logs (pretty in dev)

Persistence is stubbed for now. Postgres + Redis land when OAuth/metering does.

## Setup
```bash
cd server
pnpm install
cp .env.example .env
# fill in ANTHROPIC_API_KEY at minimum
pnpm dev
```

## AI provider switching
The active provider is chosen by `AI_PROVIDER` in `.env`. The proxy auto-routes to the matching SDK — clients hitting `/v1/messages` never need to know which provider is live.

| `AI_PROVIDER` | Required key | Default model |
|---|---|---|
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` |
| `openai` | `OPENAI_API_KEY` | `gpt-4o-mini` |
| `gemini` | `GEMINI_API_KEY` | `gemini-2.0-flash` |

Override the model with `AI_MODEL=…`. Clients may also pass `{ "model": "…" }` per request.

## Routes (current)
| Method | Path | Notes |
|---|---|---|
| GET | `/healthz` | liveness |
| GET | `/readyz` | readiness |
| GET | `/v1/ai/info` | reports active provider + model (no keys) |
| POST | `/v1/messages` | AI proxy, SSE streaming only |

`POST /v1/messages` returns SSE events: `message_start` (`{provider, model}`), `text_delta`, `message_stop` (with `usage`), `done`, `error`.

## Coming next
- Gmail OAuth: `/v1/auth/google/start`, `/v1/auth/google/callback`, `/v1/auth/google/refresh`
- Per-user auth (signed device token issued on first launch)
- Daily token cap enforcement (Redis token bucket)
- Usage metering table
