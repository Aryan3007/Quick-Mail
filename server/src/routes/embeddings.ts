import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import OpenAI from 'openai';

import { env } from '../env.js';

const BodySchema = z.object({
  input: z.array(z.string().min(1).max(20_000)).min(1).max(100),
  model: z.string().min(1).optional(),
});

let cached: OpenAI | null = null;
function getClient(): OpenAI {
  if (!cached) cached = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return cached;
}

export const embeddingsRoutes: FastifyPluginAsync = async (app) => {
  app.post('/embeddings', { preHandler: app.requireDevice }, async (req, reply) => {
    if (!env.OPENAI_API_KEY) {
      return reply.code(503).send({
        ok: false,
        error: {
          code: 'embeddings_not_configured',
          message: 'OPENAI_API_KEY is not set on the server; embeddings are unavailable.',
        },
      });
    }

    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'invalid_body',
          message: 'Invalid embeddings body',
          details: parsed.error.flatten(),
        },
      });
    }

    const client = getClient();
    const model = parsed.data.model ?? 'text-embedding-3-small';

    try {
      const result = await client.embeddings.create({
        model,
        input: parsed.data.input,
      });
      return {
        ok: true,
        model,
        vectors: result.data.map((d) => d.embedding),
        usage: { total_tokens: result.usage?.total_tokens ?? 0 },
      };
    } catch (err) {
      req.log.error({ err }, 'openai embeddings failed');
      return reply.code(502).send({
        ok: false,
        error: {
          code: 'embeddings_failed',
          message: err instanceof Error ? err.message : 'Embedding request failed',
        },
      });
    }
  });
};
