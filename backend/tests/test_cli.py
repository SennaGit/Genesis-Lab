import io
import os
import re
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

from backend.cli.main import main


class CliTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory(prefix="genesis-cli-test-")
        self.previous_home = os.environ.get("GENESIS_HOME")
        os.environ["GENESIS_HOME"] = str(Path(self.tempdir.name) / ".genesis")

    def tearDown(self):
        if self.previous_home is None:
            os.environ.pop("GENESIS_HOME", None)
        else:
            os.environ["GENESIS_HOME"] = self.previous_home
        self.tempdir.cleanup()

    def invoke(self, args):
        stdout = io.StringIO()
        stderr = io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            code = main(args)
        return code, stdout.getvalue(), stderr.getvalue()

    def test_compile_outputs_research_task_and_dag(self):
        code, stdout, stderr = self.invoke(["compile", "why does quantum entanglement not violate relativity"])

        self.assertEqual(0, code, stderr)
        self.assertIn("ResearchTask", stdout)
        self.assertIn("DAG", stdout)
        self.assertIn("physics", stdout)

    def test_run_persists_status_and_report(self):
        code, stdout, stderr = self.invoke(["run", "why does quantum entanglement not violate relativity"])

        self.assertEqual(0, code, stderr)
        self.assertIn("ResearchTask", stdout)
        self.assertIn("DAG", stdout)
        self.assertIn("Execution", stdout)
        self.assertIn("Evidence", stdout)
        self.assertIn("Markdown Report", stdout)

        match = re.search(r"runId: ([0-9a-f-]+)", stdout)
        self.assertIsNotNone(match)
        run_id = match.group(1)

        snapshot_path = Path(os.environ["GENESIS_HOME"]) / "runs" / ("%s.json" % run_id)
        markdown_path = Path(os.environ["GENESIS_HOME"]) / "runs" / ("%s.md" % run_id)
        self.assertTrue(snapshot_path.exists())
        self.assertTrue(markdown_path.exists())

        code, status_stdout, status_stderr = self.invoke(["status", run_id])
        self.assertEqual(0, code, status_stderr)
        self.assertIn("status: completed", status_stdout)
        self.assertIn("evidenceCount:", status_stdout)

        code, report_stdout, report_stderr = self.invoke(["report", run_id])
        self.assertEqual(0, code, report_stderr)
        self.assertIn("# Genesis Lab", report_stdout)


if __name__ == "__main__":
    unittest.main()

