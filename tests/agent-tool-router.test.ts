import assert from "node:assert/strict";
import test from "node:test";
import { GenesisAgent } from "../core/agent.ts";
import { MockProvider } from "../providers/mock.ts";
import { createDefaultToolRegistry, ToolRouter } from "../tools/index.ts";

test("Agent Runtime 可以通过 ToolRouter 调用工具", async () => {
  const registry = createDefaultToolRegistry(process.cwd());
  const router = new ToolRouter(registry);
  const agent = new GenesisAgent(new MockProvider(), registry, { maxSteps: 4, dispatcher: router });
  const result = await agent.run("列出当前目录文件");

  assert.equal(result.toolTrace[0]?.name, "list_files");
  assert.equal(result.observations[0]?.toolName, "list_files");
  assert.match(result.output, /已根据工具观察完成任务/);
});

