import type { Tool, ToolRegistry } from "./types.ts";

export class DefaultToolRegistry implements ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`工具已注册：${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`未知工具：${name}`);
    }
    return tool;
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }
}
