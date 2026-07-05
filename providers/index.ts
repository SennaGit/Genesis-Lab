import type { LLMProvider, ProviderConfig } from "./base.ts";
import { getBaseURL, normalizeProviderName } from "./base.ts";
import { AnthropicProvider } from "./anthropic.ts";
import { MockProvider } from "./mock.ts";
import { OpenAIProvider } from "./openai.ts";
import { OpenAICompatibleProvider } from "./openai_compatible.ts";

export function createProvider(config: ProviderConfig): LLMProvider {
  if (config.provider === "local" && getBaseURL(config)) {
    return new OpenAICompatibleProvider(config, "local");
  }

  const provider = normalizeProviderName(config.provider);

  if (provider === "openai") {
    return new OpenAIProvider(config);
  }

  if (provider === "anthropic") {
    return new AnthropicProvider(config);
  }

  if (provider === "custom") {
    return new OpenAICompatibleProvider(config, config.provider === "openai-compatible" ? "openai-compatible" : "custom");
  }

  return new MockProvider();
}
