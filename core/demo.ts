import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { GenesisAgent } from "./agent.ts";
import type { ChatInput, ChatOutput, LLMClient, Tool, ToolRegistry } from "./types.ts";

class DemoPlannerLLM implements LLMClient {
  async chat(input: ChatInput): Promise<ChatOutput> {
    const hasObservation = input.messages.some((message) => message.role === "tool");

    if (!hasObservation) {
      return {
        content: "我会先读取仓库文件列表，再给出结构分析。",
        toolCalls: [
          {
            id: "demo-list-repo-files",
            name: "list_repo_files",
            input: { maxFiles: 80 }
          }
        ]
      };
    }

    const observation = input.messages.filter((message) => message.role === "tool").at(-1)?.content ?? "[]";
    return {
      content: [
        "仓库分析完成。",
        "从文件结构看，Genesis 已经具备独立的 core runtime、provider 适配层、tools 层、前端工作台和 Python 后端。",
        "其中 core 目录负责 headless agent loop；其他模块不参与 core runtime 的主循环。",
        "关键观察如下：",
        observation
      ].join("\n")
    };
  }
}

class DemoToolRegistry implements ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`未知 demo 工具：${name}`);
    }
    return tool;
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }
}

export async function createDemoAgent(root = process.cwd()): Promise<GenesisAgent> {
  const registry = new DemoToolRegistry();
  registry.register({
    name: "list_repo_files",
    description: "列出仓库中的关键文件，用于分析仓库结构。",
    inputSchema: {
      type: "object",
      properties: {
        maxFiles: { type: "number", description: "最多返回多少个文件。" }
      }
    },
    run: async (input) => {
      const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
      const maxFiles = Number(value.maxFiles ?? 80);
      const files = await walk(root, root, maxFiles);
      return files;
    }
  });

  return new GenesisAgent(new DemoPlannerLLM(), registry, { maxSteps: 4 });
}

export async function runDemo(): Promise<void> {
  const agent = await createDemoAgent(path.resolve(fileURLToPath(new URL("..", import.meta.url))));
  const result = await agent.run("analyze this repo");
  console.log(result.output);
  console.log("\ntrace:");
  console.log(JSON.stringify(result.trace, null, 2));
}

async function walk(current: string, root: string, maxFiles: number, results: string[] = []): Promise<string[]> {
  if (results.length >= maxFiles) {
    return results;
  }

  const entries = await fs.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (results.length >= maxFiles) {
      break;
    }
    if ([".git", "node_modules", ".next", ".venv", ".genesis"].includes(entry.name)) {
      continue;
    }

    const absolute = path.join(current, entry.name);
    const relative = path.relative(root, absolute);
    results.push(relative);

    if (entry.isDirectory()) {
      await walk(absolute, root, maxFiles, results);
    }
  }

  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runDemo();
}

