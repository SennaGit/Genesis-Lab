import unittest

from app.core.compiler import ResearchCompiler
from app.core.dag import DagEngine
from app.core.models import DagNode
from app.core.runtime import GenesisRuntime


class CompilerTests(unittest.TestCase):
    def test_compiles_quantum_question(self):
        task = ResearchCompiler().compile("为什么量子纠缠不违反相对论？")
        self.assertIn("physics", task.domains)
        self.assertGreaterEqual(len(task.subQuestions), 3)
        self.assertIn("literature_search", task.methods)

    def test_rejects_empty_question(self):
        with self.assertRaises(ValueError):
            ResearchCompiler().compile("   ")


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
        self.assertIn("## 结果与证据", markdown)

    def test_acceptance_question_quantum(self):
        runtime = GenesisRuntime()
        run = runtime.create_run("为什么量子纠缠不违反相对论？")
        self.assertEqual("completed", run.status)
        self.assertIn("passed", run.report.review["status"])


if __name__ == "__main__":
    unittest.main()
