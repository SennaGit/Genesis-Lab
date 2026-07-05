import type { ResearchDAG, ResearchDAGNode, ResearchNodeType } from "../types/research.ts";

const NODE_TYPES = new Set<ResearchNodeType>(["hypothesis", "question", "experiment", "analysis", "synthesis"]);
const MODES = new Set(["sequential", "parallel", "adaptive"]);
const FORMATS = new Set(["report", "code", "dataset", "experiment"]);

export function assertResearchDAG(value: unknown): asserts value is ResearchDAG {
  const graph = asRecord(value, "ResearchDAG");
  assertString(graph.idea, "idea");
  assertString(graph.goal, "goal");
  if (!Array.isArray(graph.research_graph) || graph.research_graph.length === 0) {
    throw new Error("ResearchDAG.research_graph must be a non-empty array.");
  }
  for (const node of graph.research_graph) {
    assertResearchDAGNode(node);
  }
  const strategy = asRecord(graph.execution_strategy, "execution_strategy");
  if (!MODES.has(String(strategy.mode))) {
    throw new Error("execution_strategy.mode must be sequential, parallel, or adaptive.");
  }
  assertStringArray(strategy.replan_trigger, "execution_strategy.replan_trigger");
  const outputSpec = asRecord(graph.final_output_spec, "final_output_spec");
  if (!FORMATS.has(String(outputSpec.format))) {
    throw new Error("final_output_spec.format must be report, code, dataset, or experiment.");
  }
  assertStringArray(outputSpec.sections, "final_output_spec.sections");
  validateDependencies(graph.research_graph as ResearchDAGNode[]);
}

export function isResearchDAG(value: unknown): value is ResearchDAG {
  try {
    assertResearchDAG(value);
    return true;
  } catch {
    return false;
  }
}

function assertResearchDAGNode(value: unknown): asserts value is ResearchDAGNode {
  const node = asRecord(value, "research_graph node");
  assertString(node.node_id, "node_id");
  if (!NODE_TYPES.has(String(node.type) as ResearchNodeType)) {
    throw new Error(`Invalid research node type for ${node.node_id}.`);
  }
  assertString(node.instruction, "instruction");
  assertStringArray(node.inputs, "inputs");
  assertStringArray(node.outputs, "outputs");
  assertStringArray(node.tools_required, "tools_required");
  if (node.skills_required !== undefined) {
    assertStringArray(node.skills_required, "skills_required");
  }
  assertStringArray(node.depends_on, "depends_on");
  assertString(node.success_criteria, "success_criteria");
}

function validateDependencies(nodes: ResearchDAGNode[]): void {
  const ids = new Set(nodes.map((node) => node.node_id));
  for (const node of nodes) {
    for (const dependency of node.depends_on) {
      if (!ids.has(dependency)) {
        throw new Error(`Node ${node.node_id} depends on missing node ${dependency}.`);
      }
    }
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertString(value: unknown, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function assertStringArray(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be a string array.`);
  }
}

