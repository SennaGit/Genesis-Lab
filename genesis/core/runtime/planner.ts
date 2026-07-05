import type { ResearchDAG, ResearchDAGNode } from "../../types/research.ts";
import { assertResearchDAG } from "../../schemas/research_dag_schema.ts";
import { ModelRouter } from "../../models/model_router.ts";
import { SkillRegistry } from "../../skills/registry.ts";

export class Planner {
  private readonly models: ModelRouter;
  private readonly skills: SkillRegistry;

  constructor(models = new ModelRouter(), skills = new SkillRegistry()) {
    this.models = models;
    this.skills = skills;
  }

  async plan(idea: string): Promise<ResearchDAG> {
    const trimmed = idea.trim();
    if (!trimmed) {
      throw new Error("Research idea is required.");
    }
    if (this.models.runtimeConfig().provider !== "mock") {
      const graph = await this.planWithModel(trimmed);
      if (graph) {
        return this.withSkillDefaults(graph, trimmed);
      }
    }
    return deterministicResearchDAG(trimmed, this.skills.selectForIdea(trimmed).map((skill) => skill.name));
  }

  private async planWithModel(idea: string): Promise<ResearchDAG | undefined> {
    const selectedSkills = this.skills.selectForIdea(idea).map((skill) => skill.name).join(", ");
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      {
        role: "system",
        content: [
          "You are Genesis Planner.",
          "Return strict JSON only. Do not include markdown unless asked to repair malformed output.",
          "The JSON must match: idea, goal, research_graph[], execution_strategy, final_output_spec.",
          "Each research_graph node must use type hypothesis | question | experiment | analysis | synthesis.",
          "Each research_graph node may include skills_required using these selected policies: " + selectedSkills,
          "Use final_output_spec.sections exactly as a research report outline when possible.",
          "Never design a GitHub bot or CI workflow. GitHub can only appear as a capability provider."
        ].join("\n")
      },
      { role: "user", content: idea }
    ];

    let lastError = "";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await this.models.chat("planning", messages);
        return parseResearchDAG(response.content);
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        messages.push({
          role: "assistant",
          content: "The previous planner response was invalid and could not be used."
        });
        messages.push({
          role: "user",
          content: `Repair the plan. Return only valid JSON matching the mandatory ResearchDAG schema. Validation error: ${lastError}`
        });
      }
    }
    return undefined;
  }

  private withSkillDefaults(graph: ResearchDAG, idea: string): ResearchDAG {
    const skillNames = this.skills.selectForIdea(idea).map((skill) => skill.name);
    return {
      ...graph,
      research_graph: graph.research_graph.map((node) => ({
        ...node,
        skills_required: node.skills_required?.length ? node.skills_required : defaultSkillsForNode(node, skillNames)
      })),
      final_output_spec: {
        ...graph.final_output_spec,
        sections: graph.final_output_spec.sections.length ? graph.final_output_spec.sections : defaultReportSections()
      }
    };
  }
}

export function parseResearchDAG(content: string): ResearchDAG {
  const parsed = JSON.parse(extractJSONObject(content));
  assertResearchDAG(parsed);
  return parsed;
}

export function deterministicResearchDAG(idea: string, selectedSkills: string[] = ["research_skill"]): ResearchDAG {
  const lower = idea.toLowerCase();
  const needsCode = /code|repo|github|pr|commit|bug|debug|ci|代码|仓库|调试/.test(lower);
  const needsExperiment = /experiment|simulate|analysis|dataset|实验|仿真|分析|数据/.test(lower);
  const evidenceTools = needsCode ? ["github.repo_exploration", "github.code_understanding"] : ["literature.search", "browser.validate"];
  const experimentTools = needsExperiment ? ["runtime.python", "dataset.lookup"] : ["literature.search"];
  const skillNames = selectedSkills.length ? selectedSkills : ["research_skill"];

  return {
    idea,
    goal: `研究并验证：${idea}`,
    research_graph: [
      {
        node_id: "n1",
        type: "hypothesis",
        instruction: "Formulate the primary research hypothesis and falsifiable assumptions.",
        inputs: [idea],
        outputs: ["hypothesis"],
        tools_required: [],
        skills_required: ["research_skill"],
        depends_on: [],
        success_criteria: "Hypothesis is explicit, testable, and scoped."
      },
      {
        node_id: "n2",
        type: "question",
        instruction: "Collect source-grounded evidence relevant to the hypothesis.",
        inputs: ["hypothesis"],
        outputs: ["evidence"],
        tools_required: evidenceTools,
        skills_required: needsCode ? intersectOrFallback(skillNames, ["coding_skill", "debugging_skill", "research_skill"]) : intersectOrFallback(skillNames, ["research_skill", "paper_analysis_skill"]),
        depends_on: ["n1"],
        success_criteria: "At least one evidence item is linked to the hypothesis."
      },
      {
        node_id: "n3",
        type: needsExperiment ? "experiment" : "analysis",
        instruction: "Analyze evidence and run a lightweight validation path if useful.",
        inputs: ["hypothesis", "evidence"],
        outputs: ["analysis"],
        tools_required: experimentTools,
        skills_required: needsExperiment ? mergeSkillPolicy(skillNames, ["coding_skill", "research_skill"]) : intersectOrFallback(skillNames, ["research_skill", "paper_analysis_skill"]),
        depends_on: ["n2"],
        success_criteria: "Analysis has confidence above threshold and records limitations."
      },
      {
        node_id: "n4",
        type: "synthesis",
        instruction: "Synthesize findings into a structured research report.",
        inputs: ["hypothesis", "evidence", "analysis"],
        outputs: ["report"],
        tools_required: [],
        skills_required: ["research_skill"],
        depends_on: ["n3"],
        success_criteria: "Report includes claims, evidence map, limitations, and next steps."
      }
    ],
    execution_strategy: {
      mode: "adaptive",
      replan_trigger: ["low_confidence", "missing_evidence", "contradiction", "tool_failure"]
    },
    final_output_spec: {
      format: "report",
      sections: defaultReportSections()
    }
  };
}

function extractJSONObject(content: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(content);
  const candidate = fenced?.[1] ?? content;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Planner response does not contain a JSON object.");
  }
  return candidate.slice(start, end + 1);
}

function defaultReportSections(): string[] {
  return ["Research Plan", "Findings", "Experiments", "Limitations", "Conclusion", "Evidence Map", "Artifacts"];
}

function defaultSkillsForNode(node: ResearchDAGNode, selectedSkills: string[]): string[] {
  if (node.tools_required.some((tool) => tool.startsWith("github.ci"))) {
    return intersectOrFallback(selectedSkills, ["debugging_skill", "coding_skill"]);
  }
  if (node.tools_required.some((tool) => tool.startsWith("github.")) || node.tools_required.includes("runtime.python")) {
    return intersectOrFallback(selectedSkills, ["coding_skill", "research_skill"]);
  }
  if (node.tools_required.includes("literature.search")) {
    return intersectOrFallback(selectedSkills, ["paper_analysis_skill", "research_skill"]);
  }
  return intersectOrFallback(selectedSkills, ["research_skill"]);
}

function intersectOrFallback(selected: string[], preferred: string[]): string[] {
  const matched = preferred.filter((name) => selected.includes(name));
  return matched.length ? matched : [preferred.at(-1) ?? "research_skill"];
}

function mergeSkillPolicy(selected: string[], required: string[]): string[] {
  return Array.from(new Set([...required, ...selected.filter((name) => required.includes(name))]));
}
