export type ProviderName = 'anthropic' | 'openai' | 'gemini';

export type AiMessagePart =
  | { type: 'text'; text: string }
  | { type: 'image'; image: { mimeType: string; base64: string } };

export type AiMessage = {
  role: 'user' | 'assistant';
  content: string | AiMessagePart[];
};

export type AiStreamArgs = {
  model: string;
  system?: string | undefined;
  messages: AiMessage[];
  maxTokens: number;
  temperature?: number | undefined;
};

export type AiStreamEvent =
  | { type: 'text_delta'; text: string }
  | {
      type: 'message_stop';
      usage?: { input_tokens: number; output_tokens: number } | undefined;
    };

export type AiStreamOptions = {
  signal: AbortSignal;
  onEvent: (event: AiStreamEvent) => void;
};

export interface AiProvider {
  readonly name: ProviderName;
  readonly defaultModel: string;
  stream(args: AiStreamArgs, opts: AiStreamOptions): Promise<void>;
}
