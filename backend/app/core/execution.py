import uuid
from dataclasses import dataclass
from typing import Any, Literal, Optional

from .store.run_store import MemoryPersistenceStore, PersistenceStore


class NullLogger:
    def log(self, message: str) -> None:
        pass

    def node_started(self, node: Any, trace: Any) -> None:
        pass

    def node_succeeded(self, node: Any, trace: Any) -> None:
        pass

    def node_failed(self, node: Any, trace: Any) -> None:
        pass


class NullProvider:
    name = "mock"

    def chat(self, input_data: Any) -> Any:
        return {"content": ""}


@dataclass
class ExecutionContext:
    mode: Literal["api", "cli", "agent"]
    runId: str
    logger: Any
    store: PersistenceStore
    provider: Any


def create_execution_context(
    mode: Literal["api", "cli", "agent"],
    run_id: Optional[str] = None,
    logger: Optional[Any] = None,
    store: Optional[PersistenceStore] = None,
    provider: Optional[Any] = None,
) -> ExecutionContext:
    return ExecutionContext(
        mode=mode,
        runId=run_id or str(uuid.uuid4()),
        logger=logger or NullLogger(),
        store=store or MemoryPersistenceStore(),
        provider=provider or NullProvider(),
    )

