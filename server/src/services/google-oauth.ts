import { request } from 'undici';

import { env } from '../env.js';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

export class GoogleOAuthError extends Error {
  readonly code = 'google_oauth_error';
  constructor(message: string, readonly status: number = 502) {
    super(message);
  }
}

function requireConfig(): { clientId: string; clientSecret: string } {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new GoogleOAuthError('Google OAuth is not configured (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)', 503);
  }
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
}

export type GoogleTokenBundle = {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  scope: string;
  token_type: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

async function postForm(body: Record<string, string>): Promise<GoogleTokenResponse> {
  const params = new URLSearchParams(body);
  const res = await request(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const json = (await res.body.json()) as GoogleTokenResponse;
  if (res.statusCode >= 400) {
    throw new GoogleOAuthError(json.error_description ?? json.error ?? 'Google token endpoint error', 502);
  }
  return json;
}

export async function exchangeAuthorizationCode(args: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<GoogleTokenBundle> {
  const cfg = requireConfig();
  const json = await postForm({
    grant_type: 'authorization_code',
    code: args.code,
    redirect_uri: args.redirectUri,
    code_verifier: args.codeVerifier,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
  if (!json.access_token) throw new GoogleOAuthError('Token response missing access_token');
  return {
    access_token: json.access_token,
    ...(json.refresh_token ? { refresh_token: json.refresh_token } : {}),
    expires_at: Math.floor(Date.now() / 1000) + (json.expires_in ?? 3600),
    scope: json.scope ?? '',
    token_type: json.token_type ?? 'Bearer',
  };
}

export async function refreshAccessToken(args: { refreshToken: string }): Promise<GoogleTokenBundle> {
  const cfg = requireConfig();
  const json = await postForm({
    grant_type: 'refresh_token',
    refresh_token: args.refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
  if (!json.access_token) throw new GoogleOAuthError('Refresh response missing access_token');
  return {
    access_token: json.access_token,
    ...(json.refresh_token ? { refresh_token: json.refresh_token } : {}),
    expires_at: Math.floor(Date.now() / 1000) + (json.expires_in ?? 3600),
    scope: json.scope ?? '',
    token_type: json.token_type ?? 'Bearer',
  };
}

export type GoogleUserInfo = {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

export async function fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await request(USERINFO_ENDPOINT, {
    method: 'GET',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (res.statusCode >= 400) {
    throw new GoogleOAuthError('Failed to fetch userinfo', 502);
  }
  const json = (await res.body.json()) as GoogleUserInfo;
  if (!json.email || !json.sub) throw new GoogleOAuthError('Userinfo missing email/sub');
  return json;
}
