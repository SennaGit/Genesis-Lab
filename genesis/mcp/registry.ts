import { existsSync, readFileSync } from "node:fs";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
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
  timeout_ms?: number;
};

export type MCPServerConfig = {
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  timeout_ms?: number;
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
  const servers = new Map((config.servers ?? []).map((server) => [server.name, server]));

  for (const tool of config.tools ?? []) {
    tools.push(configuredTool(tool, tool.server ? servers.get(tool.server) : undefined));
  }
  for (const server of config.servers ?? []) {
    for (const tool of server.tools ?? []) {
      tools.push(configuredTool({ ...tool, server: server.name }, server));
    }
  }
  return tools;
}

function configuredTool(config: MCPExternalToolConfig, server?: MCPServerConfig): MCPTool {
  return {
    name: config.name,
    type: config.type ?? "api",
    input_schema: config.input_schema ?? { type: "object" },
    output_schema: config.output_schema ?? { type: "object" },
    execute: async (input: unknown) => {
      if (config.mock_output !== undefined) {
        return config.mock_output;
      }
      if (server?.command) {
        return new StdioMCPClient(server, config.timeout_ms ?? server.timeout_ms).callTool(config.name, input);
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

class StdioMCPClient {
  private readonly server: MCPServerConfig;
  private readonly timeoutMs: number;

  constructor(server: MCPServerConfig, timeoutMs = 10000) {
    this.server = server;
    this.timeoutMs = timeoutMs;
  }

  async callTool(name: string, input: unknown): Promise<unknown> {
    if (!this.server.command) {
      throw new Error(`MCP server ${this.server.name} has no command.`);
    }

    const child = spawn(this.server.command, this.server.args ?? [], {
      env: { ...process.env, ...(this.server.env ?? {}) },
      windowsHide: true
    });
    const rpc = new JsonRpcStdio(child, this.timeoutMs);

    try {
      await rpc.request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "Genesis Lab", version: "0.1.0" }
      });
      rpc.notify("notifications/initialized", {});
      return await rpc.request("tools/call", { name, arguments: input ?? {} });
    } finally {
      rpc.close();
    }
  }
}

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

class JsonRpcStdio {
  private nextId = 1;
  private stdout = Buffer.alloc(0);
  private readonly stderr: Buffer[] = [];
  private readonly pending = new Map<number, PendingRequest>();
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly timeoutMs: number;

  constructor(child: ChildProcessWithoutNullStreams, timeoutMs: number) {
    this.child = child;
    this.timeoutMs = timeoutMs;
    child.stdout.on("data", (chunk: Buffer) => this.onStdout(chunk));
    child.stderr.on("data", (chunk: Buffer) => this.stderr.push(chunk));
    child.on("error", (error) => this.rejectAll(error));
    child.on("exit", (code, signal) => {
      if (this.pending.size > 0) {
        this.rejectAll(new Error(`MCP server exited before response: code=${code ?? "null"} signal=${signal ?? "null"} stderr=${this.stderrText()}`));
      }
    });
  }

  request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    this.send({ jsonrpc: "2.0", id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
        this.close();
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
  }

  notify(method: string, params: unknown): void {
    this.send({ jsonrpc: "2.0", method, params });
  }

  close(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
    }
    this.pending.clear();
    if (!this.child.killed) {
      this.child.kill();
    }
  }

  private send(message: unknown): void {
    const body = JSON.stringify(message);
    this.child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  }

  private onStdout(chunk: Buffer): void {
    this.stdout = Buffer.concat([this.stdout, chunk]);
    while (this.stdout.length > 0) {
      const parsed = this.readMessage();
      if (!parsed) {
        return;
      }
      this.handleMessage(parsed);
    }
  }

  private readMessage(): unknown | undefined {
    const headerEnd = this.stdout.indexOf("\r\n\r\n");
    if (headerEnd >= 0) {
      const header = this.stdout.subarray(0, headerEnd).toString("utf8");
      const length = /Content-Length:\s*(\d+)/i.exec(header)?.[1];
      if (!length) {
        throw new Error("Invalid MCP stdio frame: missing Content-Length.");
      }
      const bodyStart = headerEnd + 4;
      const bodyLength = Number(length);
      if (this.stdout.length < bodyStart + bodyLength) {
        return undefined;
      }
      const body = this.stdout.subarray(bodyStart, bodyStart + bodyLength).toString("utf8");
      this.stdout = this.stdout.subarray(bodyStart + bodyLength);
      return JSON.parse(body);
    }

    const lineEnd = this.stdout.indexOf("\n");
    if (lineEnd < 0) {
      return undefined;
    }
    const line = this.stdout.subarray(0, lineEnd).toString("utf8").trim();
    this.stdout = this.stdout.subarray(lineEnd + 1);
    return line ? JSON.parse(line) : undefined;
  }

  private handleMessage(message: unknown): void {
    if (!message || typeof message !== "object" || !("id" in message)) {
      return;
    }
    const response = message as { id: number; result?: unknown; error?: { message?: string } };
    const pending = this.pending.get(response.id);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    this.pending.delete(response.id);
    if (response.error) {
      pending.reject(new Error(response.error.message ?? `MCP request ${response.id} failed.`));
    } else {
      pending.resolve(response.result);
    }
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private stderrText(): string {
    return Buffer.concat(this.stderr).toString("utf8").trim();
  }
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
