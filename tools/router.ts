import type { ToolCall, ToolRegistry, ToolResult } from "./types.ts";

export class ToolRouter {
  private readonly registry: ToolRegistry;

  constructor(registry: ToolRegistry) {
    this.registry = registry;
  }

  async dispatch(toolCall: ToolCall): Promise<ToolResult> {
    try {
      const tool = this.registry.get(toolCall.name);
      const output = await tool.run(toolCall.input);
      return {
        ok: true,
        output,
        toolName: toolCall.name,
        toolCallId: toolCall.id
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        toolName: toolCall.name,
        toolCallId: toolCall.id
      };
    }
  }

  async call(name: string, input: unknown, id = createToolCallId(name)): Promise<ToolResult> {
    return this.dispatch({ id, name, input });
  }

  listTools() {
    return this.registry.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }));
  }
}

function createToolCallId(name: string): string {
  return `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
