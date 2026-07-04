import uuid
from typing import Dict, List, Optional

from .models import DagNode, ResearchTask, RunRecord, utc_now_iso


class RunStore:
    def __init__(self) -> None:
        self._runs: Dict[str, RunRecord] = {}

    def create(self, question: str, task: ResearchTask, dag: List[DagNode], run_id: Optional[str] = None) -> RunRecord:
        run = RunRecord(
            id=run_id or str(uuid.uuid4()),
            question=question,
            status="queued",
            task=task,
            dag=dag,
            logs=["Run created."],
        )
        self._runs[run.id] = run
        return run

    def get(self, run_id: str) -> Optional[RunRecord]:
        return self._runs.get(run_id)

    def require(self, run_id: str) -> RunRecord:
        run = self.get(run_id)
        if not run:
            raise KeyError(run_id)
        return run

    def touch(self, run: RunRecord) -> None:
        run.updatedAt = utc_now_iso()
