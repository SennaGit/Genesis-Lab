import type { LLMProvider, ProviderConfig } from "./base.ts";
import { AnthropicProvider } from "./anthropic.ts";
import { LocalProvider } from "./local.ts";
import { OpenAIProvider } from "./openai.ts";
import { OpenAICompatibleProvider } from "./openai_compatible.ts";

export function createProvider(config: ProviderConfig): LLMProvider {
  if (config.provider === "openai") {
    return new OpenAIProvider(config);
  }

  if (config.provider === "anthropic") {
    return new AnthropicProvider(config);
  }

  if (config.provider === "openai-compatible") {
    return new OpenAICompatibleProvider(config);
  }

  return new LocalProvider();
}
