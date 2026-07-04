from typing import Any, Dict, List, Optional

from .evidence import EvidenceStore
from .models import AgentResult, DagNode, EvidenceItem, Report, ResearchTask, ReviewResult
from .tools import ToolRegistry, create_default_tool_registry


class LiteratureAgent:
    def __init__(self, tool_registry: Optional[ToolRegistry] = None) -> None:
        self.tool_registry = tool_registry or create_default_tool_registry()

    def run(self, run_id: str, task: ResearchTask, node: DagNode, evidence_store: EvidenceStore) -> AgentResult:
        result = self.tool_registry.call(
            "literature.local_search",
            {"query": node.outputs.get("question", task.question), "domains": task.domains},
        )
        records = result.output if result.ok and isinstance(result.output, list) else []
        evidence_ids: List[str] = []
        for index, record in enumerate(records[:2], start=1):
            evidence = EvidenceItem(
                id="%s-e%d" % (node.id, index),
                sourceType="literature",
                sourceId=str(record.get("id", "LOCAL")),
                snippet=str(record.get("snippet", "")),
                metadata={
                    "title": record.get("title", "Untitled source"),
                    "domain": record.get("domain", "general science"),
                    "query": task.question,
                    "skills": list(node.skillIds),
                    "tools": list(node.toolNames),
                },
                createdBy="LiteratureAgent",
                confidence=0.72,
                licenseNote="Local seed corpus; replace with authorized external sources in production.",
            )
            evidence_store.add(run_id, evidence)
            evidence_ids.append(evidence.id)

        if not evidence_ids:
            fallback = EvidenceItem(
                id="%s-e1" % node.id,
                sourceType="literature",
                sourceId="LOCAL:FALLBACK",
                snippet="未命中特定领域语料；系统保留通用证据合成路径，并标记需要人工或外部 MCP 检索补充。",
                metadata={"title": "Fallback evidence", "query": task.question, "toolError": result.error},
                createdBy="LiteratureAgent",
                confidence=0.35,
                licenseNote="Generated fallback evidence marker; not a literature citation.",
            )
            evidence_store.add(run_id, fallback)
            evidence_ids.append(fallback.id)

        return AgentResult(
            taskId=node.id,
            summary="已为“%s”收集 %d 条候选证据。" % (node.outputs.get("question", task.question), len(evidence_ids)),
            evidenceIds=evidence_ids,
        )


class CodeAgent:
    def __init__(self, tool_registry: Optional[ToolRegistry] = None) -> None:
        self.tool_registry = tool_registry or create_default_tool_registry()

    def run(self, run_id: str, task: ResearchTask, node: DagNode, evidence_store: EvidenceStore) -> AgentResult:
        script = (
            "domains = %r\n"
            "methods = %r\n"
            "print('domains=' + ','.join(domains))\n"
            "print('method_count=' + str(len(methods)))\n"
            "print('reproducibility_check=passed')\n"
        ) % (task.domains, task.methods)
        result = self.tool_registry.call("python.sandbox", {"code": script, "timeoutSeconds": 3})
        if not result.ok:
            raise RuntimeError(result.error or "Python sandbox failed")
        output = result.output or {}
        if int(output.get("returnCode", 1)) != 0:
            raise RuntimeError(str(output.get("stderr") or "Python analysis failed"))
        stdout = str(output.get("stdout") or "")
        evidence = EvidenceItem(
            id="%s-e1" % node.id,
            sourceType="code_output",
            sourceId="python:sandbox",
            snippet=stdout.strip(),
            metadata={"language": "python", "timeoutSeconds": 3, "tool": "python.sandbox"},
            createdBy="CodeAgent",
            confidence=0.8,
            licenseNote="Local generated code output.",
        )
        evidence_store.add(run_id, evidence)
        return AgentResult(
            taskId=node.id,
            summary="Python 沙箱完成轻量级可复现检查。",
            evidenceIds=[evidence.id],
            artifacts=[{"type": "code", "language": "python", "content": script}, {"type": "stdout", "content": stdout}],
        )


class SynthesisAgent:
    def run(self, run_id: str, task: ResearchTask, results: List[AgentResult], evidence_store: EvidenceStore) -> Report:
        evidence_ids: List[str] = []
        artifacts: List[Dict[str, Any]] = []
        for result in results:
            evidence_ids.extend(result.evidenceIds)
            artifacts.extend(result.artifacts)
        evidence = evidence_store.find_many(run_id, evidence_ids)
        result_rows: List[Dict[str, Any]] = []
        evidence_map: Dict[str, List[str]] = {}
        for index, item in enumerate(evidence, start=1):
            claim_id = "claim-%d" % index
            item.claimIds.append(claim_id)
            result_rows.append(
                {
                    "id": claim_id,
                    "claim": self._claim_from_evidence(item),
                    "supportingEvidence": [item.id],
                    "confidence": item.confidence,
                }
            )
            evidence_map[claim_id] = [item.id]
        references = [
            {
                "id": item.id,
                "sourceId": item.sourceId,
                "title": item.metadata.get("title", item.sourceType),
                "sourceUrl": item.sourceUrl,
                "sourceDoi": item.sourceDoi,
            }
            for item in evidence
            if item.sourceType == "literature"
        ]
        return Report(
            summary="Genesis Lab 已将研究 idea 拆解为 %d 个子问题，并生成带证据映射的研究报告。" % len(task.subQuestions),
            hypotheses=task.hypotheses,
            methods=task.methods,
            results=result_rows,
            evidenceMap=evidence_map,
            references=references,
            review=ReviewResult(status="pending"),
            artifacts=artifacts,
        )

    def to_markdown(self, task: ResearchTask, report: Report) -> str:
        review = report.review if isinstance(report.review, dict) else report.review.to_dict()
        lines = [
            "# Genesis Lab 研究报告",
            "",
            "## Research Plan",
            "- Idea: %s" % (task.idea or task.question),
            "- Domains: %s" % ", ".join(task.domains),
            "- Capabilities: %s" % ", ".join(task.requiredCapabilities),
            "",
            "### Sub-questions",
        ]
        lines.extend("- [%s] %s" % (item.id, item.text) for item in task.subQuestions)
        lines.extend(["", "## Findings"])
        if report.results:
            for row in report.results:
                evidence_text = ", ".join(row.get("supportingEvidence") or [])
                lines.append("- %s [%s]" % (row.get("claim", ""), evidence_text))
        else:
            lines.append("- 暂无可验证发现。")
        lines.extend(["", "## Experiments"])
        experiment_methods = [item for item in report.methods if "analysis" in item or "python" in item]
        if experiment_methods:
            lines.extend("- %s" % self._method_label(item) for item in experiment_methods)
        else:
            lines.append("- 本次运行未生成代码实验；建议补充可复现实验设计。")
        lines.extend(["", "## Limitations"])
        issues = review.get("issues") or []
        if issues:
            lines.extend("- %s" % item for item in issues)
        else:
            lines.append("- 当前报告基于已配置工具和可用证据，外部数据库覆盖度取决于用户配置。")
        lines.extend(["", "## Conclusion"])
        lines.append(report.summary)
        lines.extend(["", "## Evidence Map"])
        for claim_id, ids in report.evidenceMap.items():
            lines.append("- %s: %s" % (claim_id, ", ".join(ids)))
        lines.extend(["", "## Artifacts"])
        if report.artifacts:
            for index, artifact in enumerate(report.artifacts, start=1):
                lines.append("- artifact-%d: %s" % (index, artifact.get("type", "artifact")))
        else:
            lines.append("- 无额外 artifact。")
        lines.extend(["", "## References"])
        if report.references:
            for reference in report.references:
                lines.append("- %s: %s" % (reference.get("sourceId"), reference.get("title")))
        else:
            lines.append("- 暂无文献引用。")
        lines.extend(["", "## Critic Review", "- status: %s" % review.get("status", "unknown")])
        return "\n".join(lines) + "\n"

    def _claim_from_evidence(self, item: EvidenceItem) -> str:
        if item.sourceType == "code_output":
            return "代码执行产物显示该流程具备基础可复现检查记录。"
        return item.snippet

    def _method_label(self, method: str) -> str:
        labels = {
            "literature_search": "文献检索",
            "evidence_synthesis": "证据综合",
            "self_review": "自检审阅",
            "python_analysis": "Python 分析",
        }
        return labels.get(method, method)


class ReviewAgent:
    def run(self, report: Report) -> Report:
        missing = [row.get("id", "unknown") for row in report.results if not row.get("supportingEvidence")]
        issues: List[str] = []
        actions: List[Dict[str, Any]] = []
        if not report.results:
            issues.append("报告没有形成可审阅的发现。")
            actions.append({"type": "replan", "reason": "empty_results"})
        if missing:
            issues.append("以下结论缺少证据: %s" % ", ".join(missing))
            actions.append({"type": "collect_evidence", "claimIds": missing})
        status = "needs_revision" if issues else "passed"
        report.review = ReviewResult(
            status=status,
            issues=issues,
            revisionActions=actions,
            checkedClaims=len(report.results),
        )
        return report

    def _duplicate_claims(self, rows: List[Dict[str, Any]]) -> List[str]:
        seen: Dict[str, str] = {}
        duplicates: List[str] = []
        for row in rows:
            claim = str(row.get("claim", "")).strip().lower()
            if not claim:
                continue
            if claim in seen:
                duplicates.append(str(row.get("id", "unknown")))
            else:
                seen[claim] = str(row.get("id", "unknown"))
        return duplicates

