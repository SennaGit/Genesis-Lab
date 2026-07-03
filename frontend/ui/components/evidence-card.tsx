import type { EvidenceItemContract } from "@/ui/contracts/workspace.contracts";

export function EvidenceCard({ item }: EvidenceItemContract) {
  return (
    <article className="evidence-item">
      <strong>{item.sourceId}</strong>
      <span>{sourceTypeLabel(item.sourceType)}</span>
      <p>{item.snippet}</p>
    </article>
  );
}

function sourceTypeLabel(sourceType: string): string {
  const labels: Record<string, string> = {
    literature: "文献证据",
    code_output: "代码输出",
    tool_output: "工具输出"
  };

  return labels[sourceType] ?? sourceType;
}
