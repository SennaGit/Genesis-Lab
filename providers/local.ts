import type { ChatInput, ChatOutput, LLMProvider } from "./base.ts";
import type { Message } from "../core/types.ts";
import type { ToolCall } from "../tools/types.ts";

export class LocalProvider implements LLMProvider {
  readonly name = "local" as const;

  async chat(input: ChatInput): Promise<ChatOutput> {
    const last = lastMessage(input.messages);
    const hasFreshObservation = input.messages.some((message) => message.role === "tool");

    if (!hasFreshObservation && input.tools?.length) {
      const toolCall = this.planLocalToolCall(last?.content ?? "", input.tools.map((tool) => tool.name));
      if (toolCall) {
        return {
          content: "我会先调用本地工具获取可验证观察结果。",
          toolCalls: [toolCall]
        };
      }
    }

    const observation = input.messages.filter((message) => message.role === "tool").at(-1)?.content;
    if (observation) {
      return {
        content: `已根据工具观察完成任务。\n\n观察结果：\n${observation}`
      };
    }

    return {
      content: `本地 provider 已收到指令：“${last?.content ?? ""}”。请配置 OpenAI、Anthropic 或 OpenAI-compatible provider 以启用真实模型推理。`
    };
  }

  private planLocalToolCall(input: string, toolNames: string[]): ToolCall | null {
    if (toolNames.includes("list_files") && /列出|目录|files?|ls/i.test(input)) {
      return {
        id: createToolCallId(),
        name: "list_files",
        input: { path: ".", maxDepth: 1 }
      };
    }

    if (toolNames.includes("read_file") && /README|读取|查看|read/i.test(input)) {
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
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
