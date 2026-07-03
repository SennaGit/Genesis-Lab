import { createFilesystemTools } from "./filesystem.ts";
import { createMCPTools } from "./mcp.ts";
import { createNetworkTools } from "./network.ts";
import { DefaultToolRegistry } from "./registry.ts";

export function createDefaultToolRegistry(root = process.cwd()): DefaultToolRegistry {
  const registry = new DefaultToolRegistry();
  for (const tool of [
    ...createUtilityTools(),
    ...createFilesystemTools(root),
    ...createNetworkTools(),
    ...createMCPTools()
  ]) {
    registry.register(tool);
  }
  return registry;
}

function createUtilityTools() {
  return [
    {
      name: "echo",
      description: "回显输入内容，用于验证 agent loop。",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "要回显的中文文本。" }
        }
      },
      run: async (input: unknown) => {
        const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
        return { text: String(value.text ?? "") };
      }
    }
  ];
}
