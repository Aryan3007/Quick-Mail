import { env } from '../../env.js';
import { createAnthropicProvider } from './anthropic.js';
import { createGeminiProvider } from './gemini.js';
import { createOpenAiProvider } from './openai.js';
import type { AiProvider, ProviderName } from './types.js';

export type { AiMessage, AiProvider, AiStreamArgs, AiStreamEvent, ProviderName } from './types.js';

export function createProvider(name: ProviderName, apiKey: string): AiProvider {
  switch (name) {
    case 'anthropic':
      return createAnthropicProvider(apiKey);
    case 'openai':
      return createOpenAiProvider(apiKey);
    case 'gemini':
      return createGeminiProvider(apiKey);
  }
}

export function defaultModelFor(name: ProviderName): string {
  switch (name) {
    case 'anthropic':
      return 'claude-sonnet-4-6';
    case 'openai':
      return 'gpt-4o-mini';
    case 'gemini':
      return 'gemini-2.0-flash';
  }
}

export class ProviderNotConfiguredError extends Error {
  readonly code = 'provider_not_configured';
  constructor(readonly provider: ProviderName, message: string) {
    super(message);
  }
}

let cached: AiProvider | null = null;

export function getActiveProvider(): AiProvider {
  if (cached) return cached;

  switch (env.AI_PROVIDER) {
    case 'anthropic': {
      if (!env.ANTHROPIC_API_KEY) {
        throw new ProviderNotConfiguredError(
          'anthropic',
          'AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set',
        );
      }
      cached = createAnthropicProvider(env.ANTHROPIC_API_KEY);
      return cached;
    }
    case 'openai': {
      if (!env.OPENAI_API_KEY) {
        throw new ProviderNotConfiguredError(
          'openai',
          'AI_PROVIDER=openai but OPENAI_API_KEY is not set',
        );
      }
      cached = createOpenAiProvider(env.OPENAI_API_KEY);
      return cached;
    }
    case 'gemini': {
      if (!env.GEMINI_API_KEY) {
        throw new ProviderNotConfiguredError(
          'gemini',
          'AI_PROVIDER=gemini but GEMINI_API_KEY is not set',
        );
      }
      cached = createGeminiProvider(env.GEMINI_API_KEY);
      return cached;
    }
  }
}

export function getActiveProviderModel(): string {
  return env.AI_MODEL ?? getActiveProvider().defaultModel;
}
