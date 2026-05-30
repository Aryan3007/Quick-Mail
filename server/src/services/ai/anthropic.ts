import Anthropic from '@anthropic-ai/sdk';

import type { AiProvider, AiStreamArgs, AiStreamOptions } from './types.js';

export function createAnthropicProvider(apiKey: string): AiProvider {
  const client = new Anthropic({ apiKey });

  return {
    name: 'anthropic',
    defaultModel: 'claude-sonnet-4-6',
    async stream(args: AiStreamArgs, opts: AiStreamOptions): Promise<void> {
      const messages = args.messages.map((m) => {
        if (typeof m.content === 'string') {
          return { role: m.role, content: m.content };
        } else {
          const contentParts: Anthropic.MessageParam['content'] = m.content.map((part) => {
            if (part.type === 'text') {
              return { type: 'text', text: part.text };
            } else {
              return {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: part.image.mimeType as any,
                  data: part.image.base64,
                },
              };
            }
          });
          return { role: m.role, content: contentParts };
        }
      });

      const stream = client.messages.stream(
        {
          model: args.model,
          max_tokens: args.maxTokens,
          ...(args.system ? { system: args.system } : {}),
          ...(args.temperature !== undefined ? { temperature: args.temperature } : {}),
          messages,
        },
        { signal: opts.signal },
      );

      stream.on('text', (delta) => {
        opts.onEvent({ type: 'text_delta', text: delta });
      });

      const final = await stream.finalMessage();
      opts.onEvent({
        type: 'message_stop',
        usage: {
          input_tokens: final.usage.input_tokens,
          output_tokens: final.usage.output_tokens,
        },
      });
    },
  };
}
