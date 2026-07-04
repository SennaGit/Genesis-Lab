import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentResult, AgentState } from "../core/types.ts";
import type { ProviderConfig } from "./base.ts";

export type GenesisConfig = ProviderConfig & {
  language?: "zh";
};

export const DEFAULT_CONFIG: GenesisConfig = {
  provider: "mock",
  apiKey: "",
  baseURL: "",
  model: "gpt-4.1",
  max_steps: 6,
  language: "zh"
};

export function genesisHome(): string {
  return process.env.GENESIS_HOME || path.join(os.homedir(), ".genesis");
}

export function configPath(): string {
  return path.join(genesisHome(), "config.json");
}

export function memoryPath(): string {
  return path.join(genesisHome(), "state.json");
}

export async function loadConfig(): Promise<GenesisConfig> {
  try {
    const raw = await fs.readFile(configPath(), "utf8");
    return normalizeConfig({ ...DEFAULT_CONFIG, ...JSON.parse(raw) });
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(config: GenesisConfig): Promise<void> {
  await fs.mkdir(genesisHome(), { recursive: true });
  await fs.writeFile(configPath(), JSON.stringify(normalizeConfig(config), null, 2), "utf8");
}

export async function setConfigValue(key: string, value: string): Promise<GenesisConfig> {
  const config = await loadConfig();
  const normalizedKey = normalizeConfigKey(key);
  const parsedValue = normalizedKey === "max_steps" ? Number(value) : value;
  const next = normalizeConfig({ ...config, [normalizedKey]: parsedValue } as GenesisConfig);
  await saveConfig(next);
  return next;
}

export async function appendRun(result: AgentResult): Promise<void> {
  await fs.mkdir(genesisHome(), { recursive: true });
  const state = await loadMemoryState();
  state.runs.push({
    at: new Date().toISOString(),
    output: result.output,
    steps: result.steps,
    trace: result.trace,
    observations: result.observations
  });
  await fs.writeFile(memoryPath(), JSON.stringify(state, null, 2), "utf8");
}

export async function saveSessionState(sessionId: string, state: AgentState): Promise<void> {
  await fs.mkdir(genesisHome(), { recursive: true });
  const memory = await loadMemoryState();
  memory.sessions[sessionId] = state;
  await fs.writeFile(memoryPath(), JSON.stringify(memory, null, 2), "utf8");
}

export async function loadSessionState(sessionId: string): Promise<AgentState | undefined> {
  const memory = await loadMemoryState();
  return memory.sessions[sessionId];
}

function normalizeConfig(config: GenesisConfig): GenesisConfig {
  const apiKey = config.apiKey ?? config.api_key ?? "";
  const baseURL = config.baseURL ?? config.base_url ?? "";
  const provider = config.provider === "local" ? "mock" : config.provider === "openai-compatible" ? "custom" : config.provider;
  return {
    provider,
    apiKey,
    baseURL,
    model: config.model || DEFAULT_CONFIG.model,
    max_steps: config.max_steps ?? DEFAULT_CONFIG.max_steps,
    language: "zh"
  };
}

async function loadMemoryState(): Promise<MemoryState> {
  try {
    const raw = await fs.readFile(memoryPath(), "utf8");
    const parsed = JSON.parse(raw) as MemoryState;
    return {
      runs: parsed.runs ?? [],
      sessions: parsed.sessions ?? {}
    };
  } catch {
    return { runs: [], sessions: {} };
  }
}

function normalizeConfigKey(key: string): keyof GenesisConfig {
  const map: Record<string, keyof GenesisConfig> = {
    apiKey: "apiKey",
    api_key: "apiKey",
    baseURL: "baseURL",
    baseUrl: "baseURL",
    base_url: "baseURL",
    provider: "provider",
    model: "model",
    max_steps: "max_steps",
    maxSteps: "max_steps"
  };

  const normalized = map[key];
  if (!normalized) {
    throw new Error(`未知配置项：${key}`);
  }
  return normalized;
}

type MemoryState = {
  runs: Array<{
    at: string;
    output: string;
    steps: number;
    trace: unknown[];
    observations: unknown[];
  }>;
  sessions: Record<string, AgentState>;
};

