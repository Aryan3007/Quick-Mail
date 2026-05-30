import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import type { FastifyError, FastifyReply, FastifyRequest, FastifyServerOptions } from 'fastify';

import { env } from './env.js';
import { authPlugin } from './plugins/auth.js';
import { devicesRoutes } from './routes/devices.js';
import { embeddingsRoutes } from './routes/embeddings.js';
import { googleAuthRoutes } from './routes/google-auth.js';
import { healthRoutes } from './routes/health.js';
import { messagesRoutes } from './routes/messages.js';

export async function buildApp() {
  const loggerOptions: FastifyServerOptions['logger'] = {
    level: env.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-api-key"]',
        'res.headers["set-cookie"]',
      ],
      censor: '[redacted]',
    },
  };
  if (env.NODE_ENV === 'development') {
    loggerOptions.transport = {
      target: 'pino-pretty',
      options: { translateTime: 'SYS:HH:MM:ss', singleLine: true },
    };
  }

  const app = Fastify({
    logger: loggerOptions,
    disableRequestLogging: false,
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
  });

  await app.register(sensible);

  await app.register(cors, {
    origin: env.CORS_ORIGINS.length === 0 ? false : env.CORS_ORIGINS,
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
  });

  await app.register(authPlugin);

  await app.register(healthRoutes);
  await app.register(devicesRoutes, { prefix: '/v1' });
  await app.register(googleAuthRoutes, { prefix: '/v1' });
  await app.register(messagesRoutes, { prefix: '/v1' });
  await app.register(embeddingsRoutes, { prefix: '/v1' });

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({ ok: false, error: { code: 'not_found', message: `No route ${req.method} ${req.url}` } });
  });

  app.setErrorHandler((err: FastifyError, req: FastifyRequest, reply: FastifyReply) => {
    req.log.error({ err }, 'request failed');
    const status = err.statusCode ?? 500;
    reply.code(status).send({
      ok: false,
      error: {
        code: err.code ?? (status >= 500 ? 'internal_error' : 'bad_request'),
        message: status >= 500 ? 'Internal Server Error' : err.message,
      },
    });
  });

  return app;
}
