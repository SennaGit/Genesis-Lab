import type { Message } from "../core/types.ts";
import type { ToolCall, Tool } from "../tools/types.ts";

export type ProviderName = "local" | "openai" | "anthropic" | "openai-compatible";

export type ProviderConfig = {
  provider: ProviderName;
  api_key?: string;
  base_url?: string;
  model?: string;
  max_steps?: number;
};

export type ChatInput = {
  messages: Message[];
  tools?: Tool[];
  model?: string;
};

export type ChatOutput = {
  content: string;
  toolCalls?: ToolCall[];
};

export interface LLMProvider {
  readonly name: ProviderName;
  chat(input: ChatInput): Promise<ChatOutput>;
}

export function requireApiKey(config: ProviderConfig): string {
  if (!config.api_key) {
    throw new Error("缺少 API Key。请先运行 genesis config set api_key <你的密钥>。");
  }
  return config.api_key;
}
