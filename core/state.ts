import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentResult, AgentState } from "./types.ts";
import type { ProviderConfig } from "../providers/base.ts";

export type GenesisConfig = ProviderConfig & {
  language?: "zh";
};

export const DEFAULT_CONFIG: GenesisConfig = {
  provider: "local",
  api_key: "",
  base_url: "",
  model: "",
  max_steps: 6,
  language: "zh"
};

export function genesisHome(): string {
  return process.env.GENESIS_HOME || path.join(os.homedir(), ".genesis");
}

export function configPath(): string {
  return path.join(genesisHome(), "config.json");
}

export function statePath(): string {
  return path.join(genesisHome(), "state.json");
}

export async function loadConfig(): Promise<GenesisConfig> {
  try {
    const raw = await fs.readFile(configPath(), "utf8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(config: GenesisConfig): Promise<void> {
  await fs.mkdir(genesisHome(), { recursive: true });
  await fs.writeFile(configPath(), JSON.stringify(config, null, 2), "utf8");
}

export async function setConfigValue(key: string, value: string): Promise<GenesisConfig> {
  const config = await loadConfig();
  const normalizedKey = normalizeConfigKey(key);
  const parsedValue = normalizedKey === "max_steps" ? Number(value) : value;
  const next = { ...config, [normalizedKey]: parsedValue } as GenesisConfig;
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
    toolTrace: result.toolTrace,
    observations: result.observations
  });
  await fs.writeFile(statePath(), JSON.stringify(state, null, 2), "utf8");
}

export async function saveSessionState(sessionId: string, state: AgentState): Promise<void> {
  await fs.mkdir(genesisHome(), { recursive: true });
  const memory = await loadMemoryState();
  memory.sessions[sessionId] = state;
  await fs.writeFile(statePath(), JSON.stringify(memory, null, 2), "utf8");
}

export async function loadSessionState(sessionId: string): Promise<AgentState | undefined> {
  const memory = await loadMemoryState();
  return memory.sessions[sessionId];
}

async function loadMemoryState(): Promise<MemoryState> {
  try {
    const raw = await fs.readFile(statePath(), "utf8");
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
    apiKey: "api_key",
    api_key: "api_key",
    baseURL: "base_url",
    baseUrl: "base_url",
    base_url: "base_url",
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
    toolTrace: unknown[];
    observations: unknown[];
  }>;
  sessions: Record<string, AgentState>;
};
