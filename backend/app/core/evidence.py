from typing import Dict, List

from .models import EvidenceItem


class EvidenceStore:
    def __init__(self) -> None:
        self._items_by_run: Dict[str, List[EvidenceItem]] = {}

    def add(self, run_id: str, item: EvidenceItem) -> EvidenceItem:
        self._items_by_run.setdefault(run_id, []).append(item)
        return item

    def list(self, run_id: str) -> List[EvidenceItem]:
        return list(self._items_by_run.get(run_id, []))

    def find_many(self, run_id: str, evidence_ids: List[str]) -> List[EvidenceItem]:
        wanted = set(evidence_ids)
        return [item for item in self.list(run_id) if item.id in wanted]
