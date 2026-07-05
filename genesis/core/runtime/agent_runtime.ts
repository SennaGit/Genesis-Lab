import { randomUUID } from "node:crypto";
import type { CriticFinding, GraphRevision, NodeExecution, ResearchDAG, ResearchDAGNode, RuntimeConfig, RuntimeEvent, RuntimeSession } from "../../types/research.ts";
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
  private readonly planner: Planner;
  private readonly executor: Executor;
  private readonly critic: Critic;
  private readonly replanner = new Replanner();
  private readonly synthesizer = new Synthesizer();

  constructor(options: { config?: Partial<RuntimeConfig>; store?: SessionStore; tools?: MCPToolRegistry } = {}) {
    this.config = normalizeRuntimeConfig(options.config);
    const models = new ModelRouter(this.config);
    const skills = new SkillRegistry();
    this.store = options.store ?? new SessionStore();
    this.planner = new Planner(models, skills);
    this.executor = new Executor(options.tools ?? MCPToolRegistry.fromConfigFile(), skills);
    this.critic = new Critic(this.config.thresholds.confidence);
  }

  async run(input: RuntimeRunInput): Promise<RuntimeSession> {
    const sessionId = input.session_id ?? createSessionId();
    await this.store.init();
    const graph = await this.planner.plan(input.idea);
    await this.store.createSession(sessionId, graph);
    input.onEvent?.({ type: "plan", session_id: sessionId, graph });
    return this.executeLoop(sessionId, graph, [], [], [], input.onEvent);
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
      options.onEvent
    );
  }

  private async executeLoop(
    sessionId: string,
    initialGraph: ResearchDAG,
    initialExecutions: NodeExecution[],
    initialCriticRounds: CriticFinding[],
    initialRevisions: GraphRevision[],
    onEvent?: (event: RuntimeEvent) => void
  ): Promise<RuntimeSession> {
    let graph = initialGraph;
    const executions = initialExecutions;
    const criticRounds = initialCriticRounds;
    const graphRevisions = initialRevisions;
    let replanRound = graphRevisions.length;

    while (true) {
      const executedIds = new Set(executions.map((item) => item.node_id));
      const pendingIds = graph.research_graph.filter((node) => !executedIds.has(node.node_id)).map((node) => node.node_id);
      for (const node of topologicalOrder(graph, pendingIds)) {
        onEvent?.({ type: "node_start", session_id: sessionId, node_id: node.node_id });
        const execution = await this.executor.executeNode(graph, node);
        executions.push(execution);
        await this.store.appendExecution(sessionId, execution);
        for (const tool of node.tools_required) {
          onEvent?.({ type: "tool_result", session_id: sessionId, node_id: node.node_id, tool, ok: execution.status === "success" });
        }
      }

      const finding = this.critic.evaluate(graph, executions);
      criticRounds.push(finding);
      await this.store.appendCriticRound(sessionId, finding);
      onEvent?.({ type: "critic_result", session_id: sessionId, passed: finding.passed, status: finding.status, reasons: finding.reasons });
      if (finding.passed || replanRound >= this.config.thresholds.max_replans) {
        break;
      }
      replanRound += 1;
      onEvent?.({ type: "replan", session_id: sessionId, round: replanRound, reasons: finding.reasons });
      graph = this.replanner.replan(graph, finding, replanRound);
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
    const report = this.synthesizer.synthesize(graph, executions, criticRounds);
    await this.store.writeReport(sessionId, report);
    onEvent?.({ type: "final_report", session_id: sessionId, report_path: this.store.paths(sessionId).report });
    return { session_id: sessionId, graph, executions, critic_rounds: criticRounds, report, graph_revisions: graphRevisions };
  }
}

function createSessionId(): string {
  return `sess_${randomUUID()}`;
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
