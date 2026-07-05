import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { GenesisRuntime } from "../genesis/core/runtime/agent_runtime.ts";
import { Executor } from "../genesis/core/runtime/executor.ts";
import { deterministicResearchDAG, Planner } from "../genesis/core/runtime/planner.ts";
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
