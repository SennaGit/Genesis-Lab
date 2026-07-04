export type JSONSchema = {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  description?: string;
  enum?: unknown[];
  additionalProperties?: boolean | JSONSchema;
};

export type ToolCall = {
  id: string;
  name: string;
  input: unknown;
};

export type ToolResult = {
  ok: boolean;
  output?: unknown;
  error?: string;
  toolName: string;
  toolCallId?: string;
};

export interface Tool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  run(input: unknown): Promise<unknown>;
}

export interface ToolRegistry {
  register(tool: Tool): void;
  get(name: string): Tool;
  has(name: string): boolean;
  list(): Tool[];
}

export type MCPServerConfig = {
  name: string;
  command: string;
  args?: string[];
};

export type MCPForwardInput = {
  server: MCPServerConfig;
  toolName: string;
  input?: unknown;
};
