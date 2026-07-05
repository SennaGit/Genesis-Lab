import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_RUNTIME_CONFIG, normalizeRuntimeConfig } from "../models/model_router.ts";
import type { ModelRole, RuntimeConfig } from "../types/research.ts";

export function genesisHome(): string {
  return process.env.GENESIS_HOME || path.join(os.homedir(), ".genesis");
}

export function configPath(): string {
  return path.join(genesisHome(), "config.json");
}

export function mcpConfigPath(): string {
  return path.join(genesisHome(), "mcp.json");
}

export async function initGenesisHome(force = false): Promise<{ home: string; config: string; mcp: string; sessions: string }> {
  const home = genesisHome();
  const sessions = path.join(home, "sessions");
  await fs.mkdir(sessions, { recursive: true });
  if (force || !(await exists(configPath()))) {
    await saveRuntimeConfig(DEFAULT_RUNTIME_CONFIG);
  }
  if (force || !(await exists(mcpConfigPath()))) {
    await fs.writeFile(mcpConfigPath(), JSON.stringify({ servers: [], tools: [] }, null, 2), "utf8");
  }
  return { home, config: configPath(), mcp: mcpConfigPath(), sessions };
}

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  try {
    const raw = JSON.parse(await fs.readFile(configPath(), "utf8")) as Partial<RuntimeConfig> & {
      api_key?: string;
      base_url?: string;
      max_replans?: number;
      models?: Partial<Record<ModelRole | "planner" | "executor", string>>;
    };
    return normalizeRuntimeConfig({
      ...raw,
      apiKey: raw.apiKey ?? raw.api_key ?? "",
      baseURL: raw.baseURL ?? raw.base_url ?? "",
      models: normalizeModelRoutes(raw.models),
      thresholds: {
        confidence: raw.thresholds?.confidence ?? DEFAULT_RUNTIME_CONFIG.thresholds.confidence,
        max_replans: raw.thresholds?.max_replans ?? raw.max_replans ?? DEFAULT_RUNTIME_CONFIG.thresholds.max_replans
      }
    });
  } catch {
    return DEFAULT_RUNTIME_CONFIG;
  }
}

export async function saveRuntimeConfig(config: Partial<RuntimeConfig>): Promise<RuntimeConfig> {
  const normalized = normalizeRuntimeConfig(config);
  await fs.mkdir(genesisHome(), { recursive: true });
  await fs.writeFile(configPath(), JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

export async function setRuntimeConfigValue(key: string, value: string): Promise<RuntimeConfig> {
  const config = await loadRuntimeConfig();
  const next = structuredClone(config) as RuntimeConfig;
  const normalizedKey = normalizeKey(key);
  if (normalizedKey.startsWith("models.")) {
    const role = normalizedKey.split(".")[1] as ModelRole;
    assertModelRole(role);
    next.models[role] = value;
  } else if (normalizedKey.startsWith("thresholds.")) {
    const threshold = normalizedKey.split(".")[1] as keyof RuntimeConfig["thresholds"];
    assertThresholdKey(threshold);
    next.thresholds[threshold] = Number(value);
  } else if (normalizedKey === "provider") {
    next.provider = value as RuntimeConfig["provider"];
  } else if (normalizedKey === "apiKey") {
    next.apiKey = value;
  } else if (normalizedKey === "baseURL") {
    next.baseURL = value;
  } else if (normalizedKey === "model") {
    next.model = value;
  } else {
    throw new Error(`Unknown config key: ${key}`);
  }
  return saveRuntimeConfig(next);
}

export async function unsetRuntimeConfigValue(key: string): Promise<RuntimeConfig> {
  const config = await loadRuntimeConfig();
  const next = structuredClone(config) as RuntimeConfig;
  const normalizedKey = normalizeKey(key);
  if (normalizedKey === "apiKey") {
    next.apiKey = "";
  } else if (normalizedKey === "baseURL") {
    next.baseURL = "";
  } else if (normalizedKey.startsWith("models.")) {
    const role = normalizedKey.split(".")[1] as ModelRole;
    assertModelRole(role);
    next.models[role] = DEFAULT_RUNTIME_CONFIG.models[role];
  } else if (normalizedKey.startsWith("thresholds.")) {
    const threshold = normalizedKey.split(".")[1] as keyof RuntimeConfig["thresholds"];
    assertThresholdKey(threshold);
    next.thresholds[threshold] = DEFAULT_RUNTIME_CONFIG.thresholds[threshold];
  } else {
    throw new Error(`Unknown config key: ${key}`);
  }
  return saveRuntimeConfig(next);
}

export function redactConfig(config: RuntimeConfig): RuntimeConfig {
  return { ...config, apiKey: config.apiKey ? "******" : "" };
}

function normalizeModelRoutes(models: Partial<Record<ModelRole | "planner" | "executor", string>> | undefined): Partial<Record<ModelRole, string>> {
  if (!models) {
    return {};
  }
  const next: Partial<Record<ModelRole, string>> = {};
  for (const [key, value] of Object.entries(models)) {
    if (!value) {
      continue;
    }
    const role = normalizeModelRole(key);
    if (role) {
      next[role] = value;
    }
  }
  return next;
}

function normalizeKey(key: string): string {
  const map: Record<string, string> = {
    api_key: "apiKey",
    apiKey: "apiKey",
    base_url: "baseURL",
    baseURL: "baseURL",
    baseUrl: "baseURL",
    provider: "provider",
    model: "model",
    max_replans: "thresholds.max_replans",
    confidence: "thresholds.confidence",
    "models.planner": "models.planning",
    "models.executor": "models.execution"
  };
  return key.startsWith("models.") || key.startsWith("thresholds.") ? map[key] ?? key : map[key] ?? key;
}

function normalizeModelRole(key: string): ModelRole | undefined {
  if (key === "planner") {
    return "planning";
  }
  if (key === "executor") {
    return "execution";
  }
  if (key === "planning" || key === "execution" || key === "critic" || key === "synthesizer") {
    return key;
  }
  return undefined;
}

function assertModelRole(role: string): asserts role is ModelRole {
  if (!normalizeModelRole(role)) {
    throw new Error(`Unknown model role: ${role}`);
  }
}

function assertThresholdKey(key: string): asserts key is keyof RuntimeConfig["thresholds"] {
  if (key !== "confidence" && key !== "max_replans") {
    throw new Error(`Unknown threshold key: ${key}`);
  }
}

async function exists(file: string): Promise<boolean> {
  return fs.stat(file).then(() => true, () => false);
}
