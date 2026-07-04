import json
import re
from typing import Any, Dict, List, Optional

from .models import ResearchTask, SubQuestion
from .provider_router import ProviderRouter
from .skills import SkillRegistry, create_default_skill_registry


class ResearchCompiler:
    """Turns a user research idea into a structured ResearchTask.

    Real providers are asked for JSON. Mock/offline and invalid provider output fall back to
    deterministic heuristics so the CLI remains usable without network access.
    """

    def __init__(self, provider_router: Optional[ProviderRouter] = None, skills: Optional[SkillRegistry] = None) -> None:
        self.provider_router = provider_router or ProviderRouter()
        self.skills = skills or create_default_skill_registry()

    def compile(self, question: str) -> ResearchTask:
        cleaned = self._normalize_question(question)
        if not self.provider_router.is_mock():
            planned = self._compile_with_provider(cleaned)
            if planned is not None:
                return planned
        return self._compile_fallback(cleaned)

    def _compile_with_provider(self, question: str) -> Optional[ResearchTask]:
        messages = [
            {
                "role": "system",
                "content": (
                    "You are Genesis Lab Planner. Return strict JSON only. "
                    "Fields: question, domains, subQuestions[{id,text,requires}], hypotheses, methods, "
                    "successCriteria, expectedArtifacts, constraints, language."
                ),
            },
            {"role": "user", "content": question},
        ]
        try:
            response = self.provider_router.chat("planner", messages)
            content = response.content if hasattr(response, "content") else response.get("content", "")
            data = json.loads(content)
            return self._task_from_dict(question, data)
        except Exception:
            return None

    def _task_from_dict(self, question: str, data: Dict[str, Any]) -> ResearchTask:
        sub_questions = [
            SubQuestion(
                int(item.get("id") or index),
                str(item.get("text") or item.get("question") or ""),
                [int(dep) for dep in item.get("requires", [])],
            )
            for index, item in enumerate(data.get("subQuestions") or data.get("sub_questions") or [], start=1)
        ]
        if not sub_questions:
            raise ValueError("Planner returned no subQuestions.")
        methods = [str(item) for item in data.get("methods") or data.get("method") or ["literature_search", "evidence_synthesis", "self_review"]]
        selected = self.skills.select(question, methods)
        capabilities = list(dict.fromkeys([skill.id for skill in selected] + [str(item) for item in data.get("requiredCapabilities", [])]))
        return ResearchTask(
            question=str(data.get("question") or question),
            idea=question,
            domains=[str(item) for item in data.get("domains", ["general science"])],
            subQuestions=sub_questions,
            hypotheses=[str(item) for item in data.get("hypotheses", [])],
            methods=methods,
            successCriteria=[str(item) for item in data.get("successCriteria", [])],
            expectedArtifacts=[str(item) for item in data.get("expectedArtifacts", ["research_report.md"])],
            constraints=[str(item) for item in data.get("constraints", [])],
            requiredCapabilities=capabilities,
            language=str(data.get("language") or "zh"),
        )

    def _compile_fallback(self, question: str) -> ResearchTask:
        domains = self._infer_domains(question)
        sub_questions = self._build_sub_questions(question, domains)
        hypotheses = self._build_hypotheses(question, domains)
        methods = self._infer_methods(question, domains)
        selected = self.skills.select(question, methods)
        return ResearchTask(
            question=question,
            idea=question,
            domains=domains,
            subQuestions=sub_questions,
            hypotheses=hypotheses,
            methods=methods,
            successCriteria=[
                "Every major claim is linked to evidence.",
                "The final answer separates findings, limitations, and next experiments.",
            ],
            expectedArtifacts=["research_report.md", "evidence_map.json"],
            constraints=["Use user-configured providers only.", "Do not store API keys in logs or artifacts."],
            requiredCapabilities=[skill.id for skill in selected],
            language="zh",
        )

    def _normalize_question(self, question: str) -> str:
        cleaned = re.sub(r"\s+", " ", question or "").strip()
        if not cleaned:
            raise ValueError("研究问题不能为空")
        return cleaned

    def _infer_domains(self, question: str) -> List[str]:
        q = question.lower()
        domains: List[str] = []
        if any(token in q for token in ["mrna", "vaccine", "crispr", "gene", "基因", "rna", "蛋白", "疫苗"]):
            domains.extend(["biomedicine", "molecular biology"])
        if any(token in q for token in ["quantum", "entanglement", "relativity", "量子", "纠缠", "相对论"]):
            domains.extend(["physics", "quantum information"])
        if any(token in q for token in ["llm", "language model", "memory", "agent", "模型", "记忆"]):
            domains.extend(["artificial intelligence", "data science"])
        if any(token in q for token in ["data", "csv", "statistics", "analysis", "数据", "统计", "分析"]):
            domains.append("data science")
        if not domains:
            domains.append("general science")
        return list(dict.fromkeys(domains))

    def _build_sub_questions(self, question: str, domains: List[str]) -> List[SubQuestion]:
        if "physics" in domains:
            return [
                SubQuestion(1, "澄清问题中的核心物理概念和边界条件。"),
                SubQuestion(2, "检索支持或反驳该问题的关键理论与实验依据。", [1]),
                SubQuestion(3, "解释证据如何共同支持最终结论。", [1, 2]),
            ]
        if "biomedicine" in domains:
            return [
                SubQuestion(1, "识别研究目标、候选机制和可干预变量。"),
                SubQuestion(2, "检索相关文献证据和已有实验流程。", [1]),
                SubQuestion(3, "形成可复现实验或分析计划。", [1, 2]),
            ]
        if "artificial intelligence" in domains:
            return [
                SubQuestion(1, "定义 idea 中的关键 AI 概念、对象和稳定性指标。"),
                SubQuestion(2, "整理已有研究证据、评估方法和潜在反例。", [1]),
                SubQuestion(3, "设计可执行的评估或实验路线。", [1, 2]),
            ]
        return [
            SubQuestion(1, "拆解研究问题中的关键概念。"),
            SubQuestion(2, "检索与问题相关的主要证据。", [1]),
            SubQuestion(3, "基于证据形成结构化研究结论。", [1, 2]),
        ]

    def _build_hypotheses(self, question: str, domains: List[str]) -> List[str]:
        if "physics" in domains:
            return ["量子关联不能用于超光速传递可控信息，因此不违反相对论因果性。"]
        if "biomedicine" in domains:
            return ["候选设计需要同时满足靶点合理性、递送可行性、安全性和可验证实验路径。"]
        if "artificial intelligence" in domains:
            return ["该 idea 可以通过可观测指标、对照任务和失效案例来检验稳定性。"]
        return ["该问题可以通过文献证据、结构化推理和必要计算形成可验证答案。"]

    def _infer_methods(self, question: str, domains: List[str]) -> List[str]:
        methods = ["literature_search", "evidence_synthesis", "self_review"]
        q = question.lower()
        if "data science" in domains or "artificial intelligence" in domains or any(token in q for token in ["simulate", "model", "analysis", "计算", "仿真", "分析"]):
            methods.insert(1, "python_analysis")
        elif "physics" in domains or "biomedicine" in domains:
            methods.insert(1, "python_analysis")
        return methods
