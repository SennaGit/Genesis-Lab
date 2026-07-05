import assert from "node:assert/strict";
import test from "node:test";
import { GenesisAgent } from "../core/agent.ts";
import { MockProvider } from "../providers/mock.ts";
import { createDefaultToolRegistry, ToolRouter } from "../tools/index.ts";

test("Agent Runtime can call tools through ToolRouter", async () => {
  const registry = createDefaultToolRegistry(process.cwd());
  const router = new ToolRouter(registry);
  const agent = new GenesisAgent(new MockProvider(), registry, { maxSteps: 4, dispatcher: router });
  const result = await agent.run("list current directory files");

  assert.equal(result.toolTrace[0]?.name, "list_files");
  assert.equal(result.observations[0]?.toolName, "list_files");
  assert.match(result.output, /Completed the task using tool observations/);
});
