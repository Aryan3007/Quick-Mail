import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { env } from '../env.js';
import {
  GoogleOAuthError,
  exchangeAuthorizationCode,
  fetchUserInfo,
  refreshAccessToken,
} from '../services/google-oauth.js';

const GMAIL_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
];

const ConfigSchema = z.object({});
const ExchangeSchema = z.object({
  code: z.string().min(1),
  redirect_uri: z.string().url(),
  code_verifier: z.string().min(43).max(128),
});
const RefreshSchema = z.object({
  refresh_token: z.string().min(1),
});

export const googleAuthRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/auth/google/config',
    { preHandler: app.requireDevice },
    async (_req, reply) => {
      ConfigSchema.parse({});
      if (!env.GOOGLE_CLIENT_ID) {
        return reply.code(503).send({
          ok: false,
          error: { code: 'google_not_configured', message: 'Google OAuth is not configured on the server' },
        });
      }
      return {
        ok: true,
        client_id: env.GOOGLE_CLIENT_ID,
        scopes: GMAIL_SCOPES,
        auth_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      };
    },
  );

  app.post(
    '/auth/google/exchange',
    { preHandler: app.requireDevice },
    async (req, reply) => {
      const parsed = ExchangeSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'invalid_body', message: 'Invalid exchange body', details: parsed.error.flatten() },
        });
      }
      try {
        const tokens = await exchangeAuthorizationCode({
          code: parsed.data.code,
          redirectUri: parsed.data.redirect_uri,
          codeVerifier: parsed.data.code_verifier,
        });
        const profile = await fetchUserInfo(tokens.access_token);
        req.log.info(
          { device_id: req.device?.device_id, email: profile.email },
          'google oauth exchanged',
        );
        return { ok: true, tokens, profile };
      } catch (err) {
        if (err instanceof GoogleOAuthError) {
          return reply.code(err.status).send({ ok: false, error: { code: err.code, message: err.message } });
        }
        throw err;
      }
    },
  );

  app.post(
    '/auth/google/refresh',
    { preHandler: app.requireDevice },
    async (req, reply) => {
      const parsed = RefreshSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'invalid_body', message: 'Invalid refresh body', details: parsed.error.flatten() },
        });
      }
      try {
        const tokens = await refreshAccessToken({ refreshToken: parsed.data.refresh_token });
        return { ok: true, tokens };
      } catch (err) {
        if (err instanceof GoogleOAuthError) {
          return reply.code(err.status).send({ ok: false, error: { code: err.code, message: err.message } });
        }
        throw err;
      }
    },
  );
};
