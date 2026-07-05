import type { CriticFinding, NodeExecution, ResearchDAG, ReviewIssue, ReviewIssueKind, RevisionAction } from "../../types/research.ts";
import { ModelRouter } from "../../models/model_router.ts";

export class Critic {
  private readonly confidenceThreshold: number;
  private readonly models: ModelRouter;

  constructor(confidenceThreshold = 0.65, models = new ModelRouter()) {
    this.confidenceThreshold = confidenceThreshold;
    this.models = models;
  }

  async evaluate(graph: ResearchDAG, executions: NodeExecution[]): Promise<CriticFinding> {
    const heuristic = heuristicEvaluate(graph, executions, this.confidenceThreshold);
    if (this.models.runtimeConfig().provider === "mock") {
      return heuristic;
    }

    const modelFinding = await this.evaluateWithModel(graph, executions, heuristic);
    return modelFinding ? mergeCriticFindings(heuristic, modelFinding) : heuristic;
  }

  private async evaluateWithModel(graph: ResearchDAG, executions: NodeExecution[], heuristic: CriticFinding): Promise<CriticFinding | undefined> {
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      {
        role: "system",
        content: [
          "You are Genesis Critic.",
          "Return strict JSON only.",
          "Evaluate whether the research DAG execution has missing evidence, low confidence, contradictions, or tool failures.",
          "Do not design GitHub workflows or bot behavior. GitHub is only an evidence capability provider.",
          "Schema: { status, issues[], revisionActions[], checkedClaims[], confidence }.",
          "status must be passed, needs_revision, or failed.",
          "issue.kind must be low_confidence, missing_evidence, contradiction, or tool_failure.",
          "revisionActions[].type must be add_evidence, resolve_contradiction, retry_tool, or document_limitation."
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify({ graph, executions: summarizeExecutions(executions), heuristic }, null, 2)
      }
    ];

    try {
      const response = await this.models.chat("critic", messages);
      return parseCriticFinding(response.content, graph, heuristic);
    } catch {
      return undefined;
    }
  }
}

function heuristicEvaluate(graph: ResearchDAG, executions: NodeExecution[], confidenceThreshold: number): CriticFinding {
  const byNode = new Map(executions.map((item) => [item.node_id, item]));
  const toolFailures = executions.filter((item) => item.status === "failed").map((item) => item.node_id);
  const missingEvidence = executions
    .filter((item) => item.status === "success" && item.evidence.length === 0)
    .map((item) => item.node_id);
  const contradictions = executions
    .filter((item) => JSON.stringify(item.output ?? "").toLowerCase().includes("contradiction"))
    .map((item) => item.node_id);
  const confidence = average(executions.map((item) => item.confidence));
  const lowConfidence = confidence < confidenceThreshold;
  const issues: ReviewIssue[] = [];

  if (lowConfidence) {
    issues.push({
      id: "issue-low-confidence",
      kind: "low_confidence",
      severity: "warning",
      message: `Average confidence ${confidence.toFixed(2)} is below threshold ${confidenceThreshold.toFixed(2)}.`
    });
  }
  for (const nodeId of missingEvidence) {
    issues.push({
      id: `issue-missing-evidence-${nodeId}`,
      kind: "missing_evidence",
      severity: "error",
      node_id: nodeId,
      message: `Node ${nodeId} completed without evidence.`
    });
  }
  for (const nodeId of contradictions) {
    issues.push({
      id: `issue-contradiction-${nodeId}`,
      kind: "contradiction",
      severity: "error",
      node_id: nodeId,
      message: `Node ${nodeId} output contains a contradiction marker.`
    });
  }
  for (const nodeId of toolFailures) {
    issues.push({
      id: `issue-tool-failure-${nodeId}`,
      kind: "tool_failure",
      severity: "error",
      node_id: nodeId,
      message: byNode.get(nodeId)?.error ?? `Node ${nodeId} failed during tool execution.`
    });
  }

  return findingFromIssues(graph, issues, confidence, executions.length > 0 && toolFailures.length === executions.length);
}

function parseCriticFinding(content: string, graph: ResearchDAG, fallback: CriticFinding): CriticFinding {
  const parsed = JSON.parse(extractJSONObject(content));
  const record = asRecord(parsed);
  const issues = arrayValue(record.issues).map((item, index) => normalizeIssue(item, index)).filter((item): item is ReviewIssue => Boolean(item));
  const confidence = numberValue(record.confidence, fallback.confidence);
  const actions = arrayValue(record.revisionActions).map((item, index) => normalizeRevisionAction(item, index)).filter((item): item is RevisionAction => Boolean(item));
  const status = normalizeStatus(record.status, issues, fallback.status);
  const checkedClaims = stringArray(record.checkedClaims, fallback.checkedClaims);
  const reasons = unique(issues.map((issue) => issue.kind));

  return {
    status,
    issues,
    revisionActions: actions.length ? dedupeActions(actions) : buildRevisionActions(graph, issues),
    checkedClaims,
    confidence,
    passed: status === "passed",
    reasons,
    missing_evidence: issues.filter((issue) => issue.kind === "missing_evidence").flatMap((issue) => issue.node_id ? [issue.node_id] : []),
    contradictions: issues.filter((issue) => issue.kind === "contradiction").flatMap((issue) => issue.node_id ? [issue.node_id] : []),
    tool_failures: issues.filter((issue) => issue.kind === "tool_failure").flatMap((issue) => issue.node_id ? [issue.node_id] : [])
  };
}

function findingFromIssues(graph: ResearchDAG, issues: ReviewIssue[], confidence: number, allExecutionsFailed: boolean): CriticFinding {
  const reasons = unique(issues.map((issue) => issue.kind));
  const status = issues.length === 0 ? "passed" : allExecutionsFailed ? "failed" : "needs_revision";
  return {
    status,
    issues,
    revisionActions: buildRevisionActions(graph, issues),
    checkedClaims: graph.research_graph.flatMap((node) => node.outputs.map((output) => `${node.node_id}:${output}`)),
    confidence,
    passed: status === "passed",
    reasons,
    missing_evidence: issues.filter((issue) => issue.kind === "missing_evidence").flatMap((issue) => issue.node_id ? [issue.node_id] : []),
    contradictions: issues.filter((issue) => issue.kind === "contradiction").flatMap((issue) => issue.node_id ? [issue.node_id] : []),
    tool_failures: issues.filter((issue) => issue.kind === "tool_failure").flatMap((issue) => issue.node_id ? [issue.node_id] : [])
  };
}

function mergeCriticFindings(heuristic: CriticFinding, model: CriticFinding): CriticFinding {
  const issues = dedupeIssues([...heuristic.issues, ...model.issues]);
  const status = issues.length === 0 ? "passed" : heuristic.status === "failed" || model.status === "failed" ? "failed" : "needs_revision";
  const reasons = unique(issues.map((issue) => issue.kind));
  return {
    status,
    issues,
    revisionActions: dedupeActions([...heuristic.revisionActions, ...model.revisionActions]),
    checkedClaims: unique([...heuristic.checkedClaims, ...model.checkedClaims]),
    confidence: Math.min(heuristic.confidence, model.confidence),
    passed: status === "passed",
    reasons,
    missing_evidence: unique([...heuristic.missing_evidence, ...model.missing_evidence]),
    contradictions: unique([...heuristic.contradictions, ...model.contradictions]),
    tool_failures: unique([...heuristic.tool_failures, ...model.tool_failures])
  };
}

function buildRevisionActions(graph: ResearchDAG, issues: ReviewIssue[]): RevisionAction[] {
  const actions: RevisionAction[] = [];
  const byId = new Map(graph.research_graph.map((node) => [node.node_id, node]));

  for (const issue of issues) {
    if (issue.kind === "low_confidence") {
      actions.push({
        id: "action-add-evidence-low-confidence",
        type: "add_evidence",
        instruction: "Collect additional independent evidence and record explicit confidence rationale.",
        tools_required: ["literature.search", "browser.validate"],
        skills_required: ["research_skill"]
      });
    } else if (issue.kind === "missing_evidence") {
      actions.push({
        id: `action-add-evidence-${issue.node_id}`,
        type: "add_evidence",
        node_id: issue.node_id,
        instruction: `Add evidence for node ${issue.node_id} and map it to the node outputs.`,
        tools_required: ["literature.search", "browser.validate"],
        skills_required: ["research_skill", "paper_analysis_skill"]
      });
    } else if (issue.kind === "contradiction") {
      actions.push({
        id: `action-resolve-contradiction-${issue.node_id}`,
        type: "resolve_contradiction",
        node_id: issue.node_id,
        instruction: `Resolve or explicitly scope the contradiction reported for node ${issue.node_id}.`,
        tools_required: ["browser.validate", "literature.search"],
        skills_required: ["research_skill", "paper_analysis_skill"]
      });
    } else if (issue.kind === "tool_failure") {
      const original = issue.node_id ? byId.get(issue.node_id) : undefined;
      actions.push({
        id: `action-retry-tool-${issue.node_id}`,
        type: "retry_tool",
        node_id: issue.node_id,
        instruction: `Recover from tool failure for node ${issue.node_id}; use alternate evidence if the original tool remains unavailable.`,
        tools_required: fallbackTools(original?.tools_required ?? []),
        skills_required: original?.skills_required?.length ? original.skills_required : ["research_skill"]
      });
    }
  }

  return dedupeActions(actions);
}

function fallbackTools(tools: string[]): string[] {
  if (tools.some((tool) => tool.startsWith("github."))) {
    return ["github.repo_exploration", "browser.validate"];
  }
  if (tools.includes("runtime.python")) {
    return ["runtime.python", "dataset.lookup"];
  }
  return ["literature.search", "browser.validate"];
}

function normalizeIssue(value: unknown, index: number): ReviewIssue | undefined {
  const record = asOptionalRecord(value);
  if (!record) {
    return undefined;
  }
  const kind = normalizeIssueKind(record.kind);
  if (!kind) {
    return undefined;
  }
  return {
    id: stringValue(record.id, `model-issue-${index + 1}`),
    kind,
    severity: record.severity === "error" ? "error" : "warning",
    node_id: optionalString(record.node_id),
    message: stringValue(record.message, `Model critic reported ${kind}.`)
  };
}

function normalizeRevisionAction(value: unknown, index: number): RevisionAction | undefined {
  const record = asOptionalRecord(value);
  if (!record) {
    return undefined;
  }
  const type = normalizeRevisionActionType(record.type);
  if (!type) {
    return undefined;
  }
  return {
    id: stringValue(record.id, `model-action-${index + 1}`),
    type,
    node_id: optionalString(record.node_id),
    instruction: stringValue(record.instruction, "Address the critic finding with traceable evidence or an explicit limitation."),
    tools_required: stringArray(record.tools_required, ["literature.search", "browser.validate"]),
    skills_required: stringArray(record.skills_required, ["research_skill"])
  };
}

function normalizeStatus(value: unknown, issues: ReviewIssue[], fallback: CriticFinding["status"]): CriticFinding["status"] {
  if (value === "passed" || value === "needs_revision" || value === "failed") {
    return issues.length === 0 && value !== "failed" ? "passed" : value;
  }
  return issues.length === 0 ? "passed" : fallback === "failed" ? "failed" : "needs_revision";
}

function normalizeIssueKind(value: unknown): ReviewIssueKind | undefined {
  if (value === "low_confidence" || value === "missing_evidence" || value === "contradiction" || value === "tool_failure") {
    return value;
  }
  return undefined;
}

function normalizeRevisionActionType(value: unknown): RevisionAction["type"] | undefined {
  if (value === "add_evidence" || value === "resolve_contradiction" || value === "retry_tool" || value === "document_limitation") {
    return value;
  }
  return undefined;
}

function summarizeExecutions(executions: NodeExecution[]): unknown[] {
  return executions.map((execution) => ({
    node_id: execution.node_id,
    status: execution.status,
    confidence: execution.confidence,
    error: execution.error,
    evidence: execution.evidence.map((item) => ({
      id: item.id,
      claimIds: item.claimIds,
      sourceType: item.sourceType,
      sourceUrl: item.sourceUrl,
      sourceDoi: item.sourceDoi,
      locator: item.locator,
      snippet: item.snippet,
      confidence: item.confidence,
      toolName: item.toolName
    })),
    tool_trace: execution.tool_trace
  }));
}

function extractJSONObject(content: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(content);
  const candidate = fenced?.[1] ?? content;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Critic response does not contain a JSON object.");
  }
  return candidate.slice(start, end + 1);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Critic response must be an object.");
  }
  return value as Record<string, unknown>;
}

function asOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringArray(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : fallback;
}

function dedupeActions(actions: RevisionAction[]): RevisionAction[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    if (seen.has(action.id)) {
      return false;
    }
    seen.add(action.id);
    return true;
  });
}

function dedupeIssues(issues: ReviewIssue[]): ReviewIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.kind}:${issue.node_id ?? ""}:${issue.message}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function unique<T extends string>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}