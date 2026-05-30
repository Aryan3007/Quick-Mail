import OpenAI from 'openai';

import type { AiProvider, AiStreamArgs, AiStreamOptions } from './types.js';

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      const isRateLimit = err?.message?.includes('429') || err?.status === 429 || String(err).includes('429');
      if (isRateLimit && attempt <= retries) {
        console.warn(`[OpenAI] Hit 429 Rate Limit. Retrying in ${delay}ms... (Attempt ${attempt}/${retries})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2; // exponential backoff
        continue;
      }
      throw err;
    }
  }
}

export function createOpenAiProvider(apiKey: string): AiProvider {
  const client = new OpenAI({ apiKey });

  return {
    name: 'openai',
    defaultModel: 'gpt-4o-mini',
    async stream(args: AiStreamArgs, opts: AiStreamOptions): Promise<void> {
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
      if (args.system) messages.push({ role: 'system', content: args.system });
      for (const m of args.messages) {
        if (typeof m.content === 'string') {
          messages.push({ role: m.role, content: m.content });
        } else {
          const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = m.content.map((part) => {
            if (part.type === 'text') {
              return { type: 'text', text: part.text };
            } else {
              return {
                type: 'image_url',
                image_url: {
                  url: `data:${part.image.mimeType};base64,${part.image.base64}`,
                },
              };
            }
          });
          messages.push({ role: m.role, content: contentParts } as any);
        }
      }

      const stream = await withRetry(() => client.chat.completions.create(
        {
          model: args.model,
          messages,
          max_tokens: args.maxTokens,
          ...(args.temperature !== undefined ? { temperature: args.temperature } : {}),
          stream: true,
          stream_options: { include_usage: true },
        },
        { signal: opts.signal },
      ));

      let inputTokens = 0;
      let outputTokens = 0;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) opts.onEvent({ type: 'text_delta', text: delta });
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens ?? 0;
          outputTokens = chunk.usage.completion_tokens ?? 0;
        }
      }

      opts.onEvent({
        type: 'message_stop',
        usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      });
    },
  };
}
