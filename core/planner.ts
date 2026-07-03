import type { LLMProvider } from "../providers/base.ts";
import type { Tool } from "../tools/types.ts";
import type { AgentState, Planner, PlannerAction } from "./types.ts";

export class LLMPlanner implements Planner {
  private readonly provider: LLMProvider;
  private readonly model?: string;

  constructor(provider: LLMProvider, model?: string) {
    this.provider = provider;
    this.model = model;
  }

  async plan(state: AgentState, tools: Tool[]): Promise<PlannerAction> {
    const response = await this.provider.chat({
      model: this.model,
      messages: [
        {
          role: "system",
          content: [
            "你是 Genesis CLI Agent。",
            "默认使用中文回复用户。",
            "你可以通过工具完成多步骤任务：先计划，再调用工具，再基于观察继续推理。",
            "除非用户明确要求英文，所有面向用户的输出文件和解释都必须使用中文。",
            "如果已经获得足够观察结果，请给出最终答案，不要继续调用工具。"
          ].join("\n")
        },
        ...state.messages
      ],
      tools
    });

    return {
      content: response.content,
      toolCalls: response.toolCalls ?? []
    };
  }
}
