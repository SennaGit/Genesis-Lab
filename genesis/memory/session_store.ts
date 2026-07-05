import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ArtifactRecord, CriticFinding, EvidenceItem, GraphRevision, ModelCallTrace, NodeExecution, ResearchDAG, RuntimeSession, SessionMetadata, SessionStatus, ToolExecutionTrace } from "../types/research.ts";

export type SessionPaths = {
  root: string;
  metadata: string;
  graph: string;
  log: string;
  critic: string;
  revisions: string;
  modelUsage: string;
  artifacts: string;
  evidenceMap: string;
  manifest: string;
  report: string;
};

type ArtifactManifest = {
  session_id: string;
  updated_at: string;
  artifacts: ArtifactRecord[];
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
      metadata: path.join(root, "session.json"),
      graph: path.join(root, "graph.json"),
      log: path.join(root, "execution_log.json"),
      critic: path.join(root, "critic_rounds.json"),
      revisions: path.join(root, "graph_revisions.json"),
      modelUsage: path.join(root, "model_usage.json"),
      artifacts,
      evidenceMap: path.join(artifacts, "evidence_map.json"),
      manifest: path.join(artifacts, "manifest.json"),
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
    await fs.writeFile(paths.modelUsage, JSON.stringify([], null, 2), "utf8");
    await fs.writeFile(paths.evidenceMap, JSON.stringify({}, null, 2), "utf8");
    const now = new Date().toISOString();
    const metadata = metadataFromState(sessionId, graph, [], [], [], false, paths, "created", now, now);
    await this.writeMetadata(sessionId, metadata);
    await this.writeArtifactManifest(sessionId, metadata);
  }

  async writeGraph(sessionId: string, graph: ResearchDAG): Promise<void> {
    await fs.writeFile(this.paths(sessionId).graph, JSON.stringify(graph, null, 2), "utf8");
    await this.refreshSessionIndex(sessionId);
  }

  async appendExecution(sessionId: string, execution: NodeExecution): Promise<void> {
    const log = await this.readExecutionLog(sessionId);
    log.push(execution);
    await fs.writeFile(this.paths(sessionId).log, JSON.stringify(log, null, 2), "utf8");
    await this.patchMetadata(sessionId, { status: "running", execution_count: log.length });
  }

  async appendCriticRound(sessionId: string, finding: CriticFinding): Promise<void> {
    const rounds = await this.readCriticRounds(sessionId);
    rounds.push(finding);
    await fs.writeFile(this.paths(sessionId).critic, JSON.stringify(rounds, null, 2), "utf8");
    await this.patchMetadata(sessionId, { status: finding.status === "failed" ? "failed" : "running", critic_round_count: rounds.length });
  }

  async appendGraphRevision(sessionId: string, revision: GraphRevision): Promise<void> {
    const revisions = await this.readGraphRevisions(sessionId);
    revisions.push(revision);
    await fs.writeFile(this.paths(sessionId).revisions, JSON.stringify(revisions, null, 2), "utf8");
    await this.patchMetadata(sessionId, { status: "running", revision_count: revisions.length, node_count: revision.graph.research_graph.length });
  }

  async writeModelUsage(sessionId: string, usage: ModelCallTrace[]): Promise<void> {
    await fs.writeFile(this.paths(sessionId).modelUsage, JSON.stringify(usage, null, 2), "utf8");
    await this.patchMetadata(sessionId, {}, true);
  }

  async writeEvidenceMap(sessionId: string, executions: NodeExecution[]): Promise<void> {
    const evidenceMap = Object.fromEntries(executions.map((execution) => [execution.node_id, execution.evidence]));
    await fs.mkdir(this.paths(sessionId).artifacts, { recursive: true });
    await fs.writeFile(this.paths(sessionId).evidenceMap, JSON.stringify(evidenceMap, null, 2), "utf8");
    await this.patchMetadata(sessionId, { execution_count: executions.length }, true);
  }

  async writeReport(sessionId: string, report: string): Promise<void> {
    const paths = this.paths(sessionId);
    await fs.writeFile(paths.report, report, "utf8");
    await this.patchMetadata(sessionId, { status: "completed", report_path: relativeSessionPath(paths.root, paths.report) }, true);
  }

  async load(sessionId: string): Promise<RuntimeSession> {
    const paths = this.paths(sessionId);
    const graph = JSON.parse(await fs.readFile(paths.graph, "utf8")) as ResearchDAG;
    const executions = await this.readExecutionLog(sessionId);
    const criticRounds = await this.readCriticRounds(sessionId);
    const graphRevisions = await this.readGraphRevisions(sessionId);
    const modelUsage = await this.readModelUsage(sessionId);
    const report = await fs.readFile(paths.report, "utf8").catch(() => undefined);
    const metadata = await this.readMetadata(sessionId).catch(() => metadataFromState(sessionId, graph, executions, criticRounds, graphRevisions, Boolean(report), paths));
    const artifacts = await this.readArtifactManifest(sessionId).catch(() => buildArtifactRecords(sessionId, paths, metadata));
    return { session_id: sessionId, graph, executions, critic_rounds: criticRounds, report, graph_revisions: graphRevisions, model_usage: modelUsage, metadata, artifacts };
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

  async readModelUsage(sessionId: string): Promise<ModelCallTrace[]> {
    try {
      const raw = JSON.parse(await fs.readFile(this.paths(sessionId).modelUsage, "utf8")) as unknown[];
      return Array.isArray(raw) ? raw.flatMap((item) => normalizeModelCallTrace(item)) : [];
    } catch {
      return [];
    }
  }

  async readMetadata(sessionId: string): Promise<SessionMetadata> {
    const parsed = JSON.parse(await fs.readFile(this.paths(sessionId).metadata, "utf8")) as unknown;
    return normalizeSessionMetadata(parsed, sessionId);
  }

  async readArtifactManifest(sessionId: string): Promise<ArtifactRecord[]> {
    const parsed = JSON.parse(await fs.readFile(this.paths(sessionId).manifest, "utf8")) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.flatMap((item) => normalizeArtifactRecord(item));
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      return Array.isArray(record.artifacts) ? record.artifacts.flatMap((item) => normalizeArtifactRecord(item)) : [];
    }
    return [];
  }

  private async patchMetadata(sessionId: string, patch: Partial<SessionMetadata>, updateManifest = false): Promise<void> {
    const existing = await this.readMetadata(sessionId).catch(() => undefined);
    if (!existing) {
      await this.refreshSessionIndex(sessionId, patch.status);
      return;
    }
    const now = new Date().toISOString();
    const status = patch.status ?? existing.status;
    const metadata: SessionMetadata = {
      ...existing,
      ...patch,
      status,
      updated_at: now,
      completed_at: status === "completed" ? patch.completed_at ?? existing.completed_at ?? now : patch.completed_at ?? existing.completed_at
    };
    await this.writeMetadata(sessionId, metadata);
    if (updateManifest) {
      await this.writeArtifactManifest(sessionId, metadata);
    }
  }
  private async refreshSessionIndex(sessionId: string, status?: SessionStatus): Promise<void> {
    const paths = this.paths(sessionId);
    const graph = JSON.parse(await fs.readFile(paths.graph, "utf8")) as ResearchDAG;
    const executions = await this.readExecutionLog(sessionId);
    const criticRounds = await this.readCriticRounds(sessionId);
    const revisions = await this.readGraphRevisions(sessionId);
    const reportExists = await exists(paths.report);
    const existing = await this.readMetadata(sessionId).catch(() => undefined);
    const now = new Date().toISOString();
    const nextStatus = status ?? existing?.status ?? (reportExists ? "completed" : executions.length ? "running" : "created");
    const metadata = metadataFromState(sessionId, graph, executions, criticRounds, revisions, reportExists, paths, nextStatus, existing?.created_at, now, existing?.completed_at);
    await this.writeMetadata(sessionId, metadata);
    await this.writeArtifactManifest(sessionId, metadata);
  }

  private async writeMetadata(sessionId: string, metadata: SessionMetadata): Promise<void> {
    await fs.writeFile(this.paths(sessionId).metadata, JSON.stringify(metadata, null, 2), "utf8");
  }

  private async writeArtifactManifest(sessionId: string, metadata: SessionMetadata): Promise<void> {
    const paths = this.paths(sessionId);
    const manifest: ArtifactManifest = {
      session_id: sessionId,
      updated_at: metadata.updated_at,
      artifacts: await existingArtifactRecords(sessionId, paths, metadata)
    };
    await fs.mkdir(paths.artifacts, { recursive: true });
    await fs.writeFile(paths.manifest, JSON.stringify(manifest, null, 2), "utf8");
  }
}

function metadataFromState(
  sessionId: string,
  graph: ResearchDAG,
  executions: NodeExecution[],
  criticRounds: CriticFinding[],
  revisions: GraphRevision[],
  reportExists: boolean,
  paths: SessionPaths,
  status?: SessionStatus,
  createdAt = new Date().toISOString(),
  updatedAt = new Date().toISOString(),
  completedAt?: string
): SessionMetadata {
  const finalStatus = status ?? (reportExists ? "completed" : executions.length ? "running" : "created");
  return {
    session_id: sessionId,
    idea: graph.idea,
    goal: graph.goal,
    status: finalStatus,
    created_at: createdAt,
    updated_at: updatedAt,
    completed_at: finalStatus === "completed" ? completedAt ?? updatedAt : completedAt,
    node_count: graph.research_graph.length,
    execution_count: executions.length,
    critic_round_count: criticRounds.length,
    revision_count: revisions.length,
    report_path: reportExists ? relativeSessionPath(paths.root, paths.report) : undefined,
    evidence_map_path: relativeSessionPath(paths.root, paths.evidenceMap),
    model_usage_path: relativeSessionPath(paths.root, paths.modelUsage)
  };
}

async function existingArtifactRecords(sessionId: string, paths: SessionPaths, metadata: SessionMetadata): Promise<ArtifactRecord[]> {
  const records = buildArtifactRecords(sessionId, paths, metadata);
  const existing: ArtifactRecord[] = [];
  for (const record of records) {
    if (await exists(path.join(paths.root, record.path))) {
      existing.push(record);
    }
  }
  return existing;
}

function buildArtifactRecords(sessionId: string, paths: SessionPaths, metadata: SessionMetadata): ArtifactRecord[] {
  const now = metadata.updated_at;
  const createdAt = metadata.created_at;
  const definitions: Array<Omit<ArtifactRecord, "created_at" | "updated_at"> & { absolute: string }> = [
    { id: `${sessionId}:graph`, kind: "graph", path: relativeSessionPath(paths.root, paths.graph), description: "Research DAG snapshot.", absolute: paths.graph },
    { id: `${sessionId}:execution_log`, kind: "execution_log", path: relativeSessionPath(paths.root, paths.log), description: "Ordered DAG node execution log.", absolute: paths.log },
    { id: `${sessionId}:critic_rounds`, kind: "critic_rounds", path: relativeSessionPath(paths.root, paths.critic), description: "Critic evaluations and revision signals.", absolute: paths.critic },
    { id: `${sessionId}:graph_revisions`, kind: "graph_revisions", path: relativeSessionPath(paths.root, paths.revisions), description: "Replanning history for the research DAG.", absolute: paths.revisions },
    { id: `${sessionId}:model_usage`, kind: "model_usage", path: relativeSessionPath(paths.root, paths.modelUsage), description: "Provider/model usage traces without API keys.", absolute: paths.modelUsage },
    { id: `${sessionId}:evidence_map`, kind: "evidence_map", path: relativeSessionPath(paths.root, paths.evidenceMap), description: "Evidence grouped by DAG node.", absolute: paths.evidenceMap },
    { id: `${sessionId}:report`, kind: "report", path: relativeSessionPath(paths.root, paths.report), description: "Final structured research report.", absolute: paths.report }
  ];
  return definitions.map(({ absolute: _absolute, ...record }) => ({ ...record, created_at: createdAt, updated_at: now }));
}

function relativeSessionPath(root: string, file: string): string {
  return path.relative(root, file).replace(/\\/g, "/");
}

async function exists(file: string): Promise<boolean> {
  return fs.stat(file).then(() => true, () => false);
}

function normalizeSessionMetadata(value: unknown, sessionId: string): SessionMetadata {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    session_id: typeof record.session_id === "string" ? record.session_id : sessionId,
    idea: typeof record.idea === "string" ? record.idea : "",
    goal: typeof record.goal === "string" ? record.goal : "",
    status: normalizeSessionStatus(record.status),
    created_at: typeof record.created_at === "string" ? record.created_at : new Date(0).toISOString(),
    updated_at: typeof record.updated_at === "string" ? record.updated_at : new Date(0).toISOString(),
    completed_at: typeof record.completed_at === "string" ? record.completed_at : undefined,
    node_count: numberValue(record.node_count),
    execution_count: numberValue(record.execution_count),
    critic_round_count: numberValue(record.critic_round_count),
    revision_count: numberValue(record.revision_count),
    report_path: typeof record.report_path === "string" ? record.report_path : undefined,
    evidence_map_path: typeof record.evidence_map_path === "string" ? record.evidence_map_path : undefined,
    model_usage_path: typeof record.model_usage_path === "string" ? record.model_usage_path : undefined
  };
}

function normalizeSessionStatus(value: unknown): SessionStatus {
  if (value === "created" || value === "running" || value === "completed" || value === "failed") {
    return value;
  }
  return "created";
}

function normalizeArtifactRecord(value: unknown): ArtifactRecord[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  const record = value as Record<string, unknown>;
  const kind = normalizeArtifactKind(record.kind);
  if (!kind || typeof record.path !== "string") {
    return [];
  }
  return [{
    id: typeof record.id === "string" ? record.id : `${kind}:${record.path}`,
    kind,
    path: record.path,
    description: typeof record.description === "string" ? record.description : kind,
    created_at: typeof record.created_at === "string" ? record.created_at : new Date(0).toISOString(),
    updated_at: typeof record.updated_at === "string" ? record.updated_at : new Date(0).toISOString()
  }];
}

function normalizeArtifactKind(value: unknown): ArtifactRecord["kind"] | undefined {
  if (value === "graph" || value === "execution_log" || value === "critic_rounds" || value === "graph_revisions" || value === "model_usage" || value === "evidence_map" || value === "report") {
    return value;
  }
  return undefined;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
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

function normalizeModelCallTrace(value: unknown): ModelCallTrace[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.role !== "string" || typeof record.model !== "string") {
    return [];
  }
  return [{
    id: record.id,
    role: record.role as ModelCallTrace["role"],
    provider: record.provider as ModelCallTrace["provider"],
    model: record.model,
    started_at: typeof record.started_at === "string" ? record.started_at : new Date(0).toISOString(),
    completed_at: typeof record.completed_at === "string" ? record.completed_at : new Date(0).toISOString(),
    latency_ms: typeof record.latency_ms === "number" ? record.latency_ms : 0,
    ok: record.ok === true,
    usage: record.usage && typeof record.usage === "object" && !Array.isArray(record.usage) ? record.usage as ModelCallTrace["usage"] : undefined,
    error: typeof record.error === "string" ? record.error : undefined
  }];
}
