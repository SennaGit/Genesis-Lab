import type { ChatInput, ChatOutput, LLMClient } from "../core/types.ts";

export type { ChatInput, ChatOutput } from "../core/types.ts";

export type ProviderName = "openai" | "anthropic" | "custom" | "mock";
export type LegacyProviderName = "local" | "openai-compatible";
export type SupportedProviderName = ProviderName | LegacyProviderName;

export type ProviderConfig = {
  provider: SupportedProviderName;
  apiKey?: string;
  baseURL?: string;
  model: string;
  api_key?: string;
  base_url?: string;
  max_steps?: number;
};

export interface LLMProvider extends LLMClient {
  readonly name: SupportedProviderName;
  chat(input: ChatInput): Promise<ChatOutput>;
}

export function getApiKey(config: ProviderConfig): string | undefined {
  return config.apiKey ?? config.api_key;
}

export function getBaseURL(config: ProviderConfig): string | undefined {
  return config.baseURL ?? config.base_url;
}

export function requireApiKey(config: ProviderConfig): string {
  const apiKey = getApiKey(config);
  if (!apiKey) {
    throw new Error("Missing API key. Run genesis config set apiKey <your-key> first.");
  }
  return apiKey;
}

export function normalizeProviderName(provider: SupportedProviderName): ProviderName {
  if (provider === "local") {
    return "mock";
  }
  if (provider === "openai-compatible") {
    return "custom";
  }
  return provider;
}
