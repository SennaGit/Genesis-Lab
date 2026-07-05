import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { GenesisAgent } from "../core/agent.ts";
import { MockProvider } from "../providers/mock.ts";
import { createDefaultToolRegistry } from "../tools/index.ts";
import { setConfigValue, loadConfig } from "../providers/config.ts";

test("agent loop can call tools and return observations", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "genesis-agent-"));
  process.env.GENESIS_HOME = path.join(temp, ".genesis");

  try {
    const agent = new GenesisAgent(new MockProvider(), createDefaultToolRegistry(process.cwd()), {
      maxSteps: 4
    });
    const result = await agent.run("list current directory files");

    assert.equal(result.toolTrace[0]?.name, "list_files");
    assert.match(result.output, /Completed the task using tool observations/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("config system writes ~/.genesis/config.json with user API key", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "genesis-config-"));
  process.env.GENESIS_HOME = path.join(temp, ".genesis");

  try {
    await setConfigValue("provider", "custom");
    await setConfigValue("apiKey", "test-key");
    await setConfigValue("baseURL", "https://example.com/v1");
    const config = await loadConfig();

    assert.equal(config.provider, "custom");
    assert.equal(config.apiKey, "test-key");
    assert.equal(config.baseURL, "https://example.com/v1");

    const configFile = await readFile(path.join(temp, ".genesis", "config.json"), "utf8");
    assert.match(configFile, /custom/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
