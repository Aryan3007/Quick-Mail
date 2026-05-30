import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

import { verifyDeviceToken, type VerifiedDevice } from '../services/device-token.js';

declare module 'fastify' {
  interface FastifyRequest {
    device?: VerifiedDevice;
  }
}

const plugin: FastifyPluginAsync = async (app) => {
  app.decorateRequest('device', undefined);

  app.decorate('requireDevice', async (req: FastifyRequest) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw app.httpErrors.unauthorized('Missing bearer token');
    }
    const token = header.slice('Bearer '.length).trim();
    try {
      req.device = await verifyDeviceToken(token);
    } catch (err) {
      req.log.warn({ err }, 'device token verification failed');
      throw app.httpErrors.unauthorized('Invalid device token');
    }
  });
};

declare module 'fastify' {
  interface FastifyInstance {
    requireDevice: (req: FastifyRequest) => Promise<void>;
  }
}

export const authPlugin = fp(plugin, { name: 'auth' });
