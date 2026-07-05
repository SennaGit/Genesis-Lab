import type { ChatInput, ChatOutput, LLMProvider, ProviderConfig } from "./base.ts";
import { getBaseURL, requireApiKey } from "./base.ts";
import type { Message, Tool } from "../core/types.ts";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic" as const;
  private readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async chat(input: ChatInput): Promise<ChatOutput> {
    const baseURL = (getBaseURL(this.config) ?? "https://api.anthropic.com/v1").replace(/\/$/, "");
    const response = await fetch(`${baseURL}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": requireApiKey(this.config),
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: input.model ?? this.config.model,
        max_tokens: 4096,
        system: systemPrompt(input.messages),
        messages: input.messages.filter((message) => message.role !== "system").map(toAnthropicMessage),
        tools: input.tools?.map(toAnthropicTool)
      })
    });

    if (!response.ok) {
      throw new Error(`Model request failed: HTTP ${response.status} ${await response.text()}`);
    }

    const payload = await response.json() as AnthropicResponse;
    const text = payload.content?.filter((block) => block.type === "text").map((block) => block.text ?? "").join("\n") ?? "";
    const toolCalls = payload.content?.filter((block) => block.type === "tool_use").map((block) => ({
      id: block.id ?? `anthropic-${Date.now()}`,
      name: block.name ?? "",
      input: block.input ?? {}
    }));

    return {
      content: text,
      toolCalls: toolCalls?.length ? toolCalls : undefined,
      usage: payload.usage ? {
        input_tokens: payload.usage.input_tokens,
        output_tokens: payload.usage.output_tokens,
        total_tokens: typeof payload.usage.input_tokens === "number" && typeof payload.usage.output_tokens === "number"
          ? payload.usage.input_tokens + payload.usage.output_tokens
          : undefined
      } : undefined
    };
  }
}

function systemPrompt(messages: Message[]): string | undefined {
  return messages.find((message) => message.role === "system")?.content;
}

function toAnthropicMessage(message: Message) {
  if (message.role === "tool") {
    return {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: message.toolCallId,
          content: message.content
        }
      ]
    };
  }

  return {
    role: message.role === "assistant" ? "assistant" : "user",
    content: message.content
  };
}

function toAnthropicTool(tool: Tool) {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema
  };
}

type AnthropicResponse = {
  content?: Array<{
    type: "text" | "tool_use";
    text?: string;
    id?: string;
    name?: string;
    input?: unknown;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

