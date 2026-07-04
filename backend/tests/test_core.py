import tempfile
import unittest
from pathlib import Path

try:
    from backend.app.core.agent_execution import AgentExecutionOutput
    from backend.app.core.agents import ReviewAgent
    from backend.app.core.compiler import ResearchCompiler
    from backend.app.core.dag import DagEngine
    from backend.app.core.execution import create_execution_context
    from backend.app.core.models import DagNode, Report, ReviewResult
    from backend.app.core.provider_router import ProviderRouter
    from backend.app.core.runtime import GenesisRuntime
    from backend.app.core.skills import create_default_skill_registry
    from backend.app.core.tools import create_default_tool_registry
except ModuleNotFoundError:  # pragma: no cover - supports running from backend/
    from app.core.agent_execution import AgentExecutionOutput
    from app.core.agents import ReviewAgent
    from app.core.compiler import ResearchCompiler
    from app.core.dag import DagEngine
    from app.core.execution import create_execution_context
    from app.core.models import DagNode, Report, ReviewResult
    from app.core.provider_router import ProviderRouter
    from app.core.runtime import GenesisRuntime
    from app.core.skills import create_default_skill_registry
    from app.core.tools import create_default_tool_registry


class BadJsonProvider:
    name = "custom"
    config = {"model": "test", "max_refinement_rounds": 1}

    def chat(self, input_data):
        return {"content": "not json"}


class ConfiguredMockProvider:
    name = "mock"
    config = {"max_refinement_rounds": 1}

    def chat(self, input_data):
        return {"content": ""}


class CompilerTests(unittest.TestCase):
    def test_mock_planner_outputs_research_task_with_capabilities(self):
        task = ResearchCompiler().compile("quantum memory stability in LLMs")
        self.assertIn("artificial intelligence", task.domains)
        self.assertGreaterEqual(len(task.subQuestions), 3)
        self.assertIn("literature_search", task.methods)
        self.assertIn("research_literature", task.requiredCapabilities)
        self.assertTrue(task.expectedArtifacts)

    def test_invalid_provider_json_falls_back_to_deterministic_planner(self):
        compiler = ResearchCompiler(ProviderRouter(BadJsonProvider()))
        task = compiler.compile("why does quantum entanglement not violate relativity")
        self.assertIn("physics", task.domains)
        self.assertEqual("why does quantum entanglement not violate relativity", task.idea)

    def test_rejects_empty_question(self):
        with self.assertRaises(ValueError):
            ResearchCompiler().compile("   ")


class SkillAndToolTests(unittest.TestCase):
    def test_skill_trigger_selects_research_paper_and_experiment_skills(self):
        registry = create_default_skill_registry()
        selected = registry.select("design an experiment to analyze a paper with citations", ["python_analysis"])
        ids = {skill.id for skill in selected}
        self.assertIn("research_literature", ids)
        self.assertIn("paper_analysis", ids)
        self.assertIn("experiment_design", ids)

    def test_mcp_tool_failure_is_structured(self):
        with tempfile.TemporaryDirectory(prefix="genesis-mcp-test-") as tmpdir:
            registry = create_default_tool_registry(Path(tmpdir) / "mcp.json")
            result = registry.call("mcp.call", {"server": "missing", "toolName": "search", "input": {}})
        self.assertFalse(result.ok)
        self.assertIn("MCP server not configured", result.error)


class DagTests(unittest.TestCase):
    def test_topological_sort_orders_dependencies(self):
        nodes = [
            DagNode("b", "x", "pending", ["a"], "Agent"),
            DagNode("a", "x", "pending", [], "Agent"),
        ]
        ordered = DagEngine().topological_sort(nodes)
        self.assertEqual(["a", "b"], [node.id for node in ordered])

    def test_cycle_is_rejected(self):
        nodes = [
            DagNode("a", "x", "pending", ["b"], "Agent"),
            DagNode("b", "x", "pending", ["a"], "Agent"),
        ]
        with self.assertRaises(ValueError):
            DagEngine().topological_sort(nodes)


class RuntimeTests(unittest.TestCase):
    def test_end_to_end_mrna_report_has_evidence(self):
        runtime = GenesisRuntime()
        run = runtime.create_run("如何设计一种新的mRNA疫苗？")
        self.assertEqual("completed", run.status)
        self.assertIsNotNone(run.report)
        self.assertTrue(runtime.list_evidence(run.id))
        for result in run.report.results:
            self.assertTrue(result["supportingEvidence"])
        markdown = runtime.markdown_report(run.id)
        self.assertIn("# Genesis Lab 研究报告", markdown)
        self.assertIn("## Findings", markdown)
        self.assertIn("## Evidence Map", markdown)
        self.assertIn("## Artifacts", markdown)

    def test_acceptance_question_quantum(self):
        runtime = GenesisRuntime()
        run = runtime.create_run("为什么量子纠缠不违反相对论？")
        self.assertEqual("completed", run.status)
        self.assertIn("passed", run.report.review["status"])

    def test_execute_records_node_trace(self):
        runtime = GenesisRuntime()
        task = runtime.compile("why does quantum entanglement not violate relativity")
        context = create_execution_context("agent")
        run = runtime.execute(task, context)
        self.assertEqual(context.runId, run.id)
        self.assertTrue(run.trace)
        self.assertEqual({"success"}, {item.status for item in run.trace})
        persisted = context.store.getRun(run.id)
        self.assertTrue(persisted["run"]["trace"])
        first_trace = persisted["run"]["trace"][0]
        self.assertIn("skillIds", first_trace["input"])
        self.assertIn("toolNames", first_trace["input"])

    def test_agent_mode_entry_uses_execute_trace(self):
        runtime = GenesisRuntime()
        run = runtime.agent_run("why does quantum entanglement not violate relativity")
        self.assertEqual("completed", run.status)
        self.assertTrue(run.trace)
        self.assertEqual({"success"}, {item.status for item in run.trace})
        self.assertTrue(runtime.replay_trace(run.id))

    def test_critic_revision_actions_are_limited_by_max_refinement_rounds(self):
        runtime = GenesisRuntime(provider=ConfiguredMockProvider())
        original = runtime.agent_executor

        class MissingEvidenceExecutor:
            def __init__(self):
                self.synthesis_count = 0

            def run_node(self, *args, **kwargs):
                return original.run_node(*args, **kwargs)

            def synthesize(self, run_id, task, results, evidence_store):
                self.synthesis_count += 1
                report = Report(
                    summary="draft",
                    hypotheses=[],
                    methods=[],
                    results=[{"id": "claim-1", "claim": "unsupported", "supportingEvidence": []}],
                    evidenceMap={"claim-1": []},
                    references=[],
                    review=ReviewResult(status="pending"),
                )
                return AgentExecutionOutput(summary="draft", output={"resultCount": 1}, report=report)

            def review(self, report):
                return original.review(report)

        missing = MissingEvidenceExecutor()
        runtime.agent_executor = missing
        run = runtime.create_run("unsupported test idea")
        self.assertEqual("completed", run.status)
        self.assertEqual(2, missing.synthesis_count)
        self.assertEqual("needs_revision", run.report.review["status"])
        self.assertTrue(any(item.sourceType == "critic_revision" for item in runtime.list_evidence(run.id)))

    def test_review_agent_flags_missing_evidence(self):
        report = Report(
            summary="draft",
            hypotheses=[],
            methods=[],
            results=[{"id": "claim-1", "claim": "unsupported", "supportingEvidence": []}],
            evidenceMap={"claim-1": []},
            references=[],
            review=ReviewResult(status="pending"),
        )
        reviewed = ReviewAgent().run(report)
        self.assertEqual("needs_revision", reviewed.review.status)
        self.assertTrue(reviewed.review.revisionActions)


if __name__ == "__main__":
    unittest.main()
