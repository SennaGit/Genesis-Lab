import type { AgentEngine, AgentState, Planner, ToolRegistry } from "./types.ts";
import { ToolExecutor, type ToolDispatcher } from "./executor.ts";
import { appendUserInput, applyObservation, applyPlannerAction, completeState } from "./state.ts";

export class DefaultAgentEngine implements AgentEngine {
  private readonly executor: ToolExecutor;
  private readonly planner: Planner;
  private readonly registry: ToolRegistry;
  private readonly maxSteps: number;

  constructor(planner: Planner, registry: ToolRegistry, maxSteps = 6, dispatcher?: ToolDispatcher) {
    this.planner = planner;
    this.registry = registry;
    this.maxSteps = maxSteps;
    this.executor = new ToolExecutor(dispatcher ?? registry);
  }

  async step(state: AgentState, input?: string): Promise<AgentState> {
    const inputState = input ? appendUserInput(state, input) : state;
    const action = await this.planner.plan(inputState, this.registry.list());
    let nextState = applyPlannerAction(inputState, action);

    if (action.toolCalls.length === 0) {
      return completeState(nextState, action.content || "任务已完成。");
    }

    for (const toolCall of action.toolCalls) {
      const observation = await this.executor.execute(toolCall);
      nextState = applyObservation(nextState, observation);
    }

    if (nextState.steps >= this.maxSteps) {
      return completeState(nextState, "已达到最大执行步数，当前任务已停止。请查看 trace 后继续。");
    }

    return nextState;
  }
}
