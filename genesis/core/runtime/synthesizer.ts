import type { CriticFinding, EvidenceItem, NodeExecution, ResearchDAG } from "../../types/research.ts";

export class Synthesizer {
  synthesize(graph: ResearchDAG, executions: NodeExecution[], criticRounds: CriticFinding[]): string {
    const evidenceMap = executions
      .map((item) => `- ${item.node_id}: ${formatEvidenceList(item.evidence)}`)
      .join("\n");
    const finalReview = criticRounds.at(-1);
    const limitations = criticRounds.flatMap((round) => round.issues.map((issue) => issue.message));
    const experimentNodes = graph.research_graph.filter((node) => node.type === "experiment" || node.tools_required.includes("runtime.python"));
    const artifactLines = executions.map((item) => `- ${item.node_id}: execution_log.json#${item.node_id}`);

    return [
      "# Genesis Research Report",
      "",
      "## Research Plan",
      `- Idea: ${graph.idea}`,
      `- Goal: ${graph.goal}`,
      `- Strategy: ${graph.execution_strategy.mode}`,
      `- Nodes: ${graph.research_graph.length}`,
      "",
      "## Findings",
      ...executions.map((item) => `- ${item.node_id}: ${item.status}, confidence=${item.confidence.toFixed(2)}, evidence=${item.evidence.length}`),
      "",
      "## Experiments",
      experimentNodes.length ? experimentNodes.map((node) => `- ${node.node_id}: ${node.instruction}`).join("\n") : "- No executable experiment node was required for this run.",
      "",
      "## Limitations",
      limitations.length ? [...new Set(limitations)].map((item) => `- ${item}`).join("\n") : "- No critic blockers detected.",
      "",
      "## Conclusion",
      finalReview?.passed
        ? "- The research DAG completed with critic checks passed."
        : `- The run completed with unresolved review status: ${finalReview?.status ?? "unknown"}.`,
      "",
      "## Evidence Map",
      evidenceMap || "- no evidence",
      "",
      "## Artifacts",
      artifactLines.length ? artifactLines.join("\n") : "- No artifacts were produced.",
      ""
    ].join("\n");
  }
}

function formatEvidenceList(evidence: EvidenceItem[]): string {
  if (!evidence.length) {
    return "no evidence";
  }
  return evidence.map((item) => {
    const locator = item.sourceUrl ? ` ${item.sourceUrl}` : item.sourceDoi ? ` doi:${item.sourceDoi}` : item.locator ? ` ${item.locator}` : "";
    return `[${item.id}] ${item.snippet} (source=${item.sourceType}, confidence=${item.confidence.toFixed(2)}${locator})`;
  }).join("; ");
}
