import { GoogleGenAI } from '@google/genai';

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
        console.warn(`[Gemini] Hit 429 Rate Limit. Retrying in ${delay}ms... (Attempt ${attempt}/${retries})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2; // exponential backoff
        continue;
      }
      throw err;
    }
  }
}

export function createGeminiProvider(apiKey: string): AiProvider {
  const client = new GoogleGenAI({ apiKey });

  return {
    name: 'gemini',
    defaultModel: 'gemini-2.0-flash',
    async stream(args: AiStreamArgs, opts: AiStreamOptions): Promise<void> {
      const contents = args.messages.map((m) => {
        const parts: any[] = [];
        if (typeof m.content === 'string') {
          parts.push({ text: m.content });
        } else {
          for (const part of m.content) {
            if (part.type === 'text') {
              parts.push({ text: part.text });
            } else if (part.type === 'image') {
              parts.push({
                inlineData: {
                  mimeType: part.image.mimeType,
                  data: part.image.base64,
                },
              });
            }
          }
        }
        return {
          role: m.role === 'assistant' ? 'model' : 'user',
          parts,
        };
      });

      const stream = await withRetry(() => client.models.generateContentStream({
        model: args.model,
        contents,
        config: {
          maxOutputTokens: args.maxTokens,
          ...(args.system ? { systemInstruction: args.system } : {}),
          ...(args.temperature !== undefined ? { temperature: args.temperature } : {}),
        },
      }));

      let inputTokens = 0;
      let outputTokens = 0;

      for await (const chunk of stream) {
        if (opts.signal.aborted) break;
        const text = chunk.text;
        if (text) opts.onEvent({ type: 'text_delta', text });
        const usage = chunk.usageMetadata;
        if (usage) {
          inputTokens = usage.promptTokenCount ?? inputTokens;
          outputTokens = usage.candidatesTokenCount ?? outputTokens;
        }
      }

      opts.onEvent({
        type: 'message_stop',
        usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      });
    },
  };
}
