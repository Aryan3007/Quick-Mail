import { createHash, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { shell } from 'electron'

import { API_BASE_URL } from '../config'
import { readSecret, writeSecret, deleteSecret } from '../secure-store'
import { authHeaders } from './device'

const SECRET_NAME = 'google-tokens'
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000

export type GoogleProfile = {
  email: string
  name?: string
  picture?: string
}

export type GoogleTokens = {
  access_token: string
  refresh_token?: string
  expires_at: number
  scope: string
  token_type: string
}

export type StoredGoogleAccount = {
  profile: GoogleProfile
  tokens: GoogleTokens
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function generatePkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

async function fetchOAuthConfig(): Promise<{ client_id: string; scopes: string[]; auth_endpoint: string }> {
  const res = await fetch(`${API_BASE_URL}/v1/auth/google/config`, {
    headers: await authHeaders(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`google config fetch failed: ${res.status} ${text}`)
  }
  const json = (await res.json()) as
    | { ok: true; client_id: string; scopes: string[]; auth_endpoint: string }
    | { ok: false; error: { message: string } }
  if (!json.ok) throw new Error(json.error.message)
  return { client_id: json.client_id, scopes: json.scopes, auth_endpoint: json.auth_endpoint }
}

type LoopbackHandle = {
  redirectUri: string
  waitForCode: () => Promise<string>
  close: () => void
}

function bindLoopback(state: string): Promise<LoopbackHandle> {
  return new Promise((resolveBind, rejectBind) => {
    let resolveCode: (code: string) => void = () => {}
    let rejectCode: (err: Error) => void = () => {}
    const codePromise = new Promise<string>((res, rej) => {
      resolveCode = res
      rejectCode = rej
    })

    const server: Server = createServer((req, res) => {
      if (!req.url) return
      const url = new URL(req.url, 'http://127.0.0.1')
      if (url.pathname !== '/cb') {
        res.writeHead(404).end()
        return
      }
      const code = url.searchParams.get('code')
      const returnedState = url.searchParams.get('state')
      const error = url.searchParams.get('error')

      if (error) {
        res.writeHead(400, { 'content-type': 'text/html' }).end(renderResultPage(`Sign-in failed: ${error}`))
        rejectCode(new Error(error))
        return
      }
      if (!code || returnedState !== state) {
        res.writeHead(400, { 'content-type': 'text/html' }).end(renderResultPage('Invalid response from Google'))
        rejectCode(new Error('invalid_callback'))
        return
      }

      res
        .writeHead(200, { 'content-type': 'text/html' })
        .end(renderResultPage('You can close this tab and return to QuikMail.'))
      resolveCode(code)
    })

    server.on('error', rejectBind)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo
      const redirectUri = `http://127.0.0.1:${addr.port}/cb`
      const timer = setTimeout(() => {
        rejectCode(new Error('OAuth flow timed out'))
      }, OAUTH_TIMEOUT_MS)
      resolveBind({
        redirectUri,
        waitForCode: () => codePromise.finally(() => clearTimeout(timer)),
        close: () => server.close(),
      })
    })
  })
}

function renderResultPage(message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>QuikMail</title>
    <style>body{font-family:system-ui;background:#0a0a0a;color:#fafafa;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
    .card{padding:32px 40px;border:1px solid #262626;border-radius:12px;text-align:center;max-width:420px}
    h1{font-size:18px;margin:0 0 8px;font-weight:600}p{margin:0;color:#a3a3a3;font-size:14px}</style></head>
    <body><div class="card"><h1>QuikMail</h1><p>${message}</p></div></body></html>`
}

export async function startGoogleSignIn(): Promise<StoredGoogleAccount> {
  const config = await fetchOAuthConfig()
  const { verifier, challenge } = generatePkce()
  const state = base64url(randomBytes(16))

  const loopback = await bindLoopback(state)
  try {
    const authUrl = new URL(config.auth_endpoint)
    authUrl.searchParams.set('client_id', config.client_id)
    authUrl.searchParams.set('redirect_uri', loopback.redirectUri)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', config.scopes.join(' '))
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('code_challenge', challenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')
    authUrl.searchParams.set('access_type', 'offline')
    authUrl.searchParams.set('prompt', 'consent')
    await shell.openExternal(authUrl.toString())

    const code = await loopback.waitForCode()

    const exchangeRes = await fetch(`${API_BASE_URL}/v1/auth/google/exchange`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({
        code,
        redirect_uri: loopback.redirectUri,
        code_verifier: verifier,
      }),
    })
    if (!exchangeRes.ok) {
      const text = await exchangeRes.text()
      throw new Error(`token exchange failed: ${exchangeRes.status} ${text}`)
    }
    const json = (await exchangeRes.json()) as
      | { ok: true; tokens: GoogleTokens; profile: GoogleProfile }
      | { ok: false; error: { message: string } }
    if (!json.ok) throw new Error(json.error.message)

    const account: StoredGoogleAccount = { tokens: json.tokens, profile: json.profile }
    writeSecret(SECRET_NAME, account)
    return account
  } finally {
    loopback.close()
  }
}

export function readGoogleAccount(): StoredGoogleAccount | null {
  return readSecret<StoredGoogleAccount>(SECRET_NAME)
}

export function clearGoogleAccount(): void {
  deleteSecret(SECRET_NAME)
}

export async function refreshGoogleAccessToken(): Promise<StoredGoogleAccount> {
  const account = readGoogleAccount()
  if (!account?.tokens.refresh_token) throw new Error('no_refresh_token')

  const res = await fetch(`${API_BASE_URL}/v1/auth/google/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ refresh_token: account.tokens.refresh_token }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`google refresh failed: ${res.status} ${text}`)
  }
  const json = (await res.json()) as
    | { ok: true; tokens: GoogleTokens }
    | { ok: false; error: { message: string } }
  if (!json.ok) throw new Error(json.error.message)

  const next: StoredGoogleAccount = {
    profile: account.profile,
    tokens: { ...account.tokens, ...json.tokens },
  }
  writeSecret(SECRET_NAME, next)
  return next
}

let inflightRefresh: Promise<StoredGoogleAccount> | null = null

export async function getValidAccessToken(): Promise<string> {
  let account = readGoogleAccount()
  if (!account) throw new Error('not_signed_in')

  const nowSec = Math.floor(Date.now() / 1000)
  if (account.tokens.expires_at - 60 > nowSec) return account.tokens.access_token

  if (!inflightRefresh) {
    inflightRefresh = refreshGoogleAccessToken().finally(() => {
      inflightRefresh = null
    })
  }
  account = await inflightRefresh
  return account.tokens.access_token
}
