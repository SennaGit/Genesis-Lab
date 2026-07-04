from typing import Any, Dict, List

from backend.app.core.models import AgentResult, DagNode
from backend.app.core.runtime import GenesisRuntime

from .context import ExecutionContext


class CliRuntimeAdapter:
    def __init__(self, context: ExecutionContext, runtime: GenesisRuntime = None) -> None:
        self.context = context
        self.runtime = runtime or GenesisRuntime()

    def compile(self, question: str) -> Dict[str, Any]:
        task = self.runtime.compile(question)
        dag = self.runtime.dag_engine.build(task)
        return {"task": task, "dag": dag}

    def run(self, question: str) -> Dict[str, Any]:
        logger = self.context.logger

        logger.section("Config")
        logger.line("mode: %s" % self.context.mode)
        logger.line("provider: %s" % self.context.provider.name)

        logger.section("ResearchTask")
        task = self.runtime.compile(question)
        logger.json(task.to_dict())

        logger.section("DAG")
        dag = self.runtime.dag_engine.build(task)
        logger.dag(dag)

        run = self.runtime.run_store.create(question, task, dag)
        logger.line("runId: %s" % run.id)

        try:
            self._execute(run)
        except Exception:
            run.status = "failed"
            self.runtime.run_store.touch(run)
            evidence = self.runtime.list_evidence(run.id)
            markdown = ""
            self.context.persistence.save_run(run, evidence, markdown)
            raise

        evidence = self.runtime.list_evidence(run.id)
        markdown = self.runtime.markdown_report(run.id)
        snapshot = self.context.persistence.save_run(run, evidence, markdown)

        logger.section("Evidence")
        logger.evidence(evidence)

        logger.section("Markdown Report")
        logger.line("path: %s" % snapshot["markdownPath"])
        logger.line(markdown)

        return {"run": run, "evidence": evidence, "markdown": markdown, "snapshot": snapshot}

    def _execute(self, run: Any) -> None:
        logger = self.context.logger
        run.status = "running"
        run.logs.append("CLI DAG execution started.")
        completed_results: List[AgentResult] = []

        logger.section("Execution")
        for node in self.runtime.dag_engine.topological_sort(run.dag):
            if node.type in ("report_synthesis", "self_review"):
                continue
            logger.step_start(node)
            self.runtime._execute_node(run, node, completed_results)
            logger.step_end(node)

        synthesis_node = self._node(run.dag, "synthesis-1")
        logger.step_start(synthesis_node)
        synthesis_node.status = "running"
        report = self.runtime.synthesis_agent.run(
            run.id,
            run.task,
            completed_results,
            self.runtime.evidence_store,
        )
        synthesis_node.status = "completed"
        synthesis_node.outputs = {"resultCount": len(report.results)}
        run.logs.append("Report synthesis completed.")
        logger.step_end(synthesis_node)

        review_node = self._node(run.dag, "review-1")
        logger.step_start(review_node)
        review_node.status = "running"
        run.report = self.runtime.review_agent.run(report)
        review_node.status = "completed"
        review_node.outputs = run.report.review
        run.logs.append("Review step completed.")
        logger.step_end(review_node)

        run.status = "completed"
        self.runtime.run_store.touch(run)

    def _node(self, nodes: List[DagNode], node_id: str) -> DagNode:
        for node in nodes:
            if node.id == node_id:
                return node
        raise KeyError(node_id)

