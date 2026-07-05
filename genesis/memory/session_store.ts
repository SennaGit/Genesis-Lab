import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CriticFinding, EvidenceItem, GraphRevision, NodeExecution, ResearchDAG, RuntimeSession, ToolExecutionTrace } from "../types/research.ts";

export type SessionPaths = {
  root: string;
  graph: string;
  log: string;
  critic: string;
  revisions: string;
  artifacts: string;
  evidenceMap: string;
  report: string;
};

export class SessionStore {
  private readonly home: string;

  constructor(home = process.env.GENESIS_HOME || path.join(os.homedir(), ".genesis")) {
    this.home = home;
  }

  async init(): Promise<void> {
    await fs.mkdir(this.sessionsRoot(), { recursive: true });
  }

  sessionsRoot(): string {
    return path.join(this.home, "sessions");
  }

  paths(sessionId: string): SessionPaths {
    const root = path.join(this.sessionsRoot(), sessionId);
    const artifacts = path.join(root, "artifacts");
    return {
      root,
      graph: path.join(root, "graph.json"),
      log: path.join(root, "execution_log.json"),
      critic: path.join(root, "critic_rounds.json"),
      revisions: path.join(root, "graph_revisions.json"),
      artifacts,
      evidenceMap: path.join(artifacts, "evidence_map.json"),
      report: path.join(root, "report.md")
    };
  }

  async createSession(sessionId: string, graph: ResearchDAG): Promise<void> {
    const paths = this.paths(sessionId);
    await fs.mkdir(paths.artifacts, { recursive: true });
    await fs.writeFile(paths.graph, JSON.stringify(graph, null, 2), "utf8");
    await fs.writeFile(paths.log, JSON.stringify([], null, 2), "utf8");
    await fs.writeFile(paths.critic, JSON.stringify([], null, 2), "utf8");
    await fs.writeFile(paths.revisions, JSON.stringify([], null, 2), "utf8");
    await fs.writeFile(paths.evidenceMap, JSON.stringify({}, null, 2), "utf8");
  }

  async writeGraph(sessionId: string, graph: ResearchDAG): Promise<void> {
    await fs.writeFile(this.paths(sessionId).graph, JSON.stringify(graph, null, 2), "utf8");
  }

  async appendExecution(sessionId: string, execution: NodeExecution): Promise<void> {
    const log = await this.readExecutionLog(sessionId);
    log.push(execution);
    await fs.writeFile(this.paths(sessionId).log, JSON.stringify(log, null, 2), "utf8");
  }

  async appendCriticRound(sessionId: string, finding: CriticFinding): Promise<void> {
    const rounds = await this.readCriticRounds(sessionId);
    rounds.push(finding);
    await fs.writeFile(this.paths(sessionId).critic, JSON.stringify(rounds, null, 2), "utf8");
  }

  async appendGraphRevision(sessionId: string, revision: GraphRevision): Promise<void> {
    const revisions = await this.readGraphRevisions(sessionId);
    revisions.push(revision);
    await fs.writeFile(this.paths(sessionId).revisions, JSON.stringify(revisions, null, 2), "utf8");
  }

  async writeEvidenceMap(sessionId: string, executions: NodeExecution[]): Promise<void> {
    const evidenceMap = Object.fromEntries(executions.map((execution) => [execution.node_id, execution.evidence]));
    await fs.mkdir(this.paths(sessionId).artifacts, { recursive: true });
    await fs.writeFile(this.paths(sessionId).evidenceMap, JSON.stringify(evidenceMap, null, 2), "utf8");
  }

  async writeReport(sessionId: string, report: string): Promise<void> {
    await fs.writeFile(this.paths(sessionId).report, report, "utf8");
  }

  async load(sessionId: string): Promise<RuntimeSession> {
    const paths = this.paths(sessionId);
    const graph = JSON.parse(await fs.readFile(paths.graph, "utf8")) as ResearchDAG;
    const executions = await this.readExecutionLog(sessionId);
    const criticRounds = await this.readCriticRounds(sessionId);
    const graphRevisions = await this.readGraphRevisions(sessionId);
    const report = await fs.readFile(paths.report, "utf8").catch(() => undefined);
    return { session_id: sessionId, graph, executions, critic_rounds: criticRounds, report, graph_revisions: graphRevisions };
  }

  async readExecutionLog(sessionId: string): Promise<NodeExecution[]> {
    try {
      const raw = JSON.parse(await fs.readFile(this.paths(sessionId).log, "utf8")) as unknown[];
      return Array.isArray(raw) ? raw.map((item) => normalizeExecution(item)) : [];
    } catch {
      return [];
    }
  }

  async readCriticRounds(sessionId: string): Promise<CriticFinding[]> {
    try {
      return JSON.parse(await fs.readFile(this.paths(sessionId).critic, "utf8")) as CriticFinding[];
    } catch {
      return [];
    }
  }

  async readGraphRevisions(sessionId: string): Promise<GraphRevision[]> {
    try {
      return JSON.parse(await fs.readFile(this.paths(sessionId).revisions, "utf8")) as GraphRevision[];
    } catch {
      return [];
    }
  }
}

function normalizeExecution(value: unknown): NodeExecution {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const nodeId = typeof record.node_id === "string" ? record.node_id : "unknown";
  const confidence = typeof record.confidence === "number" ? record.confidence : 0;
  return {
    node_id: nodeId,
    status: normalizeStatus(record.status),
    output: record.output,
    evidence: normalizeEvidenceArray(record.evidence, nodeId, confidence),
    confidence,
    tool_trace: normalizeToolTrace(record.tool_trace),
    error: typeof record.error === "string" ? record.error : undefined,
    started_at: typeof record.started_at === "string" ? record.started_at : undefined,
    completed_at: typeof record.completed_at === "string" ? record.completed_at : undefined
  };
}

function normalizeStatus(value: unknown): NodeExecution["status"] {
  if (value === "pending" || value === "running" || value === "success" || value === "failed" || value === "skipped") {
    return value;
  }
  return "failed";
}

function normalizeEvidenceArray(value: unknown, nodeId: string, confidence: number): EvidenceItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item, index) => normalizeEvidenceItem(item, nodeId, index, confidence));
}

function normalizeEvidenceItem(value: unknown, nodeId: string, index: number, fallbackConfidence: number): EvidenceItem {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return {
      id: typeof record.id === "string" ? record.id : `${nodeId}:evidence:${index + 1}`,
      node_id: typeof record.node_id === "string" ? record.node_id : nodeId,
      claimIds: Array.isArray(record.claimIds) && record.claimIds.every((item) => typeof item === "string") ? record.claimIds : [`${nodeId}:claim`],
      sourceType: typeof record.sourceType === "string" ? record.sourceType : "legacy",
      sourceId: typeof record.sourceId === "string" ? record.sourceId : undefined,
      sourceUrl: typeof record.sourceUrl === "string" ? record.sourceUrl : undefined,
      sourceDoi: typeof record.sourceDoi === "string" ? record.sourceDoi : undefined,
      locator: typeof record.locator === "string" ? record.locator : undefined,
      snippet: typeof record.snippet === "string" ? record.snippet : JSON.stringify(record),
      confidence: typeof record.confidence === "number" ? record.confidence : fallbackConfidence,
      licenseNote: typeof record.licenseNote === "string" ? record.licenseNote : undefined,
      toolName: typeof record.toolName === "string" ? record.toolName : undefined,
      created_at: typeof record.created_at === "string" ? record.created_at : new Date(0).toISOString(),
      metadata: record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata) ? record.metadata as Record<string, unknown> : undefined
    };
  }
  return {
    id: `${nodeId}:legacy:${index + 1}`,
    node_id: nodeId,
    claimIds: [`${nodeId}:claim`],
    sourceType: "legacy",
    sourceId: "legacy.execution_log",
    snippet: String(value),
    confidence: fallbackConfidence,
    created_at: new Date(0).toISOString()
  };
}

function normalizeToolTrace(value: unknown): ToolExecutionTrace[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }
    const record = item as Record<string, unknown>;
    if (typeof record.tool !== "string") {
      return [];
    }
    return [{
      tool: record.tool,
      ok: record.ok === true,
      started_at: typeof record.started_at === "string" ? record.started_at : new Date(0).toISOString(),
      completed_at: typeof record.completed_at === "string" ? record.completed_at : new Date(0).toISOString(),
      evidence_ids: Array.isArray(record.evidence_ids) && record.evidence_ids.every((id) => typeof id === "string") ? record.evidence_ids : [],
      error: typeof record.error === "string" ? record.error : undefined
    }];
  });
}
