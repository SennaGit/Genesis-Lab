import { randomUUID } from "node:crypto";
import type { ChatOutput, Message, TokenUsage } from "../../core/types.ts";
import { createProvider } from "../../providers/index.ts";
import type { ProviderConfig } from "../../providers/base.ts";
import type { ModelCallTrace, ModelRole, RuntimeConfig } from "../types/research.ts";

export type { ModelRole } from "../types/research.ts";

export type RuntimeConfigInput = Partial<Omit<RuntimeConfig, "models" | "thresholds">> & {
  models?: Partial<Record<ModelRole, string>>;
  thresholds?: Partial<RuntimeConfig["thresholds"]>;
};

export type ProviderHealth = {
  ok: boolean;
  status: "mock" | "ready" | "missing_api_key" | "missing_base_url";
  provider: RuntimeConfig["provider"];
  message: string;
};

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  provider: "mock",
  apiKey: "",
  baseURL: "",
  model: "gpt-4.1",
  models: {
    planning: "gpt-4.1",
    execution: "gpt-4.1-mini",
    critic: "gpt-4.1",
    synthesizer: "gpt-4.1-mini"
  },
  thresholds: {
    confidence: 0.65,
    max_replans: 1
  }
};

export class ModelRouter {
  private readonly config: RuntimeConfig;
  private readonly callTraces: ModelCallTrace[] = [];

  constructor(config: RuntimeConfigInput = DEFAULT_RUNTIME_CONFIG) {
    this.config = normalizeRuntimeConfig(config);
  }

  async chat(role: ModelRole, messages: Array<{ role: "system" | "user" | "assistant"; content: string }>): Promise<ChatOutput> {
    const provider = createProvider(this.toProviderConfig(role));
    const model = this.modelFor(role);
    const started = new Date();
    try {
      const response = await provider.chat({ model, messages });
      const completed = new Date();
      this.callTraces.push({
        id: `model_${randomUUID()}`,
        role,
        provider: this.config.provider,
        model,
        started_at: started.toISOString(),
        completed_at: completed.toISOString(),
        latency_ms: completed.getTime() - started.getTime(),
        ok: true,
        usage: normalizeUsage(response.usage ?? estimateUsage(messages, response.content))
      });
      return response;
    } catch (error) {
      const completed = new Date();
      this.callTraces.push({
        id: `model_${randomUUID()}`,
        role,
        provider: this.config.provider,
        model,
        started_at: started.toISOString(),
        completed_at: completed.toISOString(),
        latency_ms: completed.getTime() - started.getTime(),
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  modelFor(role: ModelRole): string {
    return this.config.models[role] || this.config.model;
  }

  runtimeConfig(): RuntimeConfig {
    return { ...this.config, models: { ...this.config.models }, thresholds: { ...this.config.thresholds } };
  }

  modelUsage(): ModelCallTrace[] {
    return this.callTraces.map((call) => ({ ...call, usage: call.usage ? { ...call.usage } : undefined }));
  }

  totalUsage(): TokenUsage {
    return this.callTraces.reduce<TokenUsage>((total, call) => mergeUsage(total, call.usage), {});
  }

  providerHealth(): ProviderHealth {
    if (this.config.provider === "mock") {
      return {
        ok: true,
        status: "mock",
        provider: this.config.provider,
        message: "mock provider active"
      };
    }

    if ((this.config.provider === "custom" || this.config.provider === "openai-compatible" || this.config.provider === "local") && !this.config.baseURL) {
      return {
        ok: false,
        status: "missing_base_url",
        provider: this.config.provider,
        message: "OpenAI-compatible/custom/local providers require baseURL."
      };
    }

    if (this.config.provider !== "local" && !this.config.apiKey) {
      return {
        ok: false,
        status: "missing_api_key",
        provider: this.config.provider,
        message: "provider requires apiKey"
      };
    }

    return {
      ok: true,
      status: "ready",
      provider: this.config.provider,
      message: "provider configuration is usable"
    };
  }

  redactedConfig(): RuntimeConfig {
    const next = this.runtimeConfig();
    if (next.apiKey) {
      next.apiKey = "******";
    }
    return next;
  }

  private toProviderConfig(role: ModelRole): ProviderConfig {
    return {
      provider: this.config.provider,
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
      model: this.modelFor(role)
    };
  }
}

export function normalizeRuntimeConfig(input: RuntimeConfigInput = {}): RuntimeConfig {
  const models = { ...DEFAULT_RUNTIME_CONFIG.models, ...(input.models ?? {}) };
  const thresholds = { ...DEFAULT_RUNTIME_CONFIG.thresholds, ...(input.thresholds ?? {}) };
  return {
    provider: input.provider ?? DEFAULT_RUNTIME_CONFIG.provider,
    apiKey: input.apiKey ?? "",
    baseURL: input.baseURL ?? "",
    model: input.model ?? DEFAULT_RUNTIME_CONFIG.model,
    models,
    thresholds
  };
}

function estimateUsage(messages: Message[], output: string): TokenUsage {
  const promptChars = messages.reduce((sum, message) => sum + message.content.length, 0);
  const promptTokens = Math.max(1, Math.ceil(promptChars / 4));
  const completionTokens = Math.max(1, Math.ceil(output.length / 4));
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens
  };
}

function normalizeUsage(usage: TokenUsage | undefined): TokenUsage | undefined {
  if (!usage) {
    return undefined;
  }
  const total = usage.total_tokens ?? sumDefined(usage.prompt_tokens, usage.completion_tokens) ?? sumDefined(usage.input_tokens, usage.output_tokens);
  return {
    prompt_tokens: usage.prompt_tokens,
    completion_tokens: usage.completion_tokens,
    total_tokens: total,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cached_tokens: usage.cached_tokens,
    reasoning_tokens: usage.reasoning_tokens
  };
}

function mergeUsage(total: TokenUsage, next: TokenUsage | undefined): TokenUsage {
  if (!next) {
    return total;
  }
  return {
    prompt_tokens: add(total.prompt_tokens, next.prompt_tokens),
    completion_tokens: add(total.completion_tokens, next.completion_tokens),
    total_tokens: add(total.total_tokens, next.total_tokens),
    input_tokens: add(total.input_tokens, next.input_tokens),
    output_tokens: add(total.output_tokens, next.output_tokens),
    cached_tokens: add(total.cached_tokens, next.cached_tokens),
    reasoning_tokens: add(total.reasoning_tokens, next.reasoning_tokens)
  };
}

function add(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined) {
    return right;
  }
  if (right === undefined) {
    return left;
  }
  return left + right;
}

function sumDefined(left: number | undefined, right: number | undefined): number | undefined {
  return left !== undefined && right !== undefined ? left + right : undefined;
}
