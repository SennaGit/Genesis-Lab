import io
import json
import os
import re
import tempfile
import unittest
from contextlib import contextmanager, redirect_stderr, redirect_stdout
from pathlib import Path


@contextmanager
def redirect_stdin(stream):
    import sys

    previous = sys.stdin
    sys.stdin = stream
    try:
        yield
    finally:
        sys.stdin = previous

try:
    from backend.cli.main import main
except ModuleNotFoundError:  # pragma: no cover - supports running from backend/
    from cli.main import main


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

    def invoke(self, args, input_text=""):
        stdout = io.StringIO()
        stderr = io.StringIO()
        stdin = io.StringIO(input_text)
        with redirect_stdout(stdout), redirect_stderr(stderr), redirect_stdin(stdin):
            code = main(args)
        return code, stdout.getvalue(), stderr.getvalue()

    def test_init_creates_config_mcp_and_runs_dir(self):
        code, stdout, stderr = self.invoke(["init"])

        self.assertEqual(0, code, stderr)
        self.assertIn("Genesis Lab initialized", stdout)
        home = Path(os.environ["GENESIS_HOME"])
        self.assertTrue((home / "config.json").exists())
        self.assertTrue((home / "mcp.json").exists())
        self.assertTrue((home / "runs").exists())

    def test_config_show_redacts_api_key_and_unset(self):
        code, stdout, stderr = self.invoke(["config", "set", "api_key", "test-key"])
        self.assertEqual(0, code, stderr)
        self.assertIn("******", stdout)

        raw = json.loads((Path(os.environ["GENESIS_HOME"]) / "config.json").read_text(encoding="utf-8"))
        self.assertEqual("test-key", raw["apiKey"])

        code, stdout, stderr = self.invoke(["config", "show"])
        self.assertEqual(0, code, stderr)
        self.assertIn("******", stdout)
        self.assertNotIn("test-key", stdout)

        code, stdout, stderr = self.invoke(["config", "unset", "apiKey"])
        self.assertEqual(0, code, stderr)
        raw = json.loads((Path(os.environ["GENESIS_HOME"]) / "config.json").read_text(encoding="utf-8"))
        self.assertEqual("", raw["apiKey"])

    def test_compile_outputs_research_task_and_dag(self):
        code, stdout, stderr = self.invoke(["compile", "why does quantum entanglement not violate relativity"])

        self.assertEqual(0, code, stderr)
        self.assertIn("ResearchTask", stdout)
        self.assertIn("DAG", stdout)
        self.assertIn("physics", stdout)
        self.assertIn("requiredCapabilities", stdout)

    def test_run_persists_status_report_and_evidence_map(self):
        code, stdout, stderr = self.invoke(["run", "quantum memory stability in LLMs"])

        self.assertEqual(0, code, stderr)
        self.assertIn("ResearchTask", stdout)
        self.assertIn("DAG", stdout)
        self.assertIn("STEP EXECUTION", stdout)
        self.assertIn("EVIDENCE", stdout)
        self.assertIn("REPORT", stdout)
        self.assertIn("## Evidence Map", stdout)

        match = re.search(r"runId: ([0-9a-f-]+)", stdout)
        self.assertIsNotNone(match)
        run_id = match.group(1)

        snapshot_path = Path(os.environ["GENESIS_HOME"]) / "runs" / ("%s.json" % run_id)
        markdown_path = Path(os.environ["GENESIS_HOME"]) / "runs" / ("%s.md" % run_id)
        self.assertTrue(snapshot_path.exists())
        self.assertTrue(markdown_path.exists())
        snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
        self.assertIn("evidence", snapshot)
        self.assertIn("Evidence Map", snapshot["markdown"])
        self.assertNotIn("apiKey", json.dumps(snapshot))

        code, status_stdout, status_stderr = self.invoke(["status", run_id])
        self.assertEqual(0, code, status_stderr)
        self.assertIn("status: completed", status_stdout)
        self.assertIn("evidenceCount:", status_stdout)
        self.assertIn("TRACE", status_stdout)
        self.assertIn("status=success", status_stdout)

        code, report_stdout, report_stderr = self.invoke(["report", run_id])
        self.assertEqual(0, code, report_stderr)
        self.assertIn("# Genesis Lab", report_stdout)
        self.assertIn("## Findings", report_stdout)

        code, resume_stdout, resume_stderr = self.invoke(["resume", run_id])
        self.assertEqual(0, code, resume_stderr)
        self.assertIn("RESUME", resume_stdout)
        self.assertIn("status: completed", resume_stdout)
        self.assertIn("# Genesis Lab", resume_stdout)

    def test_skills_and_mcp_commands(self):
        code, stdout, stderr = self.invoke(["skills", "list"])
        self.assertEqual(0, code, stderr)
        self.assertIn("research_literature", stdout)

        code, stdout, stderr = self.invoke(["skills", "inspect", "experiment_design"])
        self.assertEqual(0, code, stderr)
        self.assertIn("python.sandbox", stdout)

        code, stdout, stderr = self.invoke(["mcp", "list"])
        self.assertEqual(0, code, stderr)
        self.assertIn("No MCP servers configured", stdout)

        code, stdout, stderr = self.invoke(["mcp", "test", "missing", "tool"])
        self.assertEqual(1, code)
        self.assertIn('"ok": false', stdout)
        self.assertIn("MCP server not configured", stdout)

    def test_chat_accepts_active_research_idea(self):
        code, stdout, stderr = self.invoke(["chat"], "quantum memory stability in LLMs\nexit\n")
        self.assertEqual(0, code, stderr)
        self.assertIn("Genesis research chat started", stdout)
        self.assertIn("ResearchTask", stdout)


if __name__ == "__main__":
    unittest.main()


