import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentResult, AgentState, Message, Observation, ToolCall } from "../core/types.ts";
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
  state.runs.push(toPersistedRun(result));
  await writeMemoryState(state);
}

export async function saveSessionState(sessionId: string, state: AgentState): Promise<void> {
  await fs.mkdir(genesisHome(), { recursive: true });
  const memory = await loadMemoryState();
  memory.sessions[sessionId] = toPersistedSessionState(state);
  await writeMemoryState(memory);
}

export async function loadSessionState(sessionId: string): Promise<AgentState | undefined> {
  const memory = await loadMemoryState();
  const session = memory.sessions[sessionId];
  return session ? toAgentState(session) : undefined;
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
    return normalizeMemoryState(JSON.parse(raw));
  } catch {
    return { runs: [], sessions: {} };
  }
}

async function writeMemoryState(state: MemoryState): Promise<void> {
  await fs.writeFile(memoryPath(), JSON.stringify(state, null, 2), "utf8");
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
  runs: PersistedRun[];
  sessions: Record<string, PersistedSessionState>;
};

type PersistedRun = {
  at: string;
  output: string;
  steps: number;
  trace: unknown[];
  observations: Observation[];
};

type PersistedSessionState = AgentState & {
  trace: unknown[];
};

function normalizeMemoryState(value: unknown): MemoryState {
  const record = isRecord(value) ? value : {};
  const sessions = isRecord(record.sessions) ? record.sessions : {};

  return {
    runs: arrayValue<unknown>(record.runs).map(normalizeRun),
    sessions: Object.fromEntries(
      Object.entries(sessions).map(([sessionId, session]) => [
        sessionId,
        toPersistedSessionState(normalizeSessionState(session))
      ])
    )
  };
}

function normalizeRun(value: unknown): PersistedRun {
  const record = isRecord(value) ? value : {};
  const observations = arrayValue<Observation>(record.observations);
  const trace = Array.isArray(record.trace)
    ? record.trace
    : [...arrayValue<ToolCall>(record.toolTrace), ...observations];

  return {
    at: typeof record.at === "string" ? record.at : "",
    output: typeof record.output === "string" ? record.output : "",
    steps: typeof record.steps === "number" ? record.steps : 0,
    trace,
    observations
  };
}

function toPersistedRun(result: AgentResult): PersistedRun {
  return {
    at: new Date().toISOString(),
    output: result.output,
    steps: result.steps,
    trace: result.trace,
    observations: result.observations
  };
}

function normalizeSessionState(value: unknown): AgentState {
  const record = isRecord(value) ? value : {};
  const trace = arrayValue<unknown>(record.trace);
  const toolCalls = firstArrayValue<ToolCall>(record.toolCalls, record.toolTrace) ?? toolCallsFromTrace(trace);
  const observations = Array.isArray(record.observations)
    ? arrayValue<Observation>(record.observations)
    : observationsFromTrace(trace);

  return {
    messages: arrayValue<Message>(record.messages),
    scratchpad: typeof record.scratchpad === "string" ? record.scratchpad : "",
    toolCalls,
    observations,
    final: typeof record.final === "string" ? record.final : undefined,
    done: typeof record.done === "boolean" ? record.done : false,
    steps: typeof record.steps === "number" ? record.steps : 0
  };
}

function toPersistedSessionState(state: AgentState): PersistedSessionState {
  const normalized = normalizeSessionState(state);
  return {
    ...normalized,
    trace: [...normalized.toolCalls, ...normalized.observations]
  };
}

function toAgentState(state: PersistedSessionState): AgentState {
  const { trace: _trace, ...agentState } = state;
  return agentState;
}

function firstArrayValue<T>(...values: unknown[]): T[] | undefined {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value as T[];
    }
  }
  return undefined;
}

function arrayValue<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function toolCallsFromTrace(trace: unknown[]): ToolCall[] {
  return trace.filter(isToolCall);
}

function observationsFromTrace(trace: unknown[]): Observation[] {
  return trace.filter(isObservation);
}

function isToolCall(value: unknown): value is ToolCall {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string";
}

function isObservation(value: unknown): value is Observation {
  return isRecord(value) && typeof value.toolCallId === "string" && typeof value.toolName === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
