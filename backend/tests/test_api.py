import unittest

try:
    from fastapi.testclient import TestClient
except ImportError:  # pragma: no cover
    TestClient = None

try:
    from backend.app.main import app, runtime
except ModuleNotFoundError:  # pragma: no cover - supports running from backend/
    from app.main import app, runtime


@unittest.skipIf(TestClient is None or app is None, "FastAPI test dependencies are not installed")
class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_compile_endpoint(self):
        response = self.client.post("/api/research/compile", json={"question": "为什么量子纠缠不违反相对论？"})
        self.assertEqual(200, response.status_code)
        payload = response.json()
        self.assertIn("physics", payload["domains"])
        self.assertTrue(payload["subQuestions"])
        self.assertTrue(payload["requiredCapabilities"])

    def test_run_evidence_and_report_endpoints(self):
        created = self.client.post("/api/runs", json={"question": "如何设计一种新的mRNA疫苗？"})
        self.assertEqual(200, created.status_code)
        run_id = created.json()["runId"]

        run = self.client.get("/api/runs/%s" % run_id)
        self.assertEqual(200, run.status_code)
        self.assertEqual("completed", run.json()["status"])
        self.assertTrue(run.json()["trace"])
        self.assertTrue(runtime.persistence_store.getRun(run_id)["run"]["trace"])

        evidence = self.client.get("/api/runs/%s/evidence" % run_id)
        self.assertEqual(200, evidence.status_code)
        self.assertTrue(evidence.json()["items"])

        report = self.client.get("/api/runs/%s/report" % run_id)
        self.assertEqual(200, report.status_code)
        self.assertIn("# Genesis Lab 研究报告", report.json()["markdown"])
        self.assertIn("## Evidence Map", report.json()["markdown"])


if __name__ == "__main__":
    unittest.main()
