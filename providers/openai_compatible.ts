import type { ChatInput, ChatOutput, LLMProvider, ProviderConfig, SupportedProviderName } from "./base.ts";
import { getBaseURL, requireApiKey } from "./base.ts";
import type { Tool, ToolCall } from "../core/types.ts";

export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: SupportedProviderName;
  private readonly config: ProviderConfig;

  constructor(config: ProviderConfig, name: SupportedProviderName = "custom") {
    this.config = config;
    this.name = name;
  }

  async chat(input: ChatInput): Promise<ChatOutput> {
    const baseURL = normalizeBaseURL(getBaseURL(this.config) ?? "https://api.openai.com/v1");
    const apiKey = requireApiKey(this.config);
    const response = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: input.model ?? this.config.model,
        messages: input.messages.map((message) => ({
          role: message.role,
          content: message.content,
          name: message.name,
          tool_call_id: message.toolCallId,
          tool_calls: message.toolCalls?.map(toOpenAIToolCall)
        })),
        tools: input.tools?.map(toOpenAITool),
        tool_choice: input.tools?.length ? "auto" : undefined
      })
    });

    if (!response.ok) {
      throw new Error(`模型请求失败：HTTP ${response.status} ${await response.text()}`);
    }

    const payload = await response.json() as OpenAIChatResponse;
    const message = payload.choices?.[0]?.message;
    return {
      content: message?.content ?? "",
      toolCalls: message?.tool_calls?.map(fromOpenAIToolCall)
    };
  }
}

export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor(config: ProviderConfig) {
    super({ ...config, baseURL: getBaseURL(config) ?? "https://api.openai.com/v1" }, "openai");
  }
}

function normalizeBaseURL(baseURL: string): string {
  return baseURL.replace(/\/$/, "");
}

function toOpenAITool(tool: Tool): OpenAIToolDefinition {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema
    }
  };
}

function toOpenAIToolCall(toolCall: ToolCall) {
  return {
    id: toolCall.id,
    type: "function",
    function: {
      name: toolCall.name,
      arguments: JSON.stringify(toolCall.input ?? {})
    }
  };
}

function fromOpenAIToolCall(toolCall: OpenAIToolCall): ToolCall {
  return {
    id: toolCall.id,
    name: toolCall.function.name,
    input: parseJSON(toolCall.function.arguments)
  };
}

function parseJSON(value: string): unknown {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

type OpenAIToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: object;
  };
};

type OpenAIToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

type OpenAIChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
      tool_calls?: OpenAIToolCall[];
    };
  }>;
};
