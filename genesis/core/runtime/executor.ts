import type { EvidenceItem, NodeExecution, ResearchDAG, ResearchDAGNode, Skill, ToolExecutionTrace } from "../../types/research.ts";
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
    const evidence: EvidenceItem[] = [];
    const confidences: number[] = [];
    const toolTrace: ToolExecutionTrace[] = [];
    const activeSkills = this.activeSkills(node);
    let activeTool: string | undefined;
    let activeToolStarted: string | undefined;

    try {
      for (const tool of node.tools_required) {
        activeTool = tool;
        activeToolStarted = new Date().toISOString();
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
        const completed = new Date().toISOString();
        if (!result.ok) {
          toolTrace.push({
            tool,
            ok: false,
            started_at: activeToolStarted,
            completed_at: completed,
            evidence_ids: [],
            error: result.error
          });
          return {
            node_id: node.node_id,
            status: "failed",
            evidence,
            confidence: 0,
            tool_trace: toolTrace,
            error: result.error,
            started_at: started,
            completed_at: completed
          };
        }

        const toolEvidence = evidenceFromToolOutput(result.output, graph, node, tool, completed);
        evidence.push(...toolEvidence);
        confidences.push(toolEvidence.length ? average(toolEvidence.map((item) => item.confidence)) : 0.7);
        toolTrace.push({
          tool,
          ok: true,
          started_at: activeToolStarted,
          completed_at: completed,
          evidence_ids: toolEvidence.map((item) => item.id)
        });
        activeTool = undefined;
        activeToolStarted = undefined;
      }

      if (node.tools_required.length === 0) {
        const item = reasoningEvidence(graph, node, started);
        evidence.push(item);
        confidences.push(item.confidence);
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
        tool_trace: toolTrace,
        started_at: started,
        completed_at: new Date().toISOString()
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (activeTool && !toolTrace.some((trace) => trace.tool === activeTool && trace.started_at === activeToolStarted)) {
        toolTrace.push({
          tool: activeTool,
          ok: false,
          started_at: activeToolStarted ?? started,
          completed_at: new Date().toISOString(),
          evidence_ids: [],
          error: message
        });
      }
      return {
        node_id: node.node_id,
        status: "failed",
        evidence,
        confidence: 0,
        tool_trace: toolTrace,
        error: message,
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

function evidenceFromToolOutput(output: unknown, graph: ResearchDAG, node: ResearchDAGNode, tool: string, createdAt: string): EvidenceItem[] {
  const record = asRecord(output);
  const rawEvidence = record?.evidence ?? record?.structuredContent ?? record?.content;
  const values = Array.isArray(rawEvidence) ? rawEvidence : [rawEvidence ?? `${tool} completed`];
  return values.map((value, index) => normalizeEvidenceValue(value, record, graph, node, tool, index, createdAt));
}

function normalizeEvidenceValue(
  value: unknown,
  toolOutput: Record<string, unknown> | undefined,
  graph: ResearchDAG,
  node: ResearchDAGNode,
  tool: string,
  index: number,
  createdAt: string
): EvidenceItem {
  const record = asRecord(value);
  const sourceType = stringValue(record?.sourceType, stringValue(toolOutput?.sourceType, sourceTypeForTool(tool)));
  const snippet = stringValue(record?.snippet, stringValue(record?.evidence, stringifyEvidence(value)));
  const confidence = numberValue(record?.confidence, numberValue(toolOutput?.confidence, 0.7));
  const claimIds = stringArray(record?.claimIds, node.outputs.map((output) => `${node.node_id}:${output}`));
  return {
    id: `${node.node_id}:${sanitizeId(tool)}:${index + 1}`,
    node_id: node.node_id,
    claimIds,
    sourceType,
    sourceId: stringValue(record?.sourceId, stringValue(toolOutput?.sourceId, tool)),
    sourceUrl: optionalString(record?.sourceUrl ?? record?.url ?? toolOutput?.sourceUrl),
    sourceDoi: optionalString(record?.sourceDoi ?? record?.doi ?? toolOutput?.sourceDoi),
    locator: optionalString(record?.locator ?? toolOutput?.locator),
    snippet,
    confidence,
    licenseNote: optionalString(record?.licenseNote ?? toolOutput?.licenseNote),
    toolName: tool,
    created_at: createdAt,
    metadata: metadataValue(record?.metadata ?? toolOutput?.metadata, graph, node)
  };
}

function reasoningEvidence(graph: ResearchDAG, node: ResearchDAGNode, createdAt: string): EvidenceItem {
  return {
    id: `${node.node_id}:reasoning:1`,
    node_id: node.node_id,
    claimIds: node.outputs.map((output) => `${node.node_id}:${output}`),
    sourceType: "reasoning",
    sourceId: "genesis.runtime",
    snippet: `${node.type} reasoning completed for ${node.node_id}: ${node.instruction}`,
    confidence: 0.74,
    licenseNote: "Generated runtime reasoning; verify externally before publication use.",
    created_at: createdAt,
    metadata: {
      idea: graph.idea,
      success_criteria: node.success_criteria
    }
  };
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
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

function metadataValue(value: unknown, graph: ResearchDAG, node: ResearchDAGNode): Record<string, unknown> {
  const metadata = asRecord(value) ?? {};
  return {
    ...metadata,
    idea: graph.idea,
    node_type: node.type,
    success_criteria: node.success_criteria
  };
}

function sourceTypeForTool(tool: string): string {
  if (tool.startsWith("github.")) {
    return "github";
  }
  if (tool.includes("browser")) {
    return "browser";
  }
  if (tool.includes("runtime")) {
    return "runtime";
  }
  if (tool.includes("dataset")) {
    return "dataset";
  }
  if (tool.includes("literature") || tool.includes("arxiv") || tool.includes("paper")) {
    return "literature";
  }
  return "mcp";
}

function stringifyEvidence(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined || value === null) {
    return "Tool completed without textual evidence.";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, "_");
}
