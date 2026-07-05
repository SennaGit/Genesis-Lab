import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { GenesisRuntime } from "../genesis/core/runtime/agent_runtime.ts";
import { Executor } from "../genesis/core/runtime/executor.ts";
import { deterministicResearchDAG, Planner } from "../genesis/core/runtime/planner.ts";
import { ModelRouter } from "../genesis/models/model_router.ts";
import { assertResearchDAG } from "../genesis/schemas/research_dag_schema.ts";
import { MCPToolRegistry } from "../genesis/mcp/registry.ts";
import { SessionStore } from "../genesis/memory/session_store.ts";
import type { MCPTool, ResearchDAG } from "../genesis/types/research.ts";
import { GITHUB_CAPABILITIES } from "../genesis/mcp/github_capabilities.ts";

test("Planner outputs mandatory Research DAG schema with selected skills", async () => {
  const graph = await new Planner().plan("quantum memory stability in LLMs");

  assertResearchDAG(graph);
  assert.equal(graph.idea, "quantum memory stability in LLMs");
  assert.ok(graph.research_graph.some((node) => node.type === "hypothesis"));
  assert.ok(graph.research_graph.every((node) => Array.isArray(node.skills_required)));
  assert.ok(graph.execution_strategy.replan_trigger.includes("missing_evidence"));
  assert.equal(graph.final_output_spec.format, "report");
});

test("Executor follows DAG dependency order and does not decide planning", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "genesis-runtime-order-"));
  process.env.GENESIS_HOME = path.join(temp, ".genesis");
  const runtime = new GenesisRuntime({ config: { thresholds: { confidence: 0.1, max_replans: 0 } } });

  try {
    const session = await runtime.run({ idea: "paper analysis of quantum memory" });
    const order = session.executions.map((item) => item.node_id);
    assert.deepEqual(order.slice(0, 4), ["n1", "n2", "n3", "n4"]);
    assert.equal(session.graph.research_graph.length, 4);
  } finally {
    await rm(temp, { recursive: true, force: true });
    delete process.env.GENESIS_HOME;
  }
});

test("Critic triggers replanning with revision actions and persists evidence artifacts", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "genesis-runtime-replan-"));
  process.env.GENESIS_HOME = path.join(temp, ".genesis");
  const runtime = new GenesisRuntime({
    config: { thresholds: { confidence: 0.9, max_replans: 1 } },
    tools: new MCPToolRegistry(lowConfidenceTools())
  });

  try {
    const session = await runtime.run({ idea: "dataset experiment for weak evidence" });
    assert.ok(session.graph.research_graph.some((node) => node.node_id === "replan-1"));
    assert.equal(session.critic_rounds.length, 2);
    assert.equal(session.critic_rounds[0].passed, false);
    assert.equal(session.critic_rounds[0].status, "needs_revision");
    assert.ok(session.critic_rounds[0].reasons.includes("low_confidence"));
    assert.ok(session.critic_rounds[0].revisionActions.length > 0);
    assert.ok(session.graph_revisions?.[0]?.actions.length);

    const store = new SessionStore();
    const evidenceMap = JSON.parse(await readFile(store.paths(session.session_id).evidenceMap, "utf8"));
    assert.ok(Array.isArray(evidenceMap.n1));
    assert.equal(evidenceMap.n1[0].sourceType, "reasoning");
    assert.ok(Array.isArray(evidenceMap.n1[0].claimIds));
    assert.equal(typeof evidenceMap.n2[0].snippet, "string");
    assert.equal(evidenceMap.n2[0].sourceType, "literature");
    assert.match(session.report ?? "", /## Experiments/);
    assert.match(session.report ?? "", /## Artifacts/);
    assert.match(session.report ?? "", /## Conclusion/);
  } finally {
    await rm(temp, { recursive: true, force: true });
    delete process.env.GENESIS_HOME;
  }
});

test("Executor enforces active skill tool policy", async () => {
  const graph: ResearchDAG = {
    ...deterministicResearchDAG("research policy test"),
    research_graph: [
      {
        node_id: "policy-1",
        type: "analysis",
        instruction: "Attempt a disallowed change execution.",
        inputs: [],
        outputs: ["policy_result"],
        tools_required: ["github.change_execution"],
        skills_required: ["research_skill"],
        depends_on: [],
        success_criteria: "Disallowed tool is rejected."
      }
    ]
  };
  const execution = await new Executor().executeNode(graph, graph.research_graph[0]);

  assert.equal(execution.status, "failed");
  assert.match(execution.error ?? "", /disallowed/);
});

test("MCP config can register external tool boundaries", async () => {
  const registry = new MCPToolRegistry([], {
    tools: [
      {
        name: "arxiv.search",
        type: "api",
        mock_output: { evidence: "configured arxiv evidence", confidence: 0.8 }
      }
    ]
  });

  assert.equal(registry.has("arxiv.search"), true);
  const result = await registry.execute("arxiv.search", { query: "memory" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.output, { evidence: "configured arxiv evidence", confidence: 0.8 });
});

test("Runtime resume can continue an unfinished persisted session", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "genesis-runtime-resume-"));
  process.env.GENESIS_HOME = path.join(temp, ".genesis");
  const store = new SessionStore();
  const graph = deterministicResearchDAG("resume unfinished research session");
  const sessionId = "sess_resume_test";

  try {
    await store.init();
    await store.createSession(sessionId, graph);
    const runtime = new GenesisRuntime({ config: { thresholds: { confidence: 0.1, max_replans: 0 } } });
    const session = await runtime.resume(sessionId, { continue: true });
    assert.equal(session.session_id, sessionId);
    assert.ok(session.executions.length >= 4);
    assert.match(session.report ?? "", /# Genesis Research Report/);
  } finally {
    await rm(temp, { recursive: true, force: true });
    delete process.env.GENESIS_HOME;
  }
});

test("GitHub capability remains a provider, not workflow/bot design", async () => {
  const graph = await new Planner().plan("debug github ci failure by reading pull request diff");
  assertResearchDAG(graph);
  const tools = graph.research_graph.flatMap((node) => node.tools_required);

  assert.ok(tools.some((tool) => tool.startsWith("github.")));
  assert.ok(Object.keys(GITHUB_CAPABILITIES).every((capability) => capability.startsWith("github.")));
  assert.equal(tools.some((tool) => /workflow|bot|automation/i.test(tool)), false);
});

function lowConfidenceTools(): MCPTool[] {
  const names = ["literature.search", "browser.validate", "dataset.lookup", "runtime.python"];
  return names.map((name) => ({
    name,
    type: (name === "runtime.python" ? "runtime" : name === "dataset.lookup" ? "dataset" : "api") as MCPTool["type"],
    input_schema: { type: "object" },
    output_schema: { type: "object" },
    execute: async () => ({ evidence: `${name} weak evidence`, confidence: 0.2 })
  }));
}


test("MCP tool failure is persisted as tool trace", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "genesis-runtime-tool-failure-"));
  process.env.GENESIS_HOME = path.join(temp, ".genesis");
  const store = new SessionStore();
  const sessionId = "sess_tool_failure_trace";
  const graph: ResearchDAG = {
    idea: "tool failure trace research",
    goal: "Verify failed tools are auditable evidence gaps.",
    research_graph: [
      {
        node_id: "fail-1",
        type: "question",
        instruction: "Call a failing literature tool.",
        inputs: ["idea"],
        outputs: ["evidence"],
        tools_required: ["literature.search"],
        skills_required: ["research_skill"],
        depends_on: [],
        success_criteria: "The failure is recorded rather than swallowed."
      }
    ],
    execution_strategy: { mode: "sequential", replan_trigger: ["tool_failure"] },
    final_output_spec: { format: "report", sections: ["Research Plan", "Findings", "Evidence Map"] }
  };

  try {
    await store.init();
    await store.createSession(sessionId, graph);
    const runtime = new GenesisRuntime({
      config: { thresholds: { confidence: 0.1, max_replans: 0 } },
      tools: new MCPToolRegistry([failingLiteratureTool()])
    });
    const session = await runtime.resume(sessionId, { continue: true });
    assert.equal(session.executions[0].status, "failed");
    assert.equal(session.executions[0].tool_trace[0].tool, "literature.search");
    assert.equal(session.executions[0].tool_trace[0].ok, false);
    assert.match(session.executions[0].tool_trace[0].error ?? "", /fixture tool failed/);
    assert.ok(session.critic_rounds[0].reasons.includes("tool_failure"));

    const log = JSON.parse(await readFile(store.paths(sessionId).log, "utf8"));
    assert.equal(log[0].tool_trace[0].ok, false);
    assert.match(log[0].tool_trace[0].error, /fixture tool failed/);
  } finally {
    await rm(temp, { recursive: true, force: true });
    delete process.env.GENESIS_HOME;
  }
});

test("Planner retries malformed model JSON and parses fenced repaired DAG", async () => {
  const router = new RepairingPlannerRouter();
  const graph = await new Planner(router).plan("structured retry planner test");

  assert.equal(router.calls, 2);
  assertResearchDAG(graph);
  assert.equal(graph.idea, "structured retry planner test");
  assert.equal(graph.research_graph[0].skills_required?.[0], "research_skill");
});

test("Runtime persists provider model usage from planner calls", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "genesis-runtime-model-usage-"));
  process.env.GENESIS_HOME = path.join(temp, ".genesis");
  const originalFetch = globalThis.fetch;
  const idea = "provider usage research";

  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(deterministicResearchDAG(idea)) } }],
      usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })) as typeof fetch;

    const runtime = new GenesisRuntime({
      config: {
        provider: "openai",
        apiKey: "test-key",
        thresholds: { confidence: 0.1, max_replans: 0 }
      }
    });
    const session = await runtime.run({ idea });
    assert.equal(session.model_usage?.length, 1);
    assert.equal(session.model_usage?.[0].role, "planning");
    assert.equal(session.model_usage?.[0].provider, "openai");
    assert.equal(session.model_usage?.[0].usage?.total_tokens, 18);

    const store = new SessionStore();
    const usage = JSON.parse(await readFile(store.paths(session.session_id).modelUsage, "utf8"));
    assert.equal(usage[0].usage.total_tokens, 18);
    assert.doesNotMatch(JSON.stringify(usage), /test-key/);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(temp, { recursive: true, force: true });
    delete process.env.GENESIS_HOME;
  }
});

test("MCP stdio server tools are callable through configured server boundary", async () => {
  const registry = new MCPToolRegistry([], {
    servers: [
      {
        name: "fixture",
        command: process.execPath,
        args: [path.resolve("tests", "fixtures", "mcp_stdio_server.mjs")],
        tools: [{ name: "fixture.echo", type: "api", timeout_ms: 5000 }]
      }
    ]
  });

  const result = await registry.execute("fixture.echo", { text: "hello" });
  assert.equal(result.ok, true, result.error);
  assert.deepEqual((result.output as { structuredContent?: unknown }).structuredContent, { echoed: "hello", tool: "fixture.echo" });
});

test("Runtime executes independent parallel DAG nodes in the same dependency wave", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "genesis-runtime-parallel-"));
  process.env.GENESIS_HOME = path.join(temp, ".genesis");
  const store = new SessionStore();
  const sessionId = "sess_parallel_test";
  const graph: ResearchDAG = {
    idea: "parallel execution test",
    goal: "Verify parallel DAG scheduling.",
    research_graph: [
      parallelNode("p1"),
      parallelNode("p2"),
      {
        node_id: "p3",
        type: "synthesis",
        instruction: "Synthesize parallel outputs.",
        inputs: ["a", "b"],
        outputs: ["report"],
        tools_required: [],
        skills_required: ["research_skill"],
        depends_on: ["p1", "p2"],
        success_criteria: "Synthesis waits for both parallel branches."
      }
    ],
    execution_strategy: { mode: "parallel", replan_trigger: ["tool_failure"] },
    final_output_spec: { format: "report", sections: ["Research Plan", "Findings"] }
  };

  try {
    await store.init();
    await store.createSession(sessionId, graph);
    const runtime = new GenesisRuntime({
      config: { thresholds: { confidence: 0.1, max_replans: 0 } },
      tools: new MCPToolRegistry([delayedRuntimeTool(120)])
    });
    const started = Date.now();
    const session = await runtime.resume(sessionId, { continue: true });
    const elapsed = Date.now() - started;

    assert.deepEqual(session.executions.map((item) => item.node_id), ["p1", "p2", "p3"]);
    assert.ok(elapsed < 220, `expected parallel execution under 220ms, got ${elapsed}ms`);
  } finally {
    await rm(temp, { recursive: true, force: true });
    delete process.env.GENESIS_HOME;
  }
});

class RepairingPlannerRouter extends ModelRouter {
  calls = 0;

  constructor() {
    super({ provider: "openai", apiKey: "test-key" });
  }

  override async chat(): Promise<{ content: string }> {
    this.calls += 1;
    if (this.calls === 1) {
      return { content: "not json" };
    }
    return {
      content: `\`\`\`json
${JSON.stringify(deterministicResearchDAG("structured retry planner test"))}
\`\`\``
    };
  }
}

function parallelNode(nodeId: string): ResearchDAG["research_graph"][number] {
  return {
    node_id: nodeId,
    type: "analysis",
    instruction: `Run ${nodeId}.`,
    inputs: [],
    outputs: [nodeId],
    tools_required: ["runtime.python"],
    skills_required: ["coding_skill"],
    depends_on: [],
    success_criteria: `${nodeId} completes.`
  };
}

function failingLiteratureTool(): MCPTool {
  return {
    name: "literature.search",
    type: "api",
    input_schema: { type: "object" },
    output_schema: { type: "object" },
    execute: async () => {
      throw new Error("fixture tool failed");
    }
  };
}

function delayedRuntimeTool(delayMs: number): MCPTool {
  return {
    name: "runtime.python",
    type: "runtime",
    input_schema: { type: "object" },
    output_schema: { type: "object" },
    execute: async () => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return { evidence: "parallel runtime evidence", confidence: 0.9 };
    }
  };
}
