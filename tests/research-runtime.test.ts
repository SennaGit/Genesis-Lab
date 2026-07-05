import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { GenesisRuntime } from "../genesis/core/runtime/agent_runtime.ts";
import { Executor } from "../genesis/core/runtime/executor.ts";
import { Critic } from "../genesis/core/runtime/critic.ts";
import { deterministicResearchDAG, Planner } from "../genesis/core/runtime/planner.ts";
import { ModelRouter } from "../genesis/models/model_router.ts";
import { assertResearchDAG } from "../genesis/schemas/research_dag_schema.ts";
import { MCPToolRegistry } from "../genesis/mcp/registry.ts";
import { SessionStore } from "../genesis/memory/session_store.ts";
import type { MCPTool, NodeExecution, ResearchDAG } from "../genesis/types/research.ts";
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

test("Executor passes dependency execution context to tools", async () => {
  let capturedInput: Record<string, unknown> | undefined;
  const graph: ResearchDAG = {
    idea: "dependency context research",
    goal: "Verify executor provides upstream evidence to downstream tools.",
    research_graph: [
      {
        node_id: "ctx-1",
        type: "question",
        instruction: "Collect initial evidence.",
        inputs: [],
        outputs: ["initial_evidence"],
        tools_required: [],
        skills_required: ["research_skill"],
        depends_on: [],
        success_criteria: "Initial evidence exists."
      },
      {
        node_id: "ctx-2",
        type: "analysis",
        instruction: "Use upstream evidence.",
        inputs: ["initial_evidence"],
        outputs: ["analysis"],
        tools_required: ["browser.validate"],
        skills_required: ["research_skill"],
        depends_on: ["ctx-1"],
        success_criteria: "Tool receives dependency context."
      }
    ],
    execution_strategy: { mode: "sequential", replan_trigger: ["missing_evidence"] },
    final_output_spec: { format: "report", sections: ["Findings", "Evidence Map"] }
  };
  const upstream: NodeExecution = {
    node_id: "ctx-1",
    status: "success",
    evidence: [{
      id: "ctx-1:evidence:1",
      node_id: "ctx-1",
      claimIds: ["ctx-1:initial_evidence"],
      sourceType: "reasoning",
      snippet: "upstream evidence",
      confidence: 0.8,
      created_at: new Date(0).toISOString()
    }],
    confidence: 0.8,
    tool_trace: [],
    output: { summary: "upstream output" }
  };
  const registry = new MCPToolRegistry([{
    name: "browser.validate",
    type: "browser",
    input_schema: { type: "object" },
    output_schema: { type: "object" },
    execute: async (input: unknown) => {
      capturedInput = input as Record<string, unknown>;
      return { evidence: "validated with context", confidence: 0.88 };
    }
  }]);

  const execution = await new Executor(registry).executeNode(graph, graph.research_graph[1], [upstream]);

  assert.equal(execution.status, "success");
  const context = capturedInput?.dependency_context as Array<{ node_id: string; evidence: Array<{ snippet: string }>; output: unknown }>;
  assert.equal(context[0].node_id, "ctx-1");
  assert.equal(context[0].evidence[0].snippet, "upstream evidence");
  assert.deepEqual(context[0].output, { summary: "upstream output" });
});

test("Model critic can add structured revision actions", async () => {
  const graph = deterministicResearchDAG("model critic missing evidence test");
  const execution: NodeExecution = {
    node_id: "n1",
    status: "success",
    evidence: [{
      id: "n1:evidence:1",
      node_id: "n1",
      claimIds: ["n1:hypothesis"],
      sourceType: "reasoning",
      snippet: "hypothesis evidence",
      confidence: 0.9,
      created_at: new Date(0).toISOString()
    }],
    confidence: 0.9,
    tool_trace: []
  };

  const finding = await new Critic(0.1, new StructuredCriticRouter()).evaluate(graph, [execution]);

  assert.equal(finding.status, "needs_revision");
  assert.ok(finding.reasons.includes("missing_evidence"));
  assert.equal(finding.revisionActions[0].type, "add_evidence");
  assert.equal(finding.revisionActions[0].node_id, "n2");
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

test("Runtime uses model-generated replan when provider returns a valid revised DAG", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "genesis-runtime-llm-replan-"));
  process.env.GENESIS_HOME = path.join(temp, ".genesis");
  const originalFetch = globalThis.fetch;
  const idea = "llm replan research";
  const promptRoles: string[] = [];

  try {
    globalThis.fetch = (async (_input: unknown, init?: { body?: unknown }) => {
      const role = modelPromptRole(init);
      promptRoles.push(role);
      const content = role === "planner"
        ? JSON.stringify(deterministicResearchDAG(idea))
        : role === "replanner"
          ? JSON.stringify(llmReplannedGraph(idea))
          : role === "synthesizer"
            ? validModelReport(idea)
            : JSON.stringify(passedCriticResponse());
      return openAIModelResponse(content, promptRoles.length);
    }) as typeof fetch;

    const runtime = new GenesisRuntime({
      config: {
        provider: "openai",
        apiKey: "test-key",
        thresholds: { confidence: 0.9, max_replans: 1 }
      },
      tools: new MCPToolRegistry(lowConfidenceTools())
    });
    const session = await runtime.run({ idea });

    assert.ok(promptRoles.includes("planner"));
    assert.equal(promptRoles.filter((role) => role === "replanner").length, 1);
    assert.ok(promptRoles.includes("critic"));
    assert.ok(promptRoles.includes("synthesizer"));
    assert.ok(session.graph.research_graph.some((node) => node.node_id === "llm-replan-1"));
    assert.equal(session.graph_revisions?.[0]?.graph.research_graph.some((node) => node.node_id === "llm-replan-1"), true);
    assert.ok(session.model_usage?.some((call) => call.role === "critic"));
    assert.ok(session.model_usage?.some((call) => call.role === "synthesizer"));
  } finally {
    globalThis.fetch = originalFetch;
    await rm(temp, { recursive: true, force: true });
    delete process.env.GENESIS_HOME;
  }
});

test("Runtime falls back to deterministic replan when model replan is invalid", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "genesis-runtime-replan-fallback-"));
  process.env.GENESIS_HOME = path.join(temp, ".genesis");
  const originalFetch = globalThis.fetch;
  const idea = "invalid model replan fallback research";
  const promptRoles: string[] = [];

  try {
    globalThis.fetch = (async (_input: unknown, init?: { body?: unknown }) => {
      const role = modelPromptRole(init);
      promptRoles.push(role);
      const content = role === "planner"
        ? JSON.stringify(deterministicResearchDAG(idea))
        : role === "replanner"
          ? "not json"
          : role === "synthesizer"
            ? validModelReport(idea)
            : JSON.stringify(passedCriticResponse());
      return openAIModelResponse(content, promptRoles.length);
    }) as typeof fetch;

    const runtime = new GenesisRuntime({
      config: {
        provider: "openai",
        apiKey: "test-key",
        thresholds: { confidence: 0.9, max_replans: 1 }
      },
      tools: new MCPToolRegistry(lowConfidenceTools())
    });
    const session = await runtime.run({ idea });

    assert.equal(promptRoles.filter((role) => role === "replanner").length, 2);
    assert.ok(session.graph.research_graph.some((node) => node.node_id === "replan-1"));
    assert.equal(session.graph.research_graph.some((node) => node.node_id === "llm-replan-1"), false);
    assert.ok(session.model_usage?.some((call) => call.role === "critic"));
    assert.ok(session.model_usage?.some((call) => call.role === "synthesizer"));
  } finally {
    globalThis.fetch = originalFetch;
    await rm(temp, { recursive: true, force: true });
    delete process.env.GENESIS_HOME;
  }
});

test("Runtime persists provider model usage from runtime model calls", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "genesis-runtime-model-usage-"));
  process.env.GENESIS_HOME = path.join(temp, ".genesis");
  const originalFetch = globalThis.fetch;
  const idea = "provider usage research";

  try {
    globalThis.fetch = (async (_input: unknown, init?: { body?: unknown }) => {
      const role = modelPromptRole(init);
      const content = role === "planner"
        ? JSON.stringify(deterministicResearchDAG(idea))
        : role === "synthesizer"
          ? validModelReport(idea)
          : JSON.stringify(passedCriticResponse());
      return openAIModelResponse(content, 1);
    }) as typeof fetch;

    const runtime = new GenesisRuntime({
      config: {
        provider: "openai",
        apiKey: "test-key",
        thresholds: { confidence: 0.1, max_replans: 0 }
      }
    });
    const session = await runtime.run({ idea });
    assert.ok(session.model_usage?.some((call) => call.role === "planning"));
    assert.ok(session.model_usage?.some((call) => call.role === "critic"));
    assert.ok(session.model_usage?.some((call) => call.role === "synthesizer"));
    assert.equal(session.model_usage?.[0].provider, "openai");

    const store = new SessionStore();
    const usage = JSON.parse(await readFile(store.paths(session.session_id).modelUsage, "utf8"));
    assert.ok(usage.length >= 3);
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

test("runtime.python executes local Python code with structured evidence", async () => {
  const registry = new MCPToolRegistry();
  const result = await registry.execute("runtime.python", {
    code: "import json\nprint(json.dumps({'answer': 42}))",
    timeout_ms: 5000
  });

  assert.equal(result.ok, true, result.error);
  const output = result.output as { stdout?: string; evidence?: Array<{ sourceType?: string; metadata?: Record<string, unknown> }> };
  assert.match(output.stdout ?? "", /42/);
  assert.equal(output.evidence?.[0]?.sourceType, "runtime");
  assert.equal(output.evidence?.[0]?.metadata?.exit_code, 0);
});

test("Executor records runtime.python stdout as evidence metadata", async () => {
  const graph: ResearchDAG = {
    idea: "runtime python evidence test",
    goal: "Verify local runtime evidence capture.",
    research_graph: [
      {
        node_id: "py-1",
        type: "experiment",
        instruction: "Run a tiny deterministic Python calculation.",
        inputs: [],
        outputs: ["calculation"],
        tools_required: ["runtime.python"],
        skills_required: ["coding_skill"],
        depends_on: [],
        success_criteria: "Python stdout is captured as structured evidence."
      }
    ],
    execution_strategy: { mode: "sequential", replan_trigger: ["tool_failure"] },
    final_output_spec: { format: "experiment", sections: ["Findings", "Evidence Map"] }
  };
  const execution = await new Executor(new MCPToolRegistry([pythonToolFixture()])).executeNode(graph, graph.research_graph[0]);

  assert.equal(execution.status, "success");
  assert.equal(execution.evidence[0].sourceType, "runtime");
  assert.match(String(execution.evidence[0].metadata?.stdout), /25/);
  assert.equal(execution.tool_trace[0].ok, true);
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

class StructuredCriticRouter extends ModelRouter {
  constructor() {
    super({ provider: "openai", apiKey: "test-key" });
  }

  override async chat(): Promise<{ content: string }> {
    return {
      content: JSON.stringify({
        status: "needs_revision",
        issues: [{
          id: "model-missing-evidence-n2",
          kind: "missing_evidence",
          severity: "error",
          node_id: "n2",
          message: "The evidence collection node needs an independent source."
        }],
        revisionActions: [{
          id: "model-add-evidence-n2",
          type: "add_evidence",
          node_id: "n2",
          instruction: "Collect an independent source for node n2.",
          tools_required: ["literature.search", "browser.validate"],
          skills_required: ["research_skill"]
        }],
        checkedClaims: ["n2:evidence"],
        confidence: 0.4
      })
    };
  }
}
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

function llmReplannedGraph(idea: string): ResearchDAG {
  const graph = deterministicResearchDAG(idea);
  return {
    ...graph,
    research_graph: [
      ...graph.research_graph,
      {
        node_id: "llm-replan-1",
        type: "question",
        instruction: "Collect an independent validation source requested by the critic.",
        inputs: ["critic_findings", "n2"],
        outputs: ["refined_evidence"],
        tools_required: ["browser.validate"],
        skills_required: ["research_skill"],
        depends_on: graph.research_graph.map((node) => node.node_id),
        success_criteria: "The critic issue is addressed with an independent evidence item."
      }
    ],
    execution_strategy: { ...graph.execution_strategy, mode: "adaptive" }
  };
}

function modelPromptRole(init?: { body?: unknown }): "planner" | "critic" | "replanner" | "synthesizer" | "unknown" {
  const body = typeof init?.body === "string" ? JSON.parse(init.body) as { messages?: Array<{ content?: string }> } : {};
  const system = body.messages?.[0]?.content ?? "";
  if (system.includes("Genesis Replanner")) {
    return "replanner";
  }
  if (system.includes("Genesis Planner")) {
    return "planner";
  }
  if (system.includes("Genesis Critic")) {
    return "critic";
  }
  if (system.includes("Genesis Synthesizer")) {
    return "synthesizer";
  }
  return "unknown";
}

function openAIModelResponse(content: string, index: number): Response {
  return new Response(JSON.stringify({
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 10 + index, completion_tokens: 5, total_tokens: 15 + index }
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function passedCriticResponse(): unknown {
  return {
    status: "passed",
    issues: [],
    revisionActions: [],
    checkedClaims: [],
    confidence: 0.95
  };
}

function validModelReport(idea: string): string {
  return [
    "# Genesis Research Report",
    "",
    "## Research Plan",
    `- Idea: ${idea}`,
    "",
    "## Findings",
    "- Model synthesized findings from the provided evidence map.",
    "",
    "## Experiments",
    "- Experiment requirements were inspected from the DAG.",
    "",
    "## Limitations",
    "- Model report remains bounded by supplied evidence.",
    "",
    "## Conclusion",
    "- The runtime produced a structured research report.",
    "",
    "## Evidence Map",
    "- Evidence is linked in execution artifacts.",
    "",
    "## Artifacts",
    "- report.md",
    ""
  ].join("\n");
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

function pythonToolFixture(): MCPTool {
  return {
    name: "runtime.python",
    type: "runtime",
    input_schema: { type: "object" },
    output_schema: { type: "object" },
    execute: async () => ({
      evidence: [{
        snippet: "Python completed in 1ms. stdout: 25",
        sourceType: "runtime",
        sourceId: "fixture-python",
        confidence: 0.9,
        metadata: { stdout: "25\n", exit_code: 0 }
      }],
      confidence: 0.9,
      stdout: "25\n",
      exit_code: 0
    })
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
