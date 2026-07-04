import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const cliEntry = path.resolve("bin", "genesis.ts");

function runGenesis(args: string[], genesisHome: string, input?: string) {
  return spawnSync(process.execPath, [cliEntry, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      GENESIS_HOME: genesisHome,
      GENESIS_STREAM_DELAY_MS: "0"
    },
    input,
    encoding: "utf8"
  });
}

test("CLI init creates Genesis home files through Python runtime", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "genesis-cli-init-"));
  const genesisHome = path.join(temp, ".genesis");

  try {
    const result = runGenesis(["init"], genesisHome);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Genesis Lab initialized/);
    await readFile(path.join(genesisHome, "config.json"), "utf8");
    await readFile(path.join(genesisHome, "mcp.json"), "utf8");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("CLI config set api_key writes ~/.genesis/config.json and redacts output", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "genesis-cli-config-"));
  const genesisHome = path.join(temp, ".genesis");

  try {
    const result = runGenesis(["config", "set", "api_key", "test-key"], genesisHome);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /updated config: api_key/);
    assert.match(result.stdout, /\*\*\*\*\*\*/);
    assert.doesNotMatch(result.stdout, /test-key/);

    const raw = await readFile(path.join(genesisHome, "config.json"), "utf8");
    const config = JSON.parse(raw);
    assert.equal(config.apiKey, "test-key");
    assert.equal(config.api_key, undefined);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("CLI run invokes research runtime and persists report", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "genesis-cli-run-"));
  const genesisHome = path.join(temp, ".genesis");

  try {
    const result = runGenesis(["run", "quantum memory stability in LLMs"], genesisHome);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /ResearchTask/);
    assert.match(result.stdout, /DAG/);
    assert.match(result.stdout, /STEP EXECUTION/);
    assert.match(result.stdout, /EVIDENCE/);
    assert.match(result.stdout, /REPORT/);
    assert.match(result.stdout, /## Evidence Map/);

    const runId = /runId: ([0-9a-f-]+)/.exec(result.stdout)?.[1];
    assert.ok(runId);
    const snapshot = JSON.parse(await readFile(path.join(genesisHome, "runs", `${runId}.json`), "utf8"));
    assert.equal(snapshot.run.status, "completed");
    assert.match(snapshot.markdown, /## Findings/);

    const resume = runGenesis(["resume", runId], genesisHome);
    assert.equal(resume.status, 0, resume.stderr);
    assert.match(resume.stdout, /RESUME/);
    assert.match(resume.stdout, /status: completed/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("CLI skills and MCP commands are forwarded to Python runtime", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "genesis-cli-skills-"));
  const genesisHome = path.join(temp, ".genesis");

  try {
    const skills = runGenesis(["skills", "list"], genesisHome);
    assert.equal(skills.status, 0, skills.stderr);
    assert.match(skills.stdout, /research_literature/);

    const inspect = runGenesis(["skills", "inspect", "experiment_design"], genesisHome);
    assert.equal(inspect.status, 0, inspect.stderr);
    assert.match(inspect.stdout, /python\.sandbox/);

    const mcp = runGenesis(["mcp", "list"], genesisHome);
    assert.equal(mcp.status, 0, mcp.stderr);
    assert.match(mcp.stdout, /No MCP servers configured/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("CLI chat accepts an active research idea", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "genesis-cli-chat-"));
  const genesisHome = path.join(temp, ".genesis");

  try {
    const result = runGenesis(["chat"], genesisHome, "quantum memory stability in LLMs\nexit\n");
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Genesis research chat started/);
    assert.match(result.stdout, /ResearchTask/);
    assert.match(result.stdout, /## Evidence Map/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("CLI agent compatibility command still outputs tool trace", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "genesis-cli-agent-"));
  const genesisHome = path.join(temp, ".genesis");

  try {
    const result = runGenesis(["agent", "列出当前目录文件"], genesisHome);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /工具轨迹/);
    assert.match(result.stdout, /list_files/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
