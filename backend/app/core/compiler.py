import re
from typing import List

from .models import ResearchTask, SubQuestion


class ResearchCompiler:
    """Heuristic MVP compiler for turning a research question into a task graph seed."""

    def compile(self, question: str) -> ResearchTask:
        cleaned = self._normalize_question(question)
        domains = self._infer_domains(cleaned)
        sub_questions = self._build_sub_questions(cleaned, domains)
        hypotheses = self._build_hypotheses(cleaned, domains)
        methods = self._infer_methods(cleaned, domains)
        return ResearchTask(
            question=cleaned,
            domains=domains,
            subQuestions=sub_questions,
            hypotheses=hypotheses,
            methods=methods,
        )

    def _normalize_question(self, question: str) -> str:
        cleaned = re.sub(r"\s+", " ", question or "").strip()
        if not cleaned:
            raise ValueError("研究问题不能为空")
        return cleaned

    def _infer_domains(self, question: str) -> List[str]:
        q = question.lower()
        domains = []
        if any(token in q for token in ["mrna", "疫苗", "crispr", "gene", "基因", "rna", "蛋白"]):
            domains.extend(["biomedicine", "molecular biology"])
        if any(token in q for token in ["量子", "quantum", "纠缠", "relativity", "相对论"]):
            domains.extend(["physics", "quantum information"])
        if any(token in q for token in ["data", "数据", "csv", "统计", "analysis", "分析"]):
            domains.append("data science")
        if not domains:
            domains.append("general science")
        return list(dict.fromkeys(domains))

    def _build_sub_questions(self, question: str, domains: List[str]) -> List[SubQuestion]:
        if "physics" in domains:
            return [
                SubQuestion(1, "澄清问题中的核心物理概念和边界条件。"),
                SubQuestion(2, "检索支持或反驳该问题的关键理论与实验依据。", [1]),
                SubQuestion(3, "解释证据如何共同支撑最终结论。", [1, 2]),
            ]
        if "biomedicine" in domains:
            return [
                SubQuestion(1, "识别研究目标、候选机制和可干预变量。"),
                SubQuestion(2, "检索相关文献证据和已有实验流程。", [1]),
                SubQuestion(3, "形成可复现的实验或分析计划。", [1, 2]),
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
        return ["该问题可以通过文献证据、结构化推理和必要计算形成可验证答案。"]

    def _infer_methods(self, question: str, domains: List[str]) -> List[str]:
        methods = ["literature_search", "evidence_synthesis", "self_review"]
        if "data science" in domains or any(token in question.lower() for token in ["计算", "simulate", "模型", "分析"]):
            methods.insert(1, "python_analysis")
        elif "physics" in domains or "biomedicine" in domains:
            methods.insert(1, "python_analysis")
        return methods
