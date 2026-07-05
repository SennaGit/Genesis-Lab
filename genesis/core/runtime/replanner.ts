import type { CriticFinding, ResearchDAG, RevisionAction } from "../../types/research.ts";
import { ModelRouter } from "../../models/model_router.ts";
import { assertResearchDAG } from "../../schemas/research_dag_schema.ts";
import { parseResearchDAG } from "./planner.ts";

export class Replanner {
  private readonly models: ModelRouter;

  constructor(models = new ModelRouter()) {
    this.models = models;
  }

  async replan(graph: ResearchDAG, finding: CriticFinding, round: number): Promise<ResearchDAG> {
    if (this.models.runtimeConfig().provider !== "mock") {
      const modelGraph = await this.replanWithModel(graph, finding, round);
      if (modelGraph) {
        return modelGraph;
      }
    }
    return deterministicReplan(graph, finding, round);
  }

  private async replanWithModel(graph: ResearchDAG, finding: CriticFinding, round: number): Promise<ResearchDAG | undefined> {
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      {
        role: "system",
        content: [
          "You are Genesis Replanner.",
          "Return strict JSON only, with no markdown unless asked to repair malformed output.",
          "Return the complete revised ResearchDAG, not a patch.",
          "Preserve all existing research_graph nodes and append or adjust only what is required by the critic.",
          "The JSON must match: idea, goal, research_graph[], execution_strategy, final_output_spec.",
          "Node type must be hypothesis | question | experiment | analysis | synthesis.",
          "GitHub may only appear as a capability provider, never as a bot/workflow/automation design.",
          "The revised DAG must add traceable evidence, contradiction resolution, tool recovery, or explicit limitation nodes."
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify({ round, current_graph: graph, critic: finding }, null, 2)
      }
    ];

    let lastError = "";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await this.models.chat("planning", messages);
        const revised = parseResearchDAG(response.content);
        return validateReplannedGraph(graph, revised);
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        messages.push({ role: "assistant", content: "The previous replanning response was invalid and could not be used." });
        messages.push({
          role: "user",
          content: `Repair the replan. Return only valid JSON matching the mandatory ResearchDAG schema. Validation error: ${lastError}`
        });
      }
    }
    return undefined;
  }
}

export function deterministicReplan(graph: ResearchDAG, finding: CriticFinding, round: number): ResearchDAG {
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

function validateReplannedGraph(original: ResearchDAG, revised: ResearchDAG): ResearchDAG {
  assertResearchDAG(revised);
  const revisedIds = new Set(revised.research_graph.map((node) => node.node_id));
  for (const originalNode of original.research_graph) {
    if (!revisedIds.has(originalNode.node_id)) {
      throw new Error(`Replanned DAG dropped existing node ${originalNode.node_id}.`);
    }
  }
  if (revised.research_graph.length <= original.research_graph.length) {
    throw new Error("Replanned DAG must add at least one revision node.");
  }
  const invalidTool = revised.research_graph.flatMap((node) => node.tools_required).find((tool) => /workflow|bot|automation/i.test(tool));
  if (invalidTool) {
    throw new Error(`Replanned DAG used disallowed workflow/bot tool semantics: ${invalidTool}`);
  }
  return {
    ...revised,
    idea: revised.idea || original.idea,
    execution_strategy: {
      ...revised.execution_strategy,
      mode: "adaptive"
    }
  };
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
