import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { MCPTool, MCPToolType } from "../types/research.ts";

export type MCPToolResult = { ok: boolean; output?: unknown; error?: string; tool: string };

export type MCPExternalToolConfig = {
  name: string;
  type?: MCPToolType;
  input_schema?: unknown;
  output_schema?: unknown;
  mock_output?: unknown;
  server?: string;
};

export type MCPServerConfig = {
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  tools?: MCPExternalToolConfig[];
};

export type MCPConfig = {
  servers?: MCPServerConfig[];
  tools?: MCPExternalToolConfig[];
};

export class MCPToolRegistry {
  private readonly tools = new Map<string, MCPTool>();

  constructor(tools: MCPTool[] = defaultMCPTools(), config?: MCPConfig) {
    for (const tool of tools) {
      this.register(tool);
    }
    if (config) {
      for (const tool of toolsFromMCPConfig(config)) {
        this.register(tool);
      }
    }
  }

  static fromConfigFile(file = defaultMCPConfigPath()): MCPToolRegistry {
    return new MCPToolRegistry(defaultMCPTools(), loadMCPConfig(file));
  }

  register(tool: MCPTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): MCPTool {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown MCP tool: ${name}`);
    }
    return tool;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): MCPTool[] {
    return Array.from(this.tools.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async execute(name: string, input: unknown): Promise<MCPToolResult> {
    try {
      const tool = this.get(name);
      return { ok: true, output: await tool.execute(input), tool: name };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error), tool: name };
    }
  }
}

export function loadMCPConfig(file = defaultMCPConfigPath()): MCPConfig {
  if (!existsSync(file)) {
    return { servers: [], tools: [] };
  }
  try {
    const config = JSON.parse(readFileSync(file, "utf8")) as MCPConfig;
    return {
      servers: Array.isArray(config.servers) ? config.servers : [],
      tools: Array.isArray(config.tools) ? config.tools : []
    };
  } catch {
    return { servers: [], tools: [] };
  }
}

export function defaultMCPTools(): MCPTool[] {
  return [
    mockTool("literature.search", "api"),
    mockTool("browser.validate", "browser"),
    mockTool("dataset.lookup", "dataset"),
    mockTool("runtime.python", "runtime"),
    mockTool("github.code_understanding", "api"),
    mockTool("github.repo_exploration", "api"),
    mockTool("github.ci_diagnosis", "api"),
    mockTool("github.change_execution", "api")
  ];
}

function toolsFromMCPConfig(config: MCPConfig): MCPTool[] {
  const tools: MCPTool[] = [];
  for (const tool of config.tools ?? []) {
    tools.push(configuredTool(tool));
  }
  for (const server of config.servers ?? []) {
    for (const tool of server.tools ?? []) {
      tools.push(configuredTool({ ...tool, server: server.name }));
    }
  }
  return tools;
}

function configuredTool(config: MCPExternalToolConfig): MCPTool {
  return {
    name: config.name,
    type: config.type ?? "api",
    input_schema: config.input_schema ?? { type: "object" },
    output_schema: config.output_schema ?? { type: "object" },
    execute: async (input: unknown) => {
      if (config.mock_output !== undefined) {
        return config.mock_output;
      }
      return {
        tool: config.name,
        input,
        evidence: `${config.name} registered from MCP config${config.server ? ` (${config.server})` : ""}`,
        confidence: 0.7,
        adapter: "configured-boundary"
      };
    }
  };
}

function mockTool(name: string, type: MCPTool["type"]): MCPTool {
  return {
    name,
    type,
    input_schema: { type: "object" },
    output_schema: { type: "object" },
    execute: async (input: unknown) => ({
      tool: name,
      input,
      evidence: `${name} produced mock evidence`,
      confidence: name.startsWith("github.change_execution") ? 0.5 : 0.78
    })
  };
}

function defaultMCPConfigPath(): string {
  return path.join(process.env.GENESIS_HOME || path.join(os.homedir(), ".genesis"), "mcp.json");
}
