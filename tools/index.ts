import { createFilesystemTools } from "./filesystem.ts";
import { createMCPTools } from "./mcp_adapter.ts";
import { createNetworkTools } from "./network.ts";
import { createDesignTools } from "./design/index.ts";
import { DefaultToolRegistry } from "./registry.ts";
import { ToolRouter } from "./router.ts";
import type { Tool } from "./types.ts";

export { createDesignTools } from "./design/index.ts";
export { MCPAdapter, createMCPForwardTool, createMCPTools } from "./mcp_adapter.ts";
export { DefaultToolRegistry, validateTool } from "./registry.ts";
export { ToolRouter } from "./router.ts";
export type { JSONSchema, MCPForwardInput, MCPServerConfig, Tool, ToolCall, ToolRegistry, ToolResult } from "./types.ts";

export function createDefaultToolRegistry(root = process.cwd()): DefaultToolRegistry {
  const registry = new DefaultToolRegistry();
  for (const tool of [
    ...createUtilityTools(),
    ...createFilesystemTools(root),
    ...createNetworkTools(),
    ...createDesignTools(root),
    ...createMCPTools()
  ]) {
    registry.register(tool);
  }
  return registry;
}

export function createDefaultToolRouter(root = process.cwd()): ToolRouter {
  return new ToolRouter(createDefaultToolRegistry(root));
}

function createUtilityTools(): Tool[] {
  return [
    {
      name: "echo",
      description: "回显输入内容，用于验证 agent loop。",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "要回显的中文文本。" }
        },
        additionalProperties: false
      },
      run: async (input: unknown) => {
        const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
        return { text: String(value.text ?? "") };
      }
    }
  ];
}
