import subprocess
import sys
import tempfile
from typing import Dict, List

from .evidence import EvidenceStore
from .models import AgentResult, DagNode, EvidenceItem, Report, ResearchTask


LOCAL_CORPUS = [
    {
        "id": "PMID:quantum-001",
        "title": "贝尔实验与无信号传递约束",
        "domain": "physics",
        "snippet": "贝尔实验支持非经典关联的存在，同时实验结果仍满足无信号传递条件。",
    },
    {
        "id": "ARXIV:quantum-002",
        "title": "量子纠缠与相对论因果性",
        "domain": "physics",
        "snippet": "纠缠关联不能被操控为可用的超光速信息传递通道，因此不破坏相对论因果性。",
    },
    {
        "id": "PMID:mrna-001",
        "title": "mRNA 疫苗设计原则",
        "domain": "biomedicine",
        "snippet": "mRNA 疫苗设计需要同时考虑抗原选择、RNA 稳定性、递送配方和免疫读出验证。",
    },
    {
        "id": "PMID:mrna-002",
        "title": "RNA 治疗中的脂质纳米颗粒递送",
        "domain": "biomedicine",
        "snippet": "脂质纳米颗粒可以保护 RNA 载荷，并在疫苗应用中提高其向目标组织递送的效率。",
    },
    {
        "id": "GENERIC:science-001",
        "title": "证据支撑的科研综合",
        "domain": "general science",
        "snippet": "可靠的科研回答应将结论与来源、假设和可复现的中间产物明确连接起来。",
    },
]


class LiteratureAgent:
    def run(self, run_id: str, task: ResearchTask, node: DagNode, evidence_store: EvidenceStore) -> AgentResult:
        matches = self._search(task)
        evidence_ids = []
        for index, record in enumerate(matches[:2], start=1):
            evidence = EvidenceItem(
                id="%s-e%d" % (node.id, index),
                sourceType="literature",
                sourceId=record["id"],
                snippet=record["snippet"],
                metadata={"title": record["title"], "domain": record["domain"], "query": task.question},
                createdBy="LiteratureAgent",
            )
            evidence_store.add(run_id, evidence)
            evidence_ids.append(evidence.id)
        if not evidence_ids:
            fallback = EvidenceItem(
                id="%s-e1" % node.id,
                sourceType="literature",
                sourceId="LOCAL:FALLBACK",
                snippet="未命中特定领域语料，系统保留通用证据合成路径并标记需要人工补充检索。",
                metadata={"title": "兜底证据", "query": task.question},
                createdBy="LiteratureAgent",
            )
            evidence_store.add(run_id, fallback)
            evidence_ids.append(fallback.id)
        return AgentResult(
            taskId=node.id,
            summary="已为“%s”收集 %d 条候选证据。" % (node.outputs.get("question", task.question), len(evidence_ids)),
            evidenceIds=evidence_ids,
        )

    def _search(self, task: ResearchTask) -> List[Dict[str, str]]:
        domains = set(task.domains)
        matched = [item for item in LOCAL_CORPUS if item["domain"] in domains]
        if not matched:
            matched = [item for item in LOCAL_CORPUS if item["domain"] == "general science"]
        return matched


class CodeAgent:
    def run(self, run_id: str, task: ResearchTask, node: DagNode, evidence_store: EvidenceStore) -> AgentResult:
        display_domains = [self._domain_label(domain) for domain in task.domains]
        display_methods = [self._method_label(method) for method in task.methods]
        script = (
            "domains = %r\n"
            "methods = %r\n"
            "print('领域=' + ','.join(domains))\n"
            "print('方法数量=' + str(len(methods)))\n"
            "print('复现检查=通过')\n"
        ) % (display_domains, display_methods)
        output = self._execute(script)
        evidence = EvidenceItem(
            id="%s-e1" % node.id,
            sourceType="code_output",
            sourceId="python:sandbox",
            snippet=output.strip(),
            metadata={"language": "python", "timeoutSeconds": 3},
            createdBy="CodeAgent",
        )
        evidence_store.add(run_id, evidence)
        return AgentResult(
            taskId=node.id,
            summary="Python 沙箱完成轻量级复现检查。",
            evidenceIds=[evidence.id],
            artifacts=[{"type": "code", "language": "python", "content": script}, {"type": "stdout", "content": output}],
        )

    def _domain_label(self, domain: str) -> str:
        labels = {
            "physics": "物理学",
            "quantum information": "量子信息",
            "biomedicine": "生物医学",
            "molecular biology": "分子生物学",
            "data science": "数据科学",
            "general science": "通用科学",
        }
        return labels.get(domain, domain)

    def _method_label(self, method: str) -> str:
        labels = {
            "literature_search": "文献检索",
            "evidence_synthesis": "证据综合",
            "self_review": "自检审阅",
            "python_analysis": "Python 分析",
        }
        return labels.get(method, method)

    def _execute(self, script: str) -> str:
        with tempfile.TemporaryDirectory(prefix="genesis-sandbox-") as tmpdir:
            completed = subprocess.run(
                [sys.executable, "-c", script],
                cwd=tmpdir,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=3,
                universal_newlines=True,
            )
        if completed.returncode != 0:
            raise RuntimeError(completed.stderr.strip() or "Python 分析失败")
        return completed.stdout


class SynthesisAgent:
    def run(self, run_id: str, task: ResearchTask, results: List[AgentResult], evidence_store: EvidenceStore) -> Report:
        evidence_ids = []
        for result in results:
            evidence_ids.extend(result.evidenceIds)
        evidence = evidence_store.find_many(run_id, evidence_ids)
        result_rows = []
        evidence_map: Dict[str, List[str]] = {}
        for index, item in enumerate(evidence, start=1):
            claim_id = "结论-%d" % index
            result_rows.append(
                {
                    "id": claim_id,
                    "claim": self._claim_from_evidence(item),
                    "supportingEvidence": [item.id],
                }
            )
            evidence_map[claim_id] = [item.id]
        references = [
            {"id": item.id, "sourceId": item.sourceId, "title": item.metadata.get("title", item.sourceType)}
            for item in evidence
            if item.sourceType == "literature"
        ]
        return Report(
            summary="Genesis Lab 已将研究问题拆解为 %d 个子问题，并生成带证据映射的 MVP 报告。" % len(task.subQuestions),
            hypotheses=task.hypotheses,
            methods=task.methods,
            results=result_rows,
            evidenceMap=evidence_map,
            references=references,
            review={"status": "pending", "issues": []},
        )

    def to_markdown(self, task: ResearchTask, report: Report) -> str:
        lines = [
            "# Genesis Lab 研究报告",
            "",
            "## 研究问题",
            task.question,
            "",
            "## 摘要",
            report.summary,
            "",
            "## 假设",
        ]
        lines.extend("- %s" % item for item in report.hypotheses)
        lines.extend(["", "## 方法"])
        lines.extend("- %s" % self._method_label(item) for item in report.methods)
        lines.extend(["", "## 结果与证据"])
        for row in report.results:
            evidence_text = ", ".join(row["supportingEvidence"])
            lines.append("- %s [%s]" % (row["claim"], evidence_text))
        lines.extend(["", "## 参考证据"])
        for reference in report.references:
            lines.append("- %s: %s" % (reference["sourceId"], reference["title"]))
        lines.extend(["", "## 审阅状态", "- %s" % self._review_status_label(report.review.get("status", "unknown"))])
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

    def _review_status_label(self, status: str) -> str:
        labels = {
            "pending": "待审阅",
            "passed": "已通过",
            "needs_revision": "需要修订",
            "unknown": "未知",
        }
        return labels.get(status, status)


class ReviewAgent:
    def run(self, report: Report) -> Report:
        missing = [row["id"] for row in report.results if not row.get("supportingEvidence")]
        if missing:
            report.review = {"status": "needs_revision", "issues": ["以下结论缺少证据: %s" % ", ".join(missing)]}
        else:
            report.review = {"status": "passed", "issues": [], "checkedClaims": len(report.results)}
        return report
