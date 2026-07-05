import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { deterministicResearchDAG } from "../genesis/core/runtime/planner.ts";
import { SessionStore } from "../genesis/memory/session_store.ts";

const cliEntry = path.resolve("bin", "genesis.ts");

function runGenesis(args: string[], genesisHome: string, input?: string) {
  return spawnSync(process.execPath, [cliEntry, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      GENESIS_HOME: genesisHome
    },
    input,
    encoding: "utf8"
  });
}

test("CLI init creates TypeScript runtime home files", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "genesis-ts-init-"));
  const genesisHome = path.join(temp, ".genesis");

  try {
    const result = runGenesis(["init"], genesisHome);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Genesis Research Runtime initialized/);
    await readFile(path.join(genesisHome, "config.json"), "utf8");
    await readFile(path.join(genesisHome, "mcp.json"), "utf8");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("CLI config writes model routing and redacts API key", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "genesis-ts-config-"));
  const genesisHome = path.join(temp, ".genesis");

  try {
    const key = runGenesis(["config", "set", "api_key", "test-key"], genesisHome);
    assert.equal(key.status, 0, key.stderr);
    assert.match(key.stdout, /\*\*\*\*\*\*/);
    assert.doesNotMatch(key.stdout, /test-key/);

    const planner = runGenesis(["config", "set", "models.planner", "gpt-4.1"], genesisHome);
    assert.equal(planner.status, 0, planner.stderr);
    const synthesizer = runGenesis(["config", "set", "models.synthesizer", "gpt-4.1-mini"], genesisHome);
    assert.equal(synthesizer.status, 0, synthesizer.stderr);
    const config = JSON.parse(await readFile(path.join(genesisHome, "config.json"), "utf8"));
    assert.equal(config.apiKey, "test-key");
    assert.equal(config.models.planning, "gpt-4.1");
    assert.equal(config.models.synthesizer, "gpt-4.1-mini");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("CLI run, status, report, and resume use persisted session files", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "genesis-ts-run-"));
  const genesisHome = path.join(temp, ".genesis");

  try {
    const result = runGenesis(["run", "quantum memory stability in LLMs"], genesisHome);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /event=plan/);
    assert.match(result.stdout, /event=node_start/);
    assert.match(result.stdout, /event=critic_result/);
    assert.match(result.stdout, /event=final_report/);
    assert.match(result.stdout, /# Genesis Research Report/);

    const sessionId = /session_id: (sess_[\w-]+)/.exec(result.stdout)?.[1];
    assert.ok(sessionId);
    const sessionRoot = path.join(genesisHome, "sessions", sessionId);
    const graph = JSON.parse(await readFile(path.join(sessionRoot, "graph.json"), "utf8"));
    const log = JSON.parse(await readFile(path.join(sessionRoot, "execution_log.json"), "utf8"));
    const evidenceMap = JSON.parse(await readFile(path.join(sessionRoot, "artifacts", "evidence_map.json"), "utf8"));
    const report = await readFile(path.join(sessionRoot, "report.md"), "utf8");
    assert.equal(graph.idea, "quantum memory stability in LLMs");
    assert.ok(log.length >= 4);
    assert.ok(Array.isArray(evidenceMap.n1));
    assert.match(report, /Evidence Map/);
    assert.match(report, /## Conclusion/);

    const status = runGenesis(["status", sessionId], genesisHome);
    assert.equal(status.status, 0, status.stderr);
    assert.match(status.stdout, /status: completed/);
    assert.match(status.stdout, /evidence_map_path:/);

    const reportCmd = runGenesis(["report", sessionId], genesisHome);
    assert.equal(reportCmd.status, 0, reportCmd.stderr);
    assert.match(reportCmd.stdout, /# Genesis Research Report/);

    const resume = runGenesis(["resume", sessionId], genesisHome);
    assert.equal(resume.status, 0, resume.stderr);
    assert.match(resume.stdout, new RegExp(`session_id: ${sessionId}`));
    assert.match(resume.stdout, /# Genesis Research Report/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("CLI skills and MCP commands are TypeScript runtime commands", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "genesis-ts-skills-mcp-"));
  const genesisHome = path.join(temp, ".genesis");

  try {
    const init = runGenesis(["init"], genesisHome);
    assert.equal(init.status, 0, init.stderr);
    await writeFile(
      path.join(genesisHome, "mcp.json"),
      JSON.stringify({
        tools: [{ name: "arxiv.search", type: "api", mock_output: { evidence: "ok", confidence: 0.8 } }],
        servers: [{ name: "fixture", tools: [{ name: "echo", type: "api", mock_output: { evidence: "server ok", confidence: 0.8 } }] }]
      }, null, 2),
      "utf8"
    );

    const skills = runGenesis(["skills", "list"], genesisHome);
    assert.equal(skills.status, 0, skills.stderr);
    assert.match(skills.stdout, /research_skill/);
    assert.match(skills.stdout, /paper_analysis_skill/);

    const inspect = runGenesis(["skills", "inspect", "coding_skill"], genesisHome);
    assert.equal(inspect.status, 0, inspect.stderr);
    assert.match(inspect.stdout, /runtime\.python/);

    const mcp = runGenesis(["mcp", "list"], genesisHome);
    assert.equal(mcp.status, 0, mcp.stderr);
    assert.match(mcp.stdout, /arxiv\.search/);

    const mcpTest = runGenesis(["mcp", "test", "arxiv.search"], genesisHome);
    assert.equal(mcpTest.status, 0, mcpTest.stderr);
    assert.match(mcpTest.stdout, /"ok": true/);

    const serverToolTest = runGenesis(["mcp", "test", "fixture", "echo"], genesisHome);
    assert.equal(serverToolTest.status, 0, serverToolTest.stderr);
    assert.match(serverToolTest.stdout, /server ok/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});


test("CLI resume continues unfinished session by default", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "genesis-ts-resume-unfinished-"));
  const genesisHome = path.join(temp, ".genesis");
  const sessionId = "sess_cli_resume_unfinished";

  try {
    process.env.GENESIS_HOME = genesisHome;
    const store = new SessionStore(genesisHome);
    await store.init();
    await store.createSession(sessionId, deterministicResearchDAG("resume unfinished idea"));

    const result = runGenesis(["resume", sessionId], genesisHome);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /event=node_start/);
    assert.match(result.stdout, /event=final_report/);
    assert.match(result.stdout, /status: completed/);
    assert.match(result.stdout, /# Genesis Research Report/);
  } finally {
    delete process.env.GENESIS_HOME;
    await rm(temp, { recursive: true, force: true });
  }
});
test("CLI chat accepts an active research idea", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "genesis-ts-chat-"));
  const genesisHome = path.join(temp, ".genesis");

  try {
    const result = runGenesis(["chat"], genesisHome, "quantum memory stability in LLMs\nexit\n");
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Genesis research chat started/);
    assert.match(result.stdout, /event=plan/);
    assert.match(result.stdout, /# Genesis Research Report/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("CLI doctor reports research runtime checks", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "genesis-ts-doctor-"));
  const genesisHome = path.join(temp, ".genesis");

  try {
    const result = runGenesis(["doctor"], genesisHome);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /github_role: capability_provider_only/);
    assert.match(result.stdout, /mcp_tools:/);
    assert.match(result.stdout, /skills:/);
    assert.match(result.stdout, /synthesizer_model:/);
    assert.match(result.stdout, /node: v/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
