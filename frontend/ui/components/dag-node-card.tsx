import type { DagNodeContract } from "@/ui/contracts/workspace.contracts";

export function DagNodeCard({ node }: DagNodeContract) {
  return (
    <div className={`dag-node dag-node--${node.status}`}>
      <strong>{node.id}</strong>
      <span>{agentLabel(node.agent)} / {statusLabel(node.status)}</span>
    </div>
  );
}

function agentLabel(agent: string): string {
  const labels: Record<string, string> = {
    Planner: "Planner",
    Executor: "Executor",
    Critic: "Critic",
    Replanner: "Replanner",
    Synthesizer: "Synthesizer",
    LiteratureAgent: "Evidence tool",
    CodeAgent: "Runtime tool",
    SynthesisAgent: "Synthesizer",
    ReviewAgent: "Critic"
  };

  return labels[agent] ?? agent;
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "pending",
    running: "running",
    completed: "completed",
    failed: "failed",
    error: "error",
    idle: "idle"
  };

  return labels[status] ?? status;
}
