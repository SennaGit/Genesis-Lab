import type { ChatOutput } from "../../core/types.ts";
import { createProvider } from "../../providers/index.ts";
import type { ProviderConfig } from "../../providers/base.ts";
import type { ModelRole, RuntimeConfig } from "../types/research.ts";

export type { ModelRole } from "../types/research.ts";

export type RuntimeConfigInput = Partial<Omit<RuntimeConfig, "models" | "thresholds">> & {
  models?: Partial<Record<ModelRole, string>>;
  thresholds?: Partial<RuntimeConfig["thresholds"]>;
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

  constructor(config: RuntimeConfigInput = DEFAULT_RUNTIME_CONFIG) {
    this.config = normalizeRuntimeConfig(config);
  }

  async chat(role: ModelRole, messages: Array<{ role: "system" | "user" | "assistant"; content: string }>): Promise<ChatOutput> {
    const provider = createProvider(this.toProviderConfig(role));
    return provider.chat({ model: this.modelFor(role), messages });
  }

  modelFor(role: ModelRole): string {
    return this.config.models[role] || this.config.model;
  }

  runtimeConfig(): RuntimeConfig {
    return { ...this.config, models: { ...this.config.models }, thresholds: { ...this.config.thresholds } };
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
