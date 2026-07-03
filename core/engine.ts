import type { ToolRegistry } from "../tools/types.ts";
import type { AgentEngine, AgentState, Planner } from "./types.ts";
import { ToolExecutor } from "./executor.ts";

export class DefaultAgentEngine implements AgentEngine {
  private readonly executor: ToolExecutor;
  private readonly planner: Planner;
  private readonly registry: ToolRegistry;
  private readonly maxSteps: number;

  constructor(planner: Planner, registry: ToolRegistry, maxSteps = 6) {
    this.planner = planner;
    this.registry = registry;
    this.maxSteps = maxSteps;
    this.executor = new ToolExecutor(registry);
  }

  async step(state: AgentState, input?: string): Promise<AgentState> {
    if (input) {
      state.messages.push({ role: "user", content: input });
    }

    const action = await this.planner.plan(state, this.registry.list());
    state.steps += 1;

    if (action.toolCalls.length === 0) {
      state.messages.push({ role: "assistant", content: action.content });
      state.final = action.content || "任务已完成。";
      state.done = true;
      return state;
    }

    state.messages.push({
      role: "assistant",
      content: action.content,
      toolCalls: action.toolCalls
    });
    state.toolCalls.push(...action.toolCalls);

    for (const toolCall of action.toolCalls) {
      const observation = await this.executor.execute(toolCall);
      state.observations.push(observation);
      state.messages.push({
        role: "tool",
        name: toolCall.name,
        toolCallId: toolCall.id,
        content: observation.error
          ? `工具 ${toolCall.name} 执行失败：${observation.error}`
          : formatObservation(observation.output)
      });
    }

    if (state.steps >= this.maxSteps) {
      state.done = true;
      state.final = "已达到最大执行步数，当前任务已停止。请查看工具轨迹和观察结果后继续。";
    }

    return state;
  }
}

function formatObservation(output: unknown): string {
  if (typeof output === "string") {
    return output;
  }
  return JSON.stringify(output, null, 2);
}
