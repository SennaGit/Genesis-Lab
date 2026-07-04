import { spawn } from "node:child_process";
import type { MCPForwardInput, MCPServerConfig, Tool } from "./types.ts";

export class MCPAdapter {
  async forward(input: MCPForwardInput): Promise<unknown> {
    return this.call(input.server, input.toolName, input.input ?? {});
  }

  async call(server: MCPServerConfig, toolName: string, input: unknown): Promise<unknown> {
    const processHandle = spawn(server.command, server.args ?? [], {
      stdio: ["pipe", "pipe", "pipe"]
    });

    const transport = new MCPStdioTransport(processHandle.stdout, processHandle.stdin);
    try {
      transport.send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "genesis-tool-router", version: "0.1.0" }
        }
      });
      await transport.read();
      transport.send({ jsonrpc: "2.0", method: "notifications/initialized" });
      transport.send({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: toolName,
          arguments: input ?? {}
        }
      });
      const response = await transport.read();
      if (response.error) {
        throw new Error(JSON.stringify(response.error));
      }
      return response.result;
    } finally {
      processHandle.kill();
    }
  }
}

export function createMCPForwardTool(adapter = new MCPAdapter()): Tool {
  return {
    name: "mcp.forward",
    description: "转发调用到一个 stdio MCP server 中的工具。",
    inputSchema: {
      type: "object",
      required: ["server", "toolName"],
      properties: {
        server: {
          type: "object",
          description: "MCP server 配置。",
          required: ["name", "command"],
          properties: {
            name: { type: "string", description: "MCP server 名称。" },
            command: { type: "string", description: "MCP server 可执行文件。" },
            args: { type: "array", items: { type: "string" }, description: "MCP server 参数。" }
          }
        },
        toolName: { type: "string", description: "MCP 工具名称。" },
        input: { type: "object", description: "传给 MCP 工具的参数。" }
      }
    },
    run: async (input) => adapter.forward(parseMCPForwardInput(input))
  };
}

export function createLegacyMCPCallTool(adapter = new MCPAdapter()): Tool {
  return {
    name: "mcp_call",
    description: "兼容旧版调用格式：传入 command、args、toolName 和 input 后转发到 MCP server。",
    inputSchema: {
      type: "object",
      required: ["command", "toolName"],
      properties: {
        command: { type: "string", description: "MCP server 可执行文件。" },
        args: { type: "array", items: { type: "string" }, description: "MCP server 参数。" },
        toolName: { type: "string", description: "MCP 工具名称。" },
        input: { type: "object", description: "传给 MCP 工具的参数。" }
      }
    },
    run: async (input) => {
      const value = asRecord(input);
      return adapter.forward({
        server: {
          name: "legacy-mcp-server",
          command: String(value.command ?? ""),
          args: Array.isArray(value.args) ? value.args.map(String) : []
        },
        toolName: String(value.toolName ?? ""),
        input: value.input ?? {}
      });
    }
  };
}

export function createMCPTools(adapter = new MCPAdapter()): Tool[] {
  return [createMCPForwardTool(adapter), createLegacyMCPCallTool(adapter)];
}

function parseMCPForwardInput(input: unknown): MCPForwardInput {
  const value = asRecord(input);
  const server = asRecord(value.server);
  const command = String(server.command ?? "");
  const toolName = String(value.toolName ?? "");

  if (!command || !toolName) {
    throw new Error("mcp.forward 需要 server.command 和 toolName。");
  }

  return {
    server: {
      name: String(server.name ?? "mcp-server"),
      command,
      args: Array.isArray(server.args) ? server.args.map(String) : []
    },
    toolName,
    input: value.input ?? {}
  };
}

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? input as Record<string, unknown> : {};
}

type JSONRPCMessage = {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
};

class MCPStdioTransport {
  private buffer = Buffer.alloc(0);
  private pending: Array<(message: JSONRPCMessage) => void> = [];
  private readonly stdin: NodeJS.WritableStream;

  constructor(stdout: NodeJS.ReadableStream, stdin: NodeJS.WritableStream) {
    this.stdin = stdin;
    stdout.on("data", (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.flush();
    });
  }

  send(message: JSONRPCMessage): void {
    const body = JSON.stringify(message);
    this.stdin.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
  }

  read(): Promise<JSONRPCMessage> {
    return new Promise((resolve) => {
      this.pending.push(resolve);
      this.flush();
    });
  }

  private flush(): void {
    while (this.pending.length) {
      const parsed = this.tryParse();
      if (!parsed) {
        return;
      }
      const resolve = this.pending.shift();
      resolve?.(parsed);
    }
  }

  private tryParse(): JSONRPCMessage | null {
    const headerEnd = this.buffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) {
      return null;
    }

    const header = this.buffer.subarray(0, headerEnd).toString("utf8");
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (!match) {
      throw new Error("MCP 响应缺少 Content-Length。");
    }

    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (this.buffer.length < bodyEnd) {
      return null;
    }

    const body = this.buffer.subarray(bodyStart, bodyEnd).toString("utf8");
    this.buffer = this.buffer.subarray(bodyEnd);
    return JSON.parse(body) as JSONRPCMessage;
  }
}
