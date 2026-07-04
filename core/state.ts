import type { AgentState, Message, Observation, PlannerAction } from "./types.ts";

export function createInitialState(messages: Message[] = []): AgentState {
  return {
    messages: [...messages],
    scratchpad: "",
    toolCalls: [],
    observations: [],
    done: false,
    steps: 0
  };
}

export function appendUserInput(state: AgentState, input: string): AgentState {
  return {
    ...state,
    messages: [...state.messages, { role: "user", content: input }]
  };
}

export function applyPlannerAction(state: AgentState, action: PlannerAction): AgentState {
  return {
    ...state,
    messages: [
      ...state.messages,
      {
        role: "assistant",
        content: action.content,
        toolCalls: action.toolCalls.length ? action.toolCalls : undefined
      }
    ],
    toolCalls: [...state.toolCalls, ...action.toolCalls],
    steps: state.steps + 1
  };
}

export function applyObservation(state: AgentState, observation: Observation): AgentState {
  return {
    ...state,
    observations: [...state.observations, observation],
    messages: [
      ...state.messages,
      {
        role: "tool",
        name: observation.toolName,
        toolCallId: observation.toolCallId,
        content: observation.error
          ? `工具 ${observation.toolName} 执行失败：${observation.error}`
          : formatObservation(observation.output)
      }
    ]
  };
}

export function completeState(state: AgentState, final: string): AgentState {
  return {
    ...state,
    done: true,
    final
  };
}

export function formatObservation(output: unknown): string {
  if (typeof output === "string") {
    return output;
  }
  return JSON.stringify(output, null, 2);
}
