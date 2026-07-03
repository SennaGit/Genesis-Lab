export type DagNodeStatus = "pending" | "running" | "completed" | "failed" | "error";

export type DagNode = {
  id: string;
  type: string;
  status: DagNodeStatus | string;
  requires: string[];
  agent: string;
  outputs: Record<string, unknown>;
  attempts: number;
  error: string | null;
};

export type ResearchTask = {
  question: string;
  domains: string[];
  subQuestions: Array<{
    id: number;
    text: string;
    requires: number[];
  }>;
  hypotheses: string[];
  methods: string[];
};

export type ResearchRun = {
  id: string;
  question: string;
  status: string;
  task: ResearchTask;
  dag: DagNode[];
  logs: string[];
  artifacts: Array<Record<string, unknown>>;
  report: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type EvidenceItem = {
  id: string;
  sourceType: string;
  sourceId: string;
  snippet: string;
  metadata: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
};

export type ResearchEvidenceResponse = {
  items: EvidenceItem[];
};

export type ResearchReportResponse = {
  markdown: string;
};

export type CreateRunRequest = {
  question: string;
};

export type CreateRunResponse = {
  runId: string;
  status: string;
};
