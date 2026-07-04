import { DefaultAgentEngine } from "./engine.ts";
import type { ToolDispatcher } from "./executor.ts";
import { LLMPlanner } from "./planner.ts";
import { createInitialState } from "./state.ts";
import type { Agent, AgentResult, AgentState, LLMClient, ToolRegistry } from "./types.ts";

export type GenesisAgentOptions = {
  model?: string;
  maxSteps?: number;
  dispatcher?: ToolDispatcher;
};

export class GenesisAgent implements Agent {
  private readonly engine: DefaultAgentEngine;

  constructor(llm: LLMClient, registry: ToolRegistry, options: GenesisAgentOptions = {}) {
    this.engine = new DefaultAgentEngine(
      new LLMPlanner(llm, options.model),
      registry,
      options.maxSteps ?? 6,
      options.dispatcher
    );
  }

  async run(task: string): Promise<AgentResult> {
    return this.runWithState(task);
  }

  async runWithState(task: string, initialState?: AgentState): Promise<AgentResult> {
    let state = initialState ?? createInitialState();
    state = await this.engine.step(state, task);

    while (!state.done) {
      state = await this.engine.step(state);
    }

    return {
      output: state.final ?? "",
      trace: [...state.toolCalls, ...state.observations],
      steps: state.steps,
      toolTrace: state.toolCalls,
      observations: state.observations,
      state
    };
  }
}
