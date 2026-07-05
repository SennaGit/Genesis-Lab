import assert from "node:assert/strict";
import test from "node:test";
import { createProvider } from "../providers/index.ts";
import { MockProvider } from "../providers/mock.ts";
import { OpenAICompatibleProvider, OpenAIProvider } from "../providers/openai_compatible.ts";
import { AnthropicProvider } from "../providers/anthropic.ts";
import { ModelRouter } from "../genesis/models/model_router.ts";

const baseConfig = {
  apiKey: "test-key",
  baseURL: "https://example.com/v1",
  model: "test-model"
};

test("createProvider supports mock provider", () => {
  const provider = createProvider({ provider: "mock", model: "mock-model" });
  assert.equal(provider instanceof MockProvider, true);
});

test("createProvider supports OpenAI provider", () => {
  const provider = createProvider({ provider: "openai", ...baseConfig });
  assert.equal(provider instanceof OpenAIProvider, true);
});

test("createProvider supports Anthropic provider", () => {
  const provider = createProvider({ provider: "anthropic", ...baseConfig });
  assert.equal(provider instanceof AnthropicProvider, true);
});

test("createProvider supports custom OpenAI-compatible endpoint", () => {
  const provider = createProvider({ provider: "custom", ...baseConfig });
  assert.equal(provider instanceof OpenAICompatibleProvider, true);
  assert.equal(provider.name, "custom");
});

test("createProvider supports legacy provider names", () => {
  assert.equal(createProvider({ provider: "local", model: "mock-model" }) instanceof MockProvider, true);
  assert.equal(createProvider({ provider: "openai-compatible", ...baseConfig }) instanceof OpenAICompatibleProvider, true);
});

test("ModelRouter reports provider health without exposing API keys", () => {
  assert.deepEqual(new ModelRouter({ provider: "mock" }).providerHealth().status, "mock");
  assert.deepEqual(new ModelRouter({ provider: "openai" }).providerHealth().status, "missing_api_key");
  assert.deepEqual(new ModelRouter({ provider: "custom", apiKey: "test-key" }).providerHealth().status, "missing_base_url");
  const ready = new ModelRouter({ provider: "custom", apiKey: "test-key", baseURL: "https://example.com/v1" }).providerHealth();
  assert.equal(ready.status, "ready");
  assert.doesNotMatch(JSON.stringify(ready), /test-key/);
});
