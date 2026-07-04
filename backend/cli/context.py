try:
    from backend.app.core.execution import ExecutionContext, create_execution_context
    from backend.app.core.store.run_store import JsonPersistenceStore
except ModuleNotFoundError:  # pragma: no cover - supports running from backend/
    from app.core.execution import ExecutionContext, create_execution_context
    from app.core.store.run_store import JsonPersistenceStore

from .config import genesis_home, load_config
from .logger import ConsoleLogger
from .providers import create_provider


def create_cli_context() -> ExecutionContext:
    config = load_config()
    return create_execution_context(
        "cli",
        logger=ConsoleLogger(),
        store=JsonPersistenceStore(genesis_home()),
        provider=create_provider(config),
    )
