import type { LLMProvider } from "../providers/base.ts";
import type { ToolRegistry } from "../tools/types.ts";
import { DefaultAgentEngine } from "./engine.ts";
import { LLMPlanner } from "./planner.ts";
import { appendRun } from "./state.ts";
import type { Agent, AgentResult, AgentState } from "./types.ts";
import { createInitialState } from "./types.ts";

export class GenesisAgent implements Agent {
  private readonly engine: DefaultAgentEngine;
  private readonly persist: boolean;

  constructor(
    provider: LLMProvider,
    registry: ToolRegistry,
    options: { model?: string; maxSteps?: number; persist?: boolean } = {}
  ) {
    this.persist = options.persist ?? true;
    this.engine = new DefaultAgentEngine(
      new LLMPlanner(provider, options.model),
      registry,
      options.maxSteps ?? 6
    );
  }

  async run(input: string, initialState?: AgentState): Promise<AgentResult> {
    let state = initialState ?? createInitialState();
    state = await this.engine.step(state, input);

    while (!state.done) {
      state = await this.engine.step(state);
    }

    const result: AgentResult = {
      output: state.final ?? "",
      steps: state.steps,
      toolTrace: state.toolCalls,
      observations: state.observations,
      state
    };

    if (this.persist) {
      try {
        await appendRun(result);
      } catch (error) {
        state.scratchpad += `\n状态持久化失败：${error instanceof Error ? error.message : String(error)}`;
      }
    }

    return result;
  }
}
