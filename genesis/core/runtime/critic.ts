import type { CriticFinding, NodeExecution, ResearchDAG, ReviewIssue, ReviewIssueKind, RevisionAction } from "../../types/research.ts";

export class Critic {
  private readonly confidenceThreshold: number;

  constructor(confidenceThreshold = 0.65) {
    this.confidenceThreshold = confidenceThreshold;
  }

  evaluate(graph: ResearchDAG, executions: NodeExecution[]): CriticFinding {
    const byNode = new Map(executions.map((item) => [item.node_id, item]));
    const toolFailures = executions.filter((item) => item.status === "failed").map((item) => item.node_id);
    const missingEvidence = executions
      .filter((item) => item.status === "success" && item.evidence.length === 0)
      .map((item) => item.node_id);
    const contradictions = executions
      .filter((item) => JSON.stringify(item.output ?? "").toLowerCase().includes("contradiction"))
      .map((item) => item.node_id);
    const confidence = average(executions.map((item) => item.confidence));
    const lowConfidence = confidence < this.confidenceThreshold;
    const issues: ReviewIssue[] = [];

    if (lowConfidence) {
      issues.push({
        id: "issue-low-confidence",
        kind: "low_confidence",
        severity: "warning",
        message: `Average confidence ${confidence.toFixed(2)} is below threshold ${this.confidenceThreshold.toFixed(2)}.`
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

    const reasons = unique(issues.map((issue) => issue.kind));
    const revisionActions = buildRevisionActions(graph, issues);
    const status = issues.length === 0 ? "passed" : toolFailures.length === executions.length && executions.length > 0 ? "failed" : "needs_revision";

    return {
      status,
      issues,
      revisionActions,
      checkedClaims: graph.research_graph.flatMap((node) => node.outputs.map((output) => `${node.node_id}:${output}`)),
      confidence,
      passed: status === "passed",
      reasons,
      missing_evidence: missingEvidence,
      contradictions,
      tool_failures: toolFailures
    };
  }
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

function unique<T extends string>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
