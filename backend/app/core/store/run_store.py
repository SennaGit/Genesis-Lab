import json
from pathlib import Path
from typing import Any, Dict, Iterable, Optional


class PersistenceStore:
    def saveRun(self, run_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError

    def getRun(self, run_id: str) -> Dict[str, Any]:
        raise NotImplementedError

    def saveEvidence(self, run_id: str, evidence: Iterable[Any]) -> None:
        raise NotImplementedError

    def save_run(self, run_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        return self.saveRun(run_id, data)

    def get_run(self, run_id: str) -> Dict[str, Any]:
        return self.getRun(run_id)

    def save_evidence(self, run_id: str, evidence: Iterable[Any]) -> None:
        self.saveEvidence(run_id, evidence)

    def save_run_snapshot(self, run: Any, evidence: Iterable[Any], markdown: str = "") -> Dict[str, Any]:
        snapshot = build_run_snapshot(run, evidence, markdown)
        return self.saveRun(run.id, snapshot)


class MemoryPersistenceStore(PersistenceStore):
    def __init__(self) -> None:
        self._runs: Dict[str, Dict[str, Any]] = {}
        self._evidence: Dict[str, Any] = {}

    def saveRun(self, run_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        self._runs[run_id] = data
        return data

    def getRun(self, run_id: str) -> Dict[str, Any]:
        if run_id not in self._runs:
            raise KeyError(run_id)
        return self._runs[run_id]

    def saveEvidence(self, run_id: str, evidence: Iterable[Any]) -> None:
        self._evidence[run_id] = serialize_evidence(evidence)
        snapshot = self._runs.get(run_id)
        if snapshot is not None:
            snapshot["evidence"] = self._evidence[run_id]


class JsonPersistenceStore(PersistenceStore):
    def __init__(self, root: Path) -> None:
        self.root = Path(root)
        self.runs_dir = self.root / "runs"
        self._runs: Dict[str, Dict[str, Any]] = {}

    def saveRun(self, run_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        snapshot = dict(data)
        markdown = snapshot.get("markdown") or ""
        snapshot["markdownPath"] = str(self.markdown_path(run_id))
        self._runs[run_id] = snapshot
        self.runs_dir.mkdir(parents=True, exist_ok=True)
        with self.snapshot_path(run_id).open("w", encoding="utf-8") as handle:
            json.dump(snapshot, handle, ensure_ascii=False, indent=2)
        with self.markdown_path(run_id).open("w", encoding="utf-8") as handle:
            handle.write(markdown)
        return snapshot

    def getRun(self, run_id: str) -> Dict[str, Any]:
        if run_id in self._runs:
            return self._runs[run_id]
        path = self.snapshot_path(run_id)
        if not path.exists():
            raise KeyError(run_id)
        with path.open("r", encoding="utf-8") as handle:
            snapshot = json.load(handle)
        self._runs[run_id] = snapshot
        return snapshot

    def saveEvidence(self, run_id: str, evidence: Iterable[Any]) -> None:
        try:
            snapshot = self.getRun(run_id)
        except KeyError:
            snapshot = {"schemaVersion": 1, "run": {"id": run_id}, "markdown": ""}
        snapshot["evidence"] = serialize_evidence(evidence)
        self.saveRun(run_id, snapshot)

    def snapshot_path(self, run_id: str) -> Path:
        return self.runs_dir / ("%s.json" % run_id)

    def markdown_path(self, run_id: str) -> Path:
        return self.runs_dir / ("%s.md" % run_id)


def build_run_snapshot(run: Any, evidence: Iterable[Any], markdown: str = "", markdown_path: Optional[str] = None) -> Dict[str, Any]:
    snapshot = {
        "schemaVersion": 1,
        "run": run.to_dict() if hasattr(run, "to_dict") else run,
        "evidence": serialize_evidence(evidence),
        "markdown": markdown,
    }
    if markdown_path:
        snapshot["markdownPath"] = markdown_path
    return snapshot


def serialize_evidence(evidence: Iterable[Any]) -> Any:
    return [item.to_dict() if hasattr(item, "to_dict") else item for item in evidence]

