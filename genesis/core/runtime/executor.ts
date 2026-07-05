import type { NodeExecution, ResearchDAG, ResearchDAGNode, Skill } from "../../types/research.ts";
import { MCPToolRegistry } from "../../mcp/registry.ts";
import { assertGitHubIsCapabilityOnly } from "../../mcp/github_capabilities.ts";
import { SkillRegistry } from "../../skills/registry.ts";

export class Executor {
  private readonly tools: MCPToolRegistry;
  private readonly skills: SkillRegistry;

  constructor(tools = new MCPToolRegistry(), skills = new SkillRegistry()) {
    this.tools = tools;
    this.skills = skills;
  }

  async executeNode(graph: ResearchDAG, node: ResearchDAGNode): Promise<NodeExecution> {
    const started = new Date().toISOString();
    const evidence: string[] = [];
    const confidences: number[] = [];
    const activeSkills = this.activeSkills(node);

    try {
      for (const tool of node.tools_required) {
        assertGitHubIsCapabilityOnly(tool);
        this.assertToolPolicy(tool, activeSkills, node);
        const result = await this.tools.execute(tool, {
          idea: graph.idea,
          goal: graph.goal,
          node_id: node.node_id,
          instruction: node.instruction,
          inputs: node.inputs,
          skills_required: node.skills_required ?? []
        });
        if (!result.ok) {
          return {
            node_id: node.node_id,
            status: "failed",
            evidence,
            confidence: 0,
            error: result.error,
            started_at: started,
            completed_at: new Date().toISOString()
          };
        }
        const output = result.output as { evidence?: string; confidence?: number };
        evidence.push(output.evidence ?? `${tool} completed`);
        confidences.push(typeof output.confidence === "number" ? output.confidence : 0.7);
      }

      if (node.tools_required.length === 0) {
        evidence.push(`${node.type} reasoning completed for ${node.node_id}`);
        confidences.push(0.74);
      }

      return {
        node_id: node.node_id,
        status: "success",
        output: {
          instruction: node.instruction,
          outputs: node.outputs,
          evidence,
          skills: activeSkills.map((skill) => skill.name)
        },
        evidence,
        confidence: average(confidences),
        started_at: started,
        completed_at: new Date().toISOString()
      };
    } catch (error) {
      return {
        node_id: node.node_id,
        status: "failed",
        evidence,
        confidence: 0,
        error: error instanceof Error ? error.message : String(error),
        started_at: started,
        completed_at: new Date().toISOString()
      };
    }
  }

  private activeSkills(node: ResearchDAGNode): Skill[] {
    const names = node.skills_required?.length ? node.skills_required : ["research_skill"];
    return names.map((name) => this.skills.get(name));
  }

  private assertToolPolicy(tool: string, skills: Skill[], node: ResearchDAGNode): void {
    const disallowedBy = skills.find((skill) => matchesAny(tool, skill.tool_policy.disallowed_tools));
    if (disallowedBy) {
      throw new Error(`Tool ${tool} is disallowed by skill ${disallowedBy.name} for node ${node.node_id}.`);
    }
    const allowed = skills.some((skill) => matchesAny(tool, skill.tool_policy.allowed_tools));
    if (!allowed) {
      throw new Error(`Tool ${tool} is not allowed by active skills for node ${node.node_id}.`);
    }
  }
}

function matchesAny(tool: string, patterns: string[]): boolean {
  return patterns.some((pattern) => pattern === tool || (pattern.endsWith(".*") && tool.startsWith(pattern.slice(0, -1))));
}

function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
