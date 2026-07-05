export type Role = "system" | "user" | "assistant" | "tool";

export type Message = {
  role: Role;
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
};

export type ToolCall = {
  id: string;
  name: string;
  input: unknown;
};

export type Observation = {
  toolCallId: string;
  toolName: string;
  output: unknown;
  error?: string;
};

export interface Tool {
  name: string;
  description: string;
  inputSchema: object;
  run(input: unknown): Promise<unknown>;
}

export interface ToolRegistry {
  register(tool: Tool): void;
  get(name: string): Tool;
  list(): Tool[];
}

export type ChatInput = {
  messages: Message[];
  tools?: Tool[];
  model?: string;
};

export type TokenUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  cached_tokens?: number;
  reasoning_tokens?: number;
};

export type ChatOutput = {
  content: string;
  toolCalls?: ToolCall[];
  usage?: TokenUsage;
};

export interface LLMClient {
  chat(input: ChatInput): Promise<ChatOutput>;
}

export type AgentState = {
  messages: Message[];
  scratchpad: string;
  toolCalls: ToolCall[];
  observations: Observation[];
  final?: string;
  done: boolean;
  steps: number;
};

export type AgentRunResult = {
  output: string;
  trace: unknown[];
};

export type AgentResult = AgentRunResult & {
  steps: number;
  toolTrace: ToolCall[];
  observations: Observation[];
  state: AgentState;
};

export interface Agent {
  run(task: string): Promise<AgentRunResult>;
}

export interface StatefulAgent {
  run(task: string, initialState?: AgentState): Promise<AgentResult>;
}

export interface AgentEngine {
  step(state: AgentState, input?: string): Promise<AgentState>;
}

export interface Planner {
  plan(state: AgentState, tools: Tool[]): Promise<PlannerAction>;
}

export type PlannerAction = {
  content: string;
  toolCalls: ToolCall[];
};

