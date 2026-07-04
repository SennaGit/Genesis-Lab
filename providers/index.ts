import type { LLMProvider, ProviderConfig } from "./base.ts";
import { normalizeProviderName } from "./base.ts";
import { AnthropicProvider } from "./anthropic.ts";
import { MockProvider } from "./mock.ts";
import { OpenAIProvider } from "./openai.ts";
import { OpenAICompatibleProvider } from "./openai_compatible.ts";

export function createProvider(config: ProviderConfig): LLMProvider {
  const provider = normalizeProviderName(config.provider);

  if (provider === "openai") {
    return new OpenAIProvider(config);
  }

  if (provider === "anthropic") {
    return new AnthropicProvider(config);
  }

  if (provider === "custom") {
    return new OpenAICompatibleProvider(config, "custom");
  }

  return new MockProvider();
}
