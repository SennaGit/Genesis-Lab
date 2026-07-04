try:
    from backend.app.core.store.run_store import JsonPersistenceStore
except ModuleNotFoundError:  # pragma: no cover - supports running from backend/
    from app.core.store.run_store import JsonPersistenceStore


class MemoryStore(JsonPersistenceStore):
    """Backward-compatible alias for the CLI JSON persistence store."""

    pass
