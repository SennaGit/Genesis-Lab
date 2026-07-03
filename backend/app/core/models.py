from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


@dataclass
class SubQuestion:
    id: int
    text: str
    requires: List[int] = field(default_factory=list)


@dataclass
class ResearchTask:
    question: str
    domains: List[str]
    subQuestions: List[SubQuestion]
    hypotheses: List[str]
    methods: List[str]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class DagNode:
    id: str
    type: str
    status: str
    requires: List[str]
    agent: str
    outputs: Dict[str, Any] = field(default_factory=dict)
    attempts: int = 0
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class AgentResult:
    taskId: str
    summary: str
    evidenceIds: List[str] = field(default_factory=list)
    artifacts: List[Dict[str, Any]] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class EvidenceItem:
    id: str
    sourceType: str
    sourceId: str
    snippet: str
    metadata: Dict[str, Any]
    createdBy: str
    createdAt: str = field(default_factory=utc_now_iso)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class Report:
    summary: str
    hypotheses: List[str]
    methods: List[str]
    results: List[Dict[str, Any]]
    evidenceMap: Dict[str, List[str]]
    references: List[Dict[str, Any]]
    review: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class RunRecord:
    id: str
    question: str
    status: str
    task: ResearchTask
    dag: List[DagNode]
    logs: List[str] = field(default_factory=list)
    artifacts: List[Dict[str, Any]] = field(default_factory=list)
    report: Optional[Report] = None
    createdAt: str = field(default_factory=utc_now_iso)
    updatedAt: str = field(default_factory=utc_now_iso)

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data["report"] = self.report.to_dict() if self.report else None
        return data
