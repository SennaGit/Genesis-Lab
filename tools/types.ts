export type ToolCall = {
  id: string;
  name: string;
  input: unknown;
};

export type ToolResult = {
  ok: boolean;
  output?: unknown;
  error?: string;
};

export interface Tool {
  name: string;
  description: string;
  inputSchema: object;
  run(input: unknown): Promise<unknown>;
}

export interface ToolRegistry {
  register(tool: Tool): void;
  get(name: string): Tool;
  list(): Tool[];
}
