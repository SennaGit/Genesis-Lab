import { getJson, postJson } from "@/services/api-client";
import type {
  CreateRunRequest,
  CreateRunResponse,
  ResearchEvidenceResponse,
  ResearchReportResponse,
  ResearchRun
} from "@/types/research.types";

export async function createResearchRun(question: string): Promise<CreateRunResponse> {
  return postJson<CreateRunRequest, CreateRunResponse>("/api/runs", { question });
}

export async function getResearchRun(runId: string): Promise<ResearchRun> {
  return getJson<ResearchRun>(`/api/runs/${runId}`);
}

export async function getResearchEvidence(runId: string): Promise<ResearchEvidenceResponse> {
  return getJson<ResearchEvidenceResponse>(`/api/runs/${runId}/evidence`);
}

export async function getResearchReport(runId: string): Promise<ResearchReportResponse> {
  return getJson<ResearchReportResponse>(`/api/runs/${runId}/report`);
}
