import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CriticFinding, GraphRevision, NodeExecution, ResearchDAG, RuntimeSession } from "../types/research.ts";

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
      return JSON.parse(await fs.readFile(this.paths(sessionId).log, "utf8")) as NodeExecution[];
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
