export type ResearchNodeType = "hypothesis" | "question" | "experiment" | "analysis" | "synthesis";

export type ResearchDAGNode = {
  node_id: string;
  type: ResearchNodeType;
  instruction: string;
  inputs: string[];
  outputs: string[];
  tools_required: string[];
  skills_required?: string[];
  depends_on: string[];
  success_criteria: string;
};

export type ResearchDAG = {
  idea: string;
  goal: string;
  research_graph: ResearchDAGNode[];
  execution_strategy: {
    mode: "sequential" | "parallel" | "adaptive";
    replan_trigger: string[];
  };
  final_output_spec: {
    format: "report" | "code" | "dataset" | "experiment";
    sections: string[];
  };
};

export type MCPToolType = "api" | "browser" | "runtime" | "dataset";

export interface MCPTool {
  name: string;
  type: MCPToolType;
  input_schema: unknown;
  output_schema: unknown;
  execute(input: unknown): Promise<unknown>;
}

export type ToolSpec = MCPTool;

export type ModelRole = "planning" | "execution" | "critic" | "synthesizer";

export type EvidenceItem = {
  id: string;
  node_id: string;
  claimIds: string[];
  sourceType: string;
  sourceId?: string;
  sourceUrl?: string;
  sourceDoi?: string;
  locator?: string;
  snippet: string;
  confidence: number;
  licenseNote?: string;
  toolName?: string;
  created_at: string;
  metadata?: Record<string, unknown>;
};

export type ToolExecutionTrace = {
  tool: string;
  ok: boolean;
  started_at: string;
  completed_at: string;
  evidence_ids: string[];
  error?: string;
};

export type SkillSpec = {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  input_schema: unknown;
  output_schema: unknown;
  required_tools: string[];
  default_model_role: ModelRole;
  system_prompt: string;
  tool_policy: {
    allowed_tools: string[];
    disallowed_tools: string[];
  };
  workflow: string[];
};

export type Skill = SkillSpec;

export type RuntimeConfig = {
  provider: "mock" | "openai" | "anthropic" | "custom" | "local" | "openai-compatible";
  apiKey?: string;
  baseURL?: string;
  model: string;
  models: Record<ModelRole, string>;
  thresholds: {
    confidence: number;
    max_replans: number;
  };
};

export type RuntimeEvent =
  | { type: "plan"; session_id: string; graph: ResearchDAG }
  | { type: "node_start"; session_id: string; node_id: string }
  | { type: "tool_result"; session_id: string; node_id: string; tool: string; ok: boolean }
  | { type: "critic_result"; session_id: string; passed: boolean; status: ReviewResult["status"]; reasons: string[] }
  | { type: "replan"; session_id: string; round: number; reasons: string[] }
  | { type: "final_report"; session_id: string; report_path: string };

export type NodeExecution = {
  node_id: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  output?: unknown;
  evidence: EvidenceItem[];
  confidence: number;
  tool_trace: ToolExecutionTrace[];
  error?: string;
  started_at?: string;
  completed_at?: string;
};

export type ReviewIssueKind = "low_confidence" | "missing_evidence" | "contradiction" | "tool_failure";

export type ReviewIssue = {
  id: string;
  kind: ReviewIssueKind;
  severity: "warning" | "error";
  node_id?: string;
  message: string;
};

export type RevisionAction = {
  id: string;
  type: "add_evidence" | "resolve_contradiction" | "retry_tool" | "document_limitation";
  node_id?: string;
  instruction: string;
  tools_required: string[];
  skills_required: string[];
};

export type ReviewResult = {
  status: "passed" | "needs_revision" | "failed";
  issues: ReviewIssue[];
  revisionActions: RevisionAction[];
  checkedClaims: string[];
  confidence: number;
};

export type CriticFinding = ReviewResult & {
  passed: boolean;
  reasons: ReviewIssueKind[];
  missing_evidence: string[];
  contradictions: string[];
  tool_failures: string[];
};

export type GraphRevision = {
  round: number;
  reasons: string[];
  actions: RevisionAction[];
  graph: ResearchDAG;
  created_at: string;
};

export type RuntimeSession = {
  session_id: string;
  graph: ResearchDAG;
  executions: NodeExecution[];
  critic_rounds: CriticFinding[];
  report?: string;
  graph_revisions?: GraphRevision[];
};
