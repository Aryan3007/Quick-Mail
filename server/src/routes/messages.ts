import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import {
  ProviderNotConfiguredError,
  createProvider,
  defaultModelFor,
  getActiveProvider,
  getActiveProviderModel,
  type AiMessage,
  type AiProvider,
  type ProviderName,
} from '../services/ai/index.js';

const MessagePartSchema = z.union([
  z.object({
    type: z.literal('text'),
    text: z.string(),
  }),
  z.object({
    type: z.literal('image'),
    image: z.object({
      mimeType: z.string(),
      base64: z.string(),
    }),
  }),
]);

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.union([
    z.string(),
    z.array(MessagePartSchema),
  ]),
});

const ProviderEnum = z.enum(['anthropic', 'openai', 'gemini']);

const BodySchema = z.object({
  provider: ProviderEnum.optional(),
  api_key: z.string().min(8).max(512).optional(),
  model: z.string().min(1).optional(),
  system: z.string().max(20_000).optional(),
  messages: z.array(MessageSchema).min(1),
  max_tokens: z.number().int().positive().max(8192).default(1024),
  temperature: z.number().min(0).max(1).optional(),
  stream: z.boolean().default(true),
});

function resolveProvider(
  override?: ProviderName,
  apiKey?: string,
): { provider: AiProvider; defaultModel: string } {
  if (override && apiKey) {
    return { provider: createProvider(override, apiKey), defaultModel: defaultModelFor(override) };
  }
  const provider = getActiveProvider();
  return { provider, defaultModel: getActiveProviderModel() };
}

export const messagesRoutes: FastifyPluginAsync = async (app) => {
  app.get('/ai/info', { preHandler: app.requireDevice }, async () => {
    try {
      const provider = getActiveProvider();
      return {
        ok: true,
        provider: provider.name,
        model: getActiveProviderModel(),
      };
    } catch (err) {
      if (err instanceof ProviderNotConfiguredError) {
        return { ok: false, error: { code: err.code, message: err.message, provider: err.provider } };
      }
      throw err;
    }
  });

  app.post('/messages', { preHandler: app.requireDevice }, async (req, reply) => {
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: { code: 'invalid_body', message: 'Invalid request body', details: parsed.error.flatten() },
      });
    }

    const body = parsed.data;
    if (!body.stream) {
      return reply.code(400).send({
        ok: false,
        error: { code: 'streaming_required', message: 'Non-streaming responses are not supported yet' },
      });
    }

    let provider: AiProvider;
    let defaultModel: string;
    try {
      ({ provider, defaultModel } = resolveProvider(body.provider, body.api_key));
    } catch (err) {
      if (err instanceof ProviderNotConfiguredError) {
        return reply.code(503).send({
          ok: false,
          error: { code: err.code, message: err.message, provider: err.provider },
        });
      }
      throw err;
    }

    const messages: AiMessage[] = body.messages.map((m) => ({ role: m.role, content: m.content }));
    const model = body.model ?? defaultModel;

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders?.();

    reply.raw.write(`event: message_start\ndata: ${JSON.stringify({ provider: provider.name, model })}\n\n`);

    const abort = new AbortController();
    req.raw.on('close', () => abort.abort());

    try {
      await provider.stream(
        {
          model,
          system: body.system,
          messages,
          maxTokens: body.max_tokens,
          temperature: body.temperature,
        },
        {
          signal: abort.signal,
          onEvent: (event) => {
            reply.raw.write(`event: ${event.type}\n`);
            reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
          },
        },
      );
      reply.raw.write('event: done\ndata: {}\n\n');
    } catch (err) {
      req.log.error({ err, provider: provider.name }, 'ai stream failed');
      reply.raw.write(
        `event: error\ndata: ${JSON.stringify({
          message: err instanceof Error ? err.message : 'stream_failed',
        })}\n\n`,
      );
    } finally {
      reply.raw.end();
    }
  });
};
