import type { Tool, ToolCall } from "../tools/types.ts";

export type Role = "system" | "user" | "assistant" | "tool";

export type Message = {
  role: Role;
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
};

export type Observation = {
  toolCallId: string;
  toolName: string;
  output: unknown;
  error?: string;
};

export type AgentState = {
  messages: Message[];
  scratchpad: string;
  toolCalls: ToolCall[];
  observations: Observation[];
  final?: string;
  done: boolean;
  steps: number;
};

export type AgentResult = {
  output: string;
  steps: number;
  toolTrace: ToolCall[];
  observations: Observation[];
  state: AgentState;
};

export type Agent = {
  run(input: string, initialState?: AgentState): Promise<AgentResult>;
};

export type AgentEngine = {
  step(state: AgentState, input?: string): Promise<AgentState>;
};

export type Planner = {
  plan(state: AgentState, tools: Tool[]): Promise<PlannerAction>;
};

export type PlannerAction = {
  content: string;
  toolCalls: ToolCall[];
};

export function createInitialState(messages: Message[] = []): AgentState {
  return {
    messages,
    scratchpad: "",
    toolCalls: [],
    observations: [],
    done: false,
    steps: 0
  };
}
