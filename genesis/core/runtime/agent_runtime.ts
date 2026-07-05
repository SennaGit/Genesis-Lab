import { randomUUID } from "node:crypto";
import type { CriticFinding, GraphRevision, ModelCallTrace, NodeExecution, ResearchDAG, ResearchDAGNode, RuntimeConfig, RuntimeEvent, RuntimeSession } from "../../types/research.ts";
import { ModelRouter, normalizeRuntimeConfig } from "../../models/model_router.ts";
import { SessionStore } from "../../memory/session_store.ts";
import { MCPToolRegistry } from "../../mcp/registry.ts";
import { SkillRegistry } from "../../skills/registry.ts";
import { Planner } from "./planner.ts";
import { Executor } from "./executor.ts";
import { Critic } from "./critic.ts";
import { Replanner } from "./replanner.ts";
import { Synthesizer } from "./synthesizer.ts";

export type RuntimeRunInput = {
  idea: string;
  session_id?: string;
  onEvent?: (event: RuntimeEvent) => void;
};

export type RuntimeResumeOptions = {
  continue?: boolean;
  onEvent?: (event: RuntimeEvent) => void;
};

export class GenesisRuntime {
  private readonly config: RuntimeConfig;
  private readonly store: SessionStore;
  private readonly models: ModelRouter;
  private readonly planner: Planner;
  private readonly executor: Executor;
  private readonly critic: Critic;
  private readonly replanner: Replanner;
  private readonly synthesizer: Synthesizer;

  constructor(options: { config?: Partial<RuntimeConfig>; store?: SessionStore; tools?: MCPToolRegistry } = {}) {
    this.config = normalizeRuntimeConfig(options.config);
    this.models = new ModelRouter(this.config);
    const skills = new SkillRegistry();
    this.store = options.store ?? new SessionStore();
    this.planner = new Planner(this.models, skills);
    this.executor = new Executor(options.tools ?? MCPToolRegistry.fromConfigFile(), skills);
    this.critic = new Critic(this.config.thresholds.confidence, this.models);
    this.replanner = new Replanner(this.models);
    this.synthesizer = new Synthesizer(this.models);
  }

  async run(input: RuntimeRunInput): Promise<RuntimeSession> {
    const sessionId = input.session_id ?? createSessionId();
    await this.store.init();
    const graph = await this.planner.plan(input.idea);
    await this.store.createSession(sessionId, graph);
    input.onEvent?.({ type: "plan", session_id: sessionId, graph });
    return this.executeLoop(sessionId, graph, [], [], [], [], input.onEvent);
  }

  async resume(sessionId: string, options: RuntimeResumeOptions = {}): Promise<RuntimeSession> {
    const session = await this.store.load(sessionId);
    if (!options.continue || session.report) {
      return session;
    }
    return this.executeLoop(
      sessionId,
      session.graph,
      [...session.executions],
      [...session.critic_rounds],
      [...(session.graph_revisions ?? [])],
      [...(session.model_usage ?? [])],
      options.onEvent
    );
  }

  private async executeLoop(
    sessionId: string,
    initialGraph: ResearchDAG,
    initialExecutions: NodeExecution[],
    initialCriticRounds: CriticFinding[],
    initialRevisions: GraphRevision[],
    initialModelUsage: ModelCallTrace[],
    onEvent?: (event: RuntimeEvent) => void
  ): Promise<RuntimeSession> {
    let graph = initialGraph;
    const executions = initialExecutions;
    const criticRounds = initialCriticRounds;
    const graphRevisions = initialRevisions;
    let replanRound = graphRevisions.length;

    while (true) {
      await this.executePendingNodes(sessionId, graph, executions, onEvent);

      const finding = await this.critic.evaluate(graph, executions);
      criticRounds.push(finding);
      await this.store.appendCriticRound(sessionId, finding);
      onEvent?.({ type: "critic_result", session_id: sessionId, passed: finding.passed, status: finding.status, reasons: finding.reasons });
      if (finding.passed || replanRound >= this.config.thresholds.max_replans) {
        break;
      }
      replanRound += 1;
      onEvent?.({ type: "replan", session_id: sessionId, round: replanRound, reasons: finding.reasons });
      graph = await this.replanner.replan(graph, finding, replanRound);
      const revision: GraphRevision = {
        round: replanRound,
        reasons: finding.reasons,
        actions: finding.revisionActions,
        graph,
        created_at: new Date().toISOString()
      };
      graphRevisions.push(revision);
      await this.store.writeGraph(sessionId, graph);
      await this.store.appendGraphRevision(sessionId, revision);
    }

    await this.store.writeEvidenceMap(sessionId, executions);
    const report = await this.synthesizer.synthesize(graph, executions, criticRounds);
    await this.store.writeReport(sessionId, report);
    const modelUsage = [...initialModelUsage, ...this.models.modelUsage()];
    await this.store.writeModelUsage(sessionId, modelUsage);
    onEvent?.({ type: "final_report", session_id: sessionId, report_path: this.store.paths(sessionId).report });
    return { session_id: sessionId, graph, executions, critic_rounds: criticRounds, report, graph_revisions: graphRevisions, model_usage: modelUsage };
  }

  private async executePendingNodes(
    sessionId: string,
    graph: ResearchDAG,
    executions: NodeExecution[],
    onEvent?: (event: RuntimeEvent) => void
  ): Promise<void> {
    const executedIds = new Set(executions.map((item) => item.node_id));
    const batches = executionBatches(graph, executedIds);

    for (const batch of batches) {
      for (const node of batch) {
        onEvent?.({ type: "node_start", session_id: sessionId, node_id: node.node_id });
      }
      const results = graph.execution_strategy.mode === "parallel"
        ? await Promise.all(batch.map((node) => this.executor.executeNode(graph, node, executions)))
        : await executeSequentially(batch, (node) => this.executor.executeNode(graph, node, executions));

      for (let index = 0; index < batch.length; index += 1) {
        const node = batch[index];
        const execution = results[index];
        executions.push(execution);
        await this.store.appendExecution(sessionId, execution);
        const traces = execution.tool_trace.length
          ? execution.tool_trace
          : node.tools_required.map((tool) => ({ tool, ok: execution.status === "success" }));
        for (const trace of traces) {
          onEvent?.({ type: "tool_result", session_id: sessionId, node_id: node.node_id, tool: trace.tool, ok: trace.ok });
        }
      }
    }
  }
}

function createSessionId(): string {
  return `sess_${randomUUID()}`;
}

async function executeSequentially<T, R>(items: T[], run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (const item of items) {
    results.push(await run(item));
  }
  return results;
}

function executionBatches(graph: ResearchDAG, executedIds: Set<string>): ResearchDAGNode[][] {
  if (graph.execution_strategy.mode !== "parallel") {
    return topologicalOrder(graph, pendingIds(graph, executedIds)).map((node) => [node]);
  }

  const byId = new Map(graph.research_graph.map((node) => [node.node_id, node]));
  const completed = new Set(executedIds);
  const remaining = new Map(graph.research_graph.filter((node) => !executedIds.has(node.node_id)).map((node) => [node.node_id, node]));
  const batches: ResearchDAGNode[][] = [];

  while (remaining.size > 0) {
    const ready = Array.from(remaining.values()).filter((node) => node.depends_on.every((dependency) => {
      if (!byId.has(dependency)) {
        throw new Error(`Node ${node.node_id} depends on missing node ${dependency}.`);
      }
      return completed.has(dependency);
    }));
    if (ready.length === 0) {
      throw new Error("Research DAG cycle detected while building parallel execution batches.");
    }
    batches.push(ready);
    for (const node of ready) {
      remaining.delete(node.node_id);
      completed.add(node.node_id);
    }
  }

  return batches;
}

function pendingIds(graph: ResearchDAG, executedIds: Set<string>): string[] {
  return graph.research_graph.filter((node) => !executedIds.has(node.node_id)).map((node) => node.node_id);
}

function topologicalOrder(graph: ResearchDAG, allowedIds?: string[]): ResearchDAGNode[] {
  const allowed = allowedIds ? new Set(allowedIds) : undefined;
  const byId = new Map(graph.research_graph.map((node) => [node.node_id, node]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const ordered: ResearchDAGNode[] = [];

  function visit(id: string): void {
    if (visited.has(id)) {
      return;
    }
    if (visiting.has(id)) {
      throw new Error(`Research DAG cycle detected at ${id}.`);
    }
    const node = byId.get(id);
    if (!node) {
      throw new Error(`Missing research node ${id}.`);
    }
    visiting.add(id);
    for (const dependency of node.depends_on) {
      if (byId.has(dependency)) {
        visit(dependency);
      } else {
        throw new Error(`Node ${node.node_id} depends on missing node ${dependency}.`);
      }
    }
    visiting.delete(id);
    visited.add(id);
    if (!allowed || allowed.has(id)) {
      ordered.push(node);
    }
  }

  for (const node of graph.research_graph) {
    visit(node.node_id);
  }
  return ordered;
}
