import type { Observation } from "./types.ts";
import type { ToolCall, ToolRegistry } from "../tools/types.ts";

export class ToolExecutor {
  private readonly registry: ToolRegistry;

  constructor(registry: ToolRegistry) {
    this.registry = registry;
  }

  async execute(toolCall: ToolCall): Promise<Observation> {
    try {
      const tool = this.registry.get(toolCall.name);
      const output = await tool.run(toolCall.input);
      return {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        output
      };
    } catch (error) {
      return {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        output: null,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
