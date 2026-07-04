import type { Tool, ToolRegistry } from "./types.ts";

export class DefaultToolRegistry implements ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    validateTool(tool);
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

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }
}

export function validateTool(tool: Tool): void {
  if (!tool.name || !/^[a-zA-Z0-9_.-]+$/.test(tool.name)) {
    throw new Error(`工具名称非法：${tool.name}`);
  }

  if (!tool.description) {
    throw new Error(`工具 ${tool.name} 缺少 description。`);
  }

  if (!tool.inputSchema || tool.inputSchema.type !== "object") {
    throw new Error(`工具 ${tool.name} 的 inputSchema 必须是 JSON Schema object。`);
  }

  if (typeof tool.run !== "function") {
    throw new Error(`工具 ${tool.name} 缺少 run 函数。`);
  }
}
