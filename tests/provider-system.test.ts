import assert from "node:assert/strict";
import test from "node:test";
import { createProvider } from "../providers/index.ts";
import { MockProvider } from "../providers/mock.ts";
import { OpenAICompatibleProvider, OpenAIProvider } from "../providers/openai_compatible.ts";
import { AnthropicProvider } from "../providers/anthropic.ts";

const baseConfig = {
  apiKey: "test-key",
  baseURL: "https://example.com/v1",
  model: "test-model"
};

test("createProvider 支持 mock provider", () => {
  const provider = createProvider({ provider: "mock", model: "mock-model" });
  assert.equal(provider instanceof MockProvider, true);
});

test("createProvider 支持 OpenAI provider", () => {
  const provider = createProvider({ provider: "openai", ...baseConfig });
  assert.equal(provider instanceof OpenAIProvider, true);
});

test("createProvider 支持 Anthropic provider", () => {
  const provider = createProvider({ provider: "anthropic", ...baseConfig });
  assert.equal(provider instanceof AnthropicProvider, true);
});

test("createProvider 支持 custom OpenAI-compatible endpoint", () => {
  const provider = createProvider({ provider: "custom", ...baseConfig });
  assert.equal(provider instanceof OpenAICompatibleProvider, true);
  assert.equal(provider.name, "custom");
});

test("createProvider 兼容旧 provider 名称", () => {
  assert.equal(createProvider({ provider: "local", model: "mock-model" }) instanceof MockProvider, true);
  assert.equal(createProvider({ provider: "openai-compatible", ...baseConfig }) instanceof OpenAICompatibleProvider, true);
});
