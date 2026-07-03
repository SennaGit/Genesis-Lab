import { spawn } from "node:child_process";
import type { Tool } from "./types.ts";

export class MCPClient {
  async call(command: string, args: string[], toolName: string, input: unknown): Promise<unknown> {
    const processHandle = spawn(command, args, {
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
          clientInfo: { name: "genesis-cli", version: "0.1.0" }
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

export function createMCPTools(): Tool[] {
  return [
    {
      name: "mcp_call",
      description: "调用一个 stdio MCP 服务器中的工具。仅在用户明确提供 server command 时使用。",
      inputSchema: {
        type: "object",
        required: ["command", "toolName"],
        properties: {
          command: { type: "string", description: "MCP 服务器可执行文件。" },
          args: { type: "array", items: { type: "string" }, description: "MCP 服务器参数。" },
          toolName: { type: "string", description: "要调用的 MCP 工具名称。" },
          input: { type: "object", description: "传给 MCP 工具的参数。" }
        }
      },
      run: async (input) => {
        const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
        const command = String(value.command ?? "");
        const args = Array.isArray(value.args) ? value.args.map(String) : [];
        const toolName = String(value.toolName ?? "");
        if (!command || !toolName) {
          throw new Error("mcp_call 需要 command 和 toolName。");
        }
        return new MCPClient().call(command, args, toolName, value.input ?? {});
      }
    }
  ];
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
