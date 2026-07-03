from typing import List

from .agents import CodeAgent, LiteratureAgent, ReviewAgent, SynthesisAgent
from .compiler import ResearchCompiler
from .dag import DagEngine
from .evidence import EvidenceStore
from .models import AgentResult, DagNode, RunRecord
from .storage import RunStore


class GenesisRuntime:
    def __init__(self) -> None:
        self.compiler = ResearchCompiler()
        self.dag_engine = DagEngine()
        self.evidence_store = EvidenceStore()
        self.run_store = RunStore()
        self.literature_agent = LiteratureAgent()
        self.code_agent = CodeAgent()
        self.synthesis_agent = SynthesisAgent()
        self.review_agent = ReviewAgent()

    def compile(self, question: str):
        return self.compiler.compile(question)

    def create_run(self, question: str) -> RunRecord:
        task = self.compile(question)
        dag = self.dag_engine.build(task)
        run = self.run_store.create(question, task, dag)
        self.execute_run(run.id)
        return run

    def execute_run(self, run_id: str) -> RunRecord:
        run = self.run_store.require(run_id)
        run.status = "running"
        run.logs.append("DAG 执行开始。")
        completed_results: List[AgentResult] = []

        for node in self.dag_engine.topological_sort(run.dag):
            if node.type in ("report_synthesis", "self_review"):
                continue
            self._execute_node(run, node, completed_results)

        synthesis_node = self._node(run, "synthesis-1")
        synthesis_node.status = "running"
        report = self.synthesis_agent.run(run.id, run.task, completed_results, self.evidence_store)
        synthesis_node.status = "completed"
        synthesis_node.outputs = {"resultCount": len(report.results)}
        run.logs.append("报告合成完成。")

        review_node = self._node(run, "review-1")
        review_node.status = "running"
        run.report = self.review_agent.run(report)
        review_node.status = "completed"
        review_node.outputs = run.report.review
        run.logs.append("审阅代理完成校验。")
        run.status = "completed"
        self.run_store.touch(run)
        return run

    def markdown_report(self, run_id: str) -> str:
        run = self.run_store.require(run_id)
        if not run.report:
            raise ValueError("报告尚未生成")
        return self.synthesis_agent.to_markdown(run.task, run.report)

    def list_evidence(self, run_id: str):
        return self.evidence_store.list(run_id)

    def _execute_node(self, run: RunRecord, node: DagNode, completed_results: List[AgentResult]) -> None:
        node.status = "running"
        node.attempts += 1
        try:
            if node.agent == "LiteratureAgent":
                result = self.literature_agent.run(run.id, run.task, node, self.evidence_store)
            elif node.agent == "CodeAgent":
                result = self.code_agent.run(run.id, run.task, node, self.evidence_store)
            else:
                raise ValueError("不支持的代理：%s" % node.agent)
            completed_results.append(result)
            node.status = "completed"
            node.outputs.update(result.to_dict())
            run.artifacts.extend(result.artifacts)
            run.logs.append("%s 完成：%s" % (node.id, result.summary))
        except Exception as exc:
            node.status = "failed"
            node.error = str(exc)
            run.logs.append("%s 失败：%s" % (node.id, exc))
            raise

    def _node(self, run: RunRecord, node_id: str) -> DagNode:
        for node in run.dag:
            if node.id == node_id:
                return node
        raise KeyError(node_id)
