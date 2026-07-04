import type { Observation, ToolCall, ToolRegistry } from "./types.ts";

export type ToolDispatchResult = {
  ok: boolean;
  output?: unknown;
  error?: string;
  toolName: string;
  toolCallId?: string;
};

export type ToolDispatcher = {
  dispatch(toolCall: ToolCall): Promise<ToolDispatchResult>;
};

export class ToolExecutor {
  private readonly dispatcher: ToolDispatcher;

  constructor(registryOrDispatcher: ToolRegistry | ToolDispatcher) {
    this.dispatcher = isDispatcher(registryOrDispatcher)
      ? registryOrDispatcher
      : new RegistryDispatcher(registryOrDispatcher);
  }

  async execute(toolCall: ToolCall): Promise<Observation> {
    const result = await this.dispatcher.dispatch(toolCall);
    return {
      toolCallId: result.toolCallId ?? toolCall.id,
      toolName: result.toolName,
      output: result.output ?? null,
      error: result.ok ? undefined : result.error
    };
  }
}

class RegistryDispatcher implements ToolDispatcher {
  private readonly registry: ToolRegistry;

  constructor(registry: ToolRegistry) {
    this.registry = registry;
  }

  async dispatch(toolCall: ToolCall): Promise<ToolDispatchResult> {
    try {
      const tool = this.registry.get(toolCall.name);
      return {
        ok: true,
        output: await tool.run(toolCall.input),
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
}

function isDispatcher(value: ToolRegistry | ToolDispatcher): value is ToolDispatcher {
  return typeof (value as ToolDispatcher).dispatch === "function";
}
