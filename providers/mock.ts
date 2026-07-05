import type { ChatInput, ChatOutput, LLMProvider } from "./base.ts";
import type { Message, ToolCall } from "../core/types.ts";

export class MockProvider implements LLMProvider {
  readonly name = "mock" as const;

  async chat(input: ChatInput): Promise<ChatOutput> {
    const last = lastMessage(input.messages);
    const hasFreshObservation = input.messages.some((message) => message.role === "tool");

    if (!hasFreshObservation && input.tools?.length) {
      const toolCall = this.planMockToolCall(last?.content ?? "", input.tools.map((tool) => tool.name));
      if (toolCall) {
        const content = "I will call a local tool first to collect verifiable observations.";
        return {
          content,
          toolCalls: [toolCall],
          usage: estimateUsage(input, content)
        };
      }
    }

    const observation = input.messages.filter((message) => message.role === "tool").at(-1)?.content;
    if (observation) {
      const content = `Completed the task using tool observations.\n\nObservation:\n${observation}`;
      return {
        content,
        usage: estimateUsage(input, content)
      };
    }

    const content = `Mock provider received: "${last?.content ?? ""}". Configure OpenAI, Anthropic, or a custom provider for real model reasoning.`;
    return {
      content,
      usage: estimateUsage(input, content)
    };
  }

  private planMockToolCall(input: string, toolNames: string[]): ToolCall | null {
    if (toolNames.includes("list_files") && /list|directory|files?|ls|列出|目录/i.test(input)) {
      return {
        id: createToolCallId(),
        name: "list_files",
        input: { path: ".", maxDepth: 1 }
      };
    }

    if (toolNames.includes("filesystem.read") && /README|read|查看|读取/i.test(input)) {
      return {
        id: createToolCallId(),
        name: "filesystem.read",
        input: { path: "README.md" }
      };
    }

    if (toolNames.includes("read_file") && /README|read|查看|读取/i.test(input)) {
      return {
        id: createToolCallId(),
        name: "read_file",
        input: { path: "README.md" }
      };
    }

    if (toolNames.includes("echo")) {
      return {
        id: createToolCallId(),
        name: "echo",
        input: { text: input }
      };
    }

    return null;
  }
}

function lastMessage(messages: Message[]): Message | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user") {
      return messages[index];
    }
  }
  return messages.at(-1);
}

function createToolCallId(): string {
  return `mock-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function estimateUsage(input: ChatInput, output: string): ChatOutput["usage"] {
  const promptChars = input.messages.reduce((sum, message) => sum + message.content.length, 0);
  const promptTokens = Math.max(1, Math.ceil(promptChars / 4));
  const completionTokens = Math.max(1, Math.ceil(output.length / 4));
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens
  };
}
