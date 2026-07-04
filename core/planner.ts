import type { AgentState, LLMClient, Planner, PlannerAction, Tool } from "./types.ts";

export class LLMPlanner implements Planner {
  private readonly llm: LLMClient;
  private readonly model?: string;

  constructor(llm: LLMClient, model?: string) {
    this.llm = llm;
    this.model = model;
  }

  async plan(state: AgentState, tools: Tool[]): Promise<PlannerAction> {
    const response = await this.llm.chat({
      model: this.model,
      messages: [
        {
          role: "system",
          content: [
            "你是 Genesis Agent Runtime 的 Planner。",
            "默认使用中文回复用户。",
            "你可以通过工具完成多步骤推理：先规划，再调用工具，再基于观察继续决策。",
            "如果已经获得足够观察结果，请给出最终答案，不要继续调用工具。",
            "所有面向用户的默认输出、生成文件和解释必须使用中文。"
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
