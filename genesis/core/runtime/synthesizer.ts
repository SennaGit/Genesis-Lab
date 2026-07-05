import type { CriticFinding, EvidenceItem, NodeExecution, ResearchDAG } from "../../types/research.ts";
import { ModelRouter } from "../../models/model_router.ts";

const REQUIRED_REPORT_SECTIONS = ["Research Plan", "Findings", "Experiments", "Limitations", "Conclusion", "Evidence Map", "Artifacts"];

export class Synthesizer {
  private readonly models: ModelRouter;

  constructor(models = new ModelRouter()) {
    this.models = models;
  }

  async synthesize(graph: ResearchDAG, executions: NodeExecution[], criticRounds: CriticFinding[]): Promise<string> {
    if (this.models.runtimeConfig().provider !== "mock") {
      const modelReport = await this.synthesizeWithModel(graph, executions, criticRounds);
      if (modelReport) {
        return modelReport;
      }
    }
    return templateReport(graph, executions, criticRounds);
  }

  private async synthesizeWithModel(graph: ResearchDAG, executions: NodeExecution[], criticRounds: CriticFinding[]): Promise<string | undefined> {
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      {
        role: "system",
        content: [
          "You are Genesis Synthesizer.",
          "Produce a concise Markdown research report, not JSON.",
          "The report must include exactly these section headings: " + REQUIRED_REPORT_SECTIONS.map((section) => `## ${section}`).join(", ") + ".",
          "Ground every claim in the provided evidence map or explicitly list it as a limitation.",
          "Do not expose API keys, hidden config, or provider credentials.",
          "Do not design GitHub bots, workflow automation, or CI/CD systems. GitHub may appear only as an evidence source."
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify({ graph, executions: summarizeExecutions(executions), criticRounds }, null, 2)
      }
    ];

    try {
      const response = await this.models.chat("synthesizer", messages);
      const report = normalizeReport(response.content);
      return hasRequiredSections(report) ? report : undefined;
    } catch {
      return undefined;
    }
  }
}

function templateReport(graph: ResearchDAG, executions: NodeExecution[], criticRounds: CriticFinding[]): string {
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

function summarizeExecutions(executions: NodeExecution[]): unknown[] {
  return executions.map((execution) => ({
    node_id: execution.node_id,
    status: execution.status,
    confidence: execution.confidence,
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
    tool_trace: execution.tool_trace,
    error: execution.error
  }));
}

function normalizeReport(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith("#") ? `${trimmed}\n` : `# Genesis Research Report\n\n${trimmed}\n`;
}

function hasRequiredSections(report: string): boolean {
  return REQUIRED_REPORT_SECTIONS.every((section) => report.includes(`## ${section}`));
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