import type { CriticFinding, ResearchDAG, RevisionAction } from "../../types/research.ts";

export class Replanner {
  replan(graph: ResearchDAG, finding: CriticFinding, round: number): ResearchDAG {
    const actions = finding.revisionActions.length ? finding.revisionActions : [fallbackAction(finding)];
    const existingIds = graph.research_graph.map((node) => node.node_id);
    const newNodes = actions.map((action, index) => ({
      node_id: actions.length === 1 ? `replan-${round}` : `replan-${round}-${index + 1}`,
      type: action.type === "add_evidence" ? "question" as const : "analysis" as const,
      instruction: action.instruction,
      inputs: ["critic_findings", ...(action.node_id ? [action.node_id] : [])],
      outputs: [action.type === "document_limitation" ? "limitations" : "refined_evidence"],
      tools_required: action.tools_required,
      skills_required: action.skills_required,
      depends_on: existingIds,
      success_criteria: "Revision action is addressed with traceable evidence, confidence, or explicit limitation."
    }));

    return {
      ...graph,
      research_graph: [...graph.research_graph, ...newNodes],
      execution_strategy: {
        ...graph.execution_strategy,
        mode: "adaptive"
      }
    };
  }
}

function fallbackAction(finding: CriticFinding): RevisionAction {
  return {
    id: "action-document-limitation",
    type: "document_limitation",
    instruction: `Document unresolved critic findings: ${finding.reasons.join(", ") || "unknown"}.`,
    tools_required: ["browser.validate"],
    skills_required: ["research_skill"]
  };
}

