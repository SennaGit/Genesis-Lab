import json
from pathlib import Path
from typing import Any, Dict, Iterable

from .config import genesis_home


class MemoryStore:
    """CLI snapshot store backed by memory and JSON files for separate invocations."""

    def __init__(self, root: Path = None) -> None:
        self.root = root or genesis_home()
        self.runs_dir = self.root / "runs"
        self._snapshots: Dict[str, Dict[str, Any]] = {}

    def save_run(self, run: Any, evidence: Iterable[Any], markdown: str) -> Dict[str, Any]:
        snapshot = {
            "schemaVersion": 1,
            "run": run.to_dict(),
            "evidence": [item.to_dict() for item in evidence],
            "markdown": markdown,
            "markdownPath": str(self.markdown_path(run.id)),
        }
        self._snapshots[run.id] = snapshot
        self.runs_dir.mkdir(parents=True, exist_ok=True)
        with self.snapshot_path(run.id).open("w", encoding="utf-8") as handle:
            json.dump(snapshot, handle, ensure_ascii=False, indent=2)
        with self.markdown_path(run.id).open("w", encoding="utf-8") as handle:
            handle.write(markdown)
        return snapshot

    def load_run(self, run_id: str) -> Dict[str, Any]:
        if run_id in self._snapshots:
            return self._snapshots[run_id]
        path = self.snapshot_path(run_id)
        if not path.exists():
            raise KeyError(run_id)
        with path.open("r", encoding="utf-8") as handle:
            snapshot = json.load(handle)
        self._snapshots[run_id] = snapshot
        return snapshot

    def snapshot_path(self, run_id: str) -> Path:
        return self.runs_dir / ("%s.json" % run_id)

    def markdown_path(self, run_id: str) -> Path:
        return self.runs_dir / ("%s.md" % run_id)

