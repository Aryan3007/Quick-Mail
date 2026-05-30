import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { issueDeviceToken } from '../services/device-token.js';

const RegisterSchema = z.object({
  device_id: z.string().min(8).max(128),
  platform: z.string().min(1).max(32),
});

export const devicesRoutes: FastifyPluginAsync = async (app) => {
  app.post('/devices/register', async (req, reply) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: { code: 'invalid_body', message: 'Invalid registration body', details: parsed.error.flatten() },
      });
    }

    const { token, expiresAt } = await issueDeviceToken(parsed.data);
    req.log.info({ device_id: parsed.data.device_id, platform: parsed.data.platform }, 'device registered');
    return {
      ok: true,
      device_token: token,
      expires_at: expiresAt,
    };
  });

  app.get(
    '/devices/me',
    { preHandler: app.requireDevice },
    async (req) => ({
      ok: true,
      device: req.device,
    }),
  );
};
