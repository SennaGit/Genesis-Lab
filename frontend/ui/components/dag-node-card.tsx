import type { DagNodeContract } from "@/ui/contracts/workspace.contracts";

export function DagNodeCard({ node }: DagNodeContract) {
  return (
    <div className={`dag-node dag-node--${node.status}`}>
      <strong>{node.id}</strong>
      <span>{agentLabel(node.agent)} · {statusLabel(node.status)}</span>
    </div>
  );
}

function agentLabel(agent: string): string {
  const labels: Record<string, string> = {
    LiteratureAgent: "文献检索代理",
    CodeAgent: "代码分析代理",
    SynthesisAgent: "报告合成代理",
    ReviewAgent: "审阅代理"
  };

  return labels[agent] ?? agent;
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "待执行",
    running: "执行中",
    completed: "已完成",
    failed: "失败",
    error: "错误",
    idle: "待启动"
  };

  return labels[status] ?? status;
}
