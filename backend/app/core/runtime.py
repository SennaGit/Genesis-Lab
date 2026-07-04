from typing import List, Optional

from .agent_execution import AgentExecutor
from .agents import CodeAgent, LiteratureAgent, ReviewAgent, SynthesisAgent
from .compiler import ResearchCompiler
from .dag import DagEngine
from .evidence import EvidenceStore
from .execution import ExecutionContext, create_execution_context
from .models import AgentResult, DagNode, EvidenceItem, NodeExecutionTrace, ResearchTask, RunRecord, utc_now_iso
from .provider_router import ProviderRouter
from .skills import SkillRegistry, create_default_skill_registry
from .storage import RunStore
from .store.run_store import MemoryPersistenceStore, PersistenceStore
from .tools import ToolRegistry, create_default_tool_registry


class GenesisRuntime:
    def __init__(
        self,
        store: Optional[PersistenceStore] = None,
        provider=None,
        skills: Optional[SkillRegistry] = None,
        tools: Optional[ToolRegistry] = None,
    ) -> None:
        self.provider = provider
        self.provider_router = ProviderRouter(provider)
        self.skills = skills or create_default_skill_registry()
        self.tool_registry = tools or create_default_tool_registry()
        self.compiler = ResearchCompiler(self.provider_router, self.skills)
        self.dag_engine = DagEngine()
        self.evidence_store = EvidenceStore()
        self.run_store = RunStore()
        self.persistence_store = store or MemoryPersistenceStore()
        self._stores_by_run = {}
        self.literature_agent = LiteratureAgent(self.tool_registry)
        self.code_agent = CodeAgent(self.tool_registry)
        self.synthesis_agent = SynthesisAgent()
        self.review_agent = ReviewAgent()
        self.agent_executor = AgentExecutor(
            self.literature_agent,
            self.code_agent,
            self.synthesis_agent,
            self.review_agent,
        )

    def compile(self, question: str) -> ResearchTask:
        return self.compiler.compile(question)

    def create_run(self, question: str, context: Optional[ExecutionContext] = None) -> RunRecord:
        task = self.compile(question)
        execution_context = context or create_execution_context(
            "api",
            store=self.persistence_store,
            provider=self.provider,
        )
        return self.execute(task, execution_context)

    def agent_run(self, question: str, context: Optional[ExecutionContext] = None) -> RunRecord:
        task = self.compile(question)
        execution_context = context or create_execution_context(
            "agent",
            store=self.persistence_store,
            provider=self.provider,
        )
        return self.execute(task, execution_context)

    def execute(self, task: ResearchTask, context: ExecutionContext, dag: Optional[List[DagNode]] = None) -> RunRecord:
        nodes = dag or self.dag_engine.build(task)
        run = self.run_store.create(task.question, task, nodes, run_id=context.runId)
        self._stores_by_run[run.id] = context.store
        return self._execute_existing_run(run, context)

    def execute_run(self, run_id: str) -> RunRecord:
        run = self.run_store.require(run_id)
        context = create_execution_context(
            "api",
            run_id=run.id,
            store=self.persistence_store,
            provider=self.provider,
        )
        return self._execute_existing_run(run, context)

    def markdown_report(self, run_id: str) -> str:
        run = self.run_store.require(run_id)
        if not run.report:
            raise ValueError("报告尚未生成")
        return self.synthesis_agent.to_markdown(run.task, run.report)

    def list_evidence(self, run_id: str):
        return self.evidence_store.list(run_id)

    def replay_trace(self, run_id: str):
        store = self._stores_by_run.get(run_id, self.persistence_store)
        snapshot = store.getRun(run_id)
        run = snapshot.get("run", {})
        return run.get("trace", [])

    def _execute_existing_run(self, run: RunRecord, context: ExecutionContext) -> RunRecord:
        run.trace = [self._new_trace(node) for node in run.dag]
        run.status = "running"
        run.logs.append("Research DAG execution started.")
        self._log(context, "Research DAG execution started.")
        self._persist(context, run)
        completed_results: List[AgentResult] = []

        try:
            for node in self.dag_engine.topological_sort(run.dag):
                if node.type in ("report_synthesis", "self_review"):
                    continue
                self._execute_agent_node(run, node, completed_results, context)

            synthesis_node = self._node(run, "synthesis-1")
            critic_node = self._node(run, "critic-1")
            max_rounds = int(self.provider_router.setting("max_refinement_rounds", 1) or 0)

            for round_index in range(max_rounds + 1):
                self._execute_synthesis_node(run, synthesis_node, completed_results, context)
                self._execute_review_node(run, critic_node, context)
                review = self._review_dict(run)
                if review.get("status") != "needs_revision":
                    break
                if round_index >= max_rounds:
                    run.logs.append("Critic requested revision but max_refinement_rounds was reached.")
                    break
                revision = self._apply_revision_actions(run, review.get("revisionActions") or [], context, round_index + 1)
                completed_results.append(revision)

            run.status = "completed"
            self.run_store.touch(run)
            self._persist(context, run)
            return run
        except Exception:
            run.status = "failed"
            self.run_store.touch(run)
            self._persist(context, run)
            raise

    def _execute_agent_node(
        self,
        run: RunRecord,
        node: DagNode,
        completed_results: List[AgentResult],
        context: Optional[ExecutionContext] = None,
    ) -> AgentResult:
        trace = self._start_node(run, node, context)
        node.attempts += 1
        try:
            output = self.agent_executor.run_node(run.id, run.task, node, self.evidence_store)
            completed_results.append(output.agentResult)
            node.outputs.update(output.output)
            run.artifacts.extend(output.artifacts)
            message = "%s completed: %s" % (node.id, output.summary)
            run.logs.append(message)
            self._finish_node(run, node, trace, output.output, [message], context)
            return output.agentResult
        except Exception as exc:
            message = "%s failed: %s" % (node.id, exc)
            run.logs.append(message)
            self._fail_node(run, node, trace, exc, [message], context)
            raise

    def _execute_synthesis_node(
        self,
        run: RunRecord,
        node: DagNode,
        completed_results: List[AgentResult],
        context: ExecutionContext,
    ) -> None:
        trace = self._start_node(run, node, context)
        try:
            output = self.agent_executor.synthesize(run.id, run.task, completed_results, self.evidence_store)
            run.report = output.report
            node.outputs = output.output
            message = output.summary
            run.logs.append(message)
            self._finish_node(run, node, trace, node.outputs, [message], context)
        except Exception as exc:
            message = "%s failed: %s" % (node.id, exc)
            run.logs.append(message)
            self._fail_node(run, node, trace, exc, [message], context)
            raise

    def _execute_review_node(self, run: RunRecord, node: DagNode, context: ExecutionContext) -> None:
        trace = self._start_node(run, node, context)
        try:
            if not run.report:
                raise ValueError("Report synthesis must complete before critic review.")
            output = self.agent_executor.review(run.report)
            run.report = output.report
            node.outputs = output.output
            message = output.summary
            run.logs.append(message)
            self._finish_node(run, node, trace, node.outputs, [message], context)
        except Exception as exc:
            message = "%s failed: %s" % (node.id, exc)
            run.logs.append(message)
            self._fail_node(run, node, trace, exc, [message], context)
            raise

    def _execute_node(self, run: RunRecord, node: DagNode, completed_results: List[AgentResult]) -> None:
        self._execute_agent_node(run, node, completed_results, None)

    def _apply_revision_actions(
        self,
        run: RunRecord,
        actions: List[dict],
        context: ExecutionContext,
        round_number: int,
    ) -> AgentResult:
        evidence = EvidenceItem(
            id="critic-refinement-%d" % round_number,
            sourceType="critic_revision",
            sourceId="critic:%d" % round_number,
            snippet="Critic requested revision actions: %s" % actions,
            metadata={"revisionRound": round_number, "actions": actions},
            createdBy="ReviewAgent",
            confidence=0.5,
            licenseNote="Generated refinement marker.",
        )
        self.evidence_store.add(run.id, evidence)
        message = "Applied critic refinement round %d." % round_number
        run.logs.append(message)
        self._log(context, message)
        self._persist(context, run)
        return AgentResult(taskId="critic-refinement-%d" % round_number, summary=message, evidenceIds=[evidence.id])

    def _review_dict(self, run: RunRecord) -> dict:
        if not run.report:
            return {}
        review = run.report.review
        return review if isinstance(review, dict) else review.to_dict()

    def _agent_result_from_node(self, node: DagNode) -> AgentResult:
        evidence_ids = node.outputs.get("evidenceIds") or []
        artifacts = node.outputs.get("artifacts") or []
        errors = node.outputs.get("errors") or []
        return AgentResult(
            taskId=node.id,
            summary=node.outputs.get("summary", ""),
            evidenceIds=evidence_ids,
            artifacts=artifacts,
            errors=errors,
        )

    def _new_trace(self, node: DagNode) -> NodeExecutionTrace:
        return NodeExecutionTrace(
            nodeId=node.id,
            status="pending",
            input={
                "type": node.type,
                "requires": list(node.requires),
                "agent": node.agent,
                "agentRole": node.agentRole,
                "skillIds": list(node.skillIds),
                "toolNames": list(node.toolNames),
                "input": dict(node.input),
            },
            output={},
            logs=[],
        )

    def _start_node(self, run: RunRecord, node: DagNode, context: Optional[ExecutionContext]) -> NodeExecutionTrace:
        trace = self._trace(run, node.id)
        if trace is None:
            trace = self._new_trace(node)
            run.trace.append(trace)
        node.status = "running"
        trace.status = "running"
        trace.startedAt = utc_now_iso()
        trace.logs.append("Node %s started." % node.id)
        self._emit(context, "node_started", node, trace)
        if context:
            self._persist(context, run)
        return trace

    def _finish_node(
        self,
        run: RunRecord,
        node: DagNode,
        trace: NodeExecutionTrace,
        output,
        logs: List[str],
        context: Optional[ExecutionContext],
    ) -> None:
        node.status = "completed"
        trace.status = "success"
        trace.output = output or {}
        trace.logs.extend(logs)
        trace.completedAt = utc_now_iso()
        self._emit(context, "node_succeeded", node, trace)
        if context:
            self._persist(context, run)

    def _fail_node(
        self,
        run: RunRecord,
        node: DagNode,
        trace: NodeExecutionTrace,
        exc: Exception,
        logs: List[str],
        context: Optional[ExecutionContext],
    ) -> None:
        node.status = "failed"
        node.error = str(exc)
        trace.status = "failed"
        trace.error = str(exc)
        trace.logs.extend(logs)
        trace.completedAt = utc_now_iso()
        self._emit(context, "node_failed", node, trace)
        if context:
            self._persist(context, run)

    def _persist(self, context: ExecutionContext, run: RunRecord) -> None:
        evidence = self.list_evidence(run.id)
        markdown = ""
        if run.report:
            markdown = self.synthesis_agent.to_markdown(run.task, run.report)
        context.store.saveEvidence(run.id, evidence)
        context.store.save_run_snapshot(run, evidence, markdown)

    def _log(self, context: Optional[ExecutionContext], message: str) -> None:
        if context and hasattr(context.logger, "log"):
            context.logger.log(message)

    def _emit(self, context: Optional[ExecutionContext], event_name: str, node: DagNode, trace: NodeExecutionTrace) -> None:
        if not context:
            return
        handler = getattr(context.logger, event_name, None)
        if handler:
            handler(node, trace)

    def _trace(self, run: RunRecord, node_id: str) -> Optional[NodeExecutionTrace]:
        for trace in run.trace:
            if trace.nodeId == node_id:
                return trace
        return None

    def _node(self, run: RunRecord, node_id: str) -> DagNode:
        for node in run.dag:
            if node.id == node_id:
                return node
        raise KeyError(node_id)
