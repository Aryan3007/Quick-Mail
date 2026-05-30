import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/healthz', async () => ({ ok: true, status: 'ok', uptime: process.uptime() }));
  app.get('/readyz', async () => ({ ok: true, status: 'ready' }));
};
