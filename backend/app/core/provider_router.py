from typing import Any, Dict, List, Optional


class ProviderRouter:
    """Routes model calls by runtime role while keeping provider details out of core agents."""

    def __init__(self, provider: Any = None) -> None:
        self.provider = provider
        self.config = getattr(provider, "config", {}) if provider is not None else {}
        self.name = getattr(provider, "name", "mock") if provider is not None else "mock"

    def model_for(self, role: str) -> Optional[str]:
        models = self.config.get("models") if isinstance(self.config, dict) else None
        if isinstance(models, dict) and models.get(role):
            return models[role]
        if isinstance(self.config, dict):
            return self.config.get("model")
        return None

    def setting(self, key: str, default: Any = None) -> Any:
        if isinstance(self.config, dict):
            return self.config.get(key, default)
        return default

    def chat(self, role: str, messages: List[Dict[str, Any]], tools: Optional[List[Dict[str, Any]]] = None) -> Any:
        if self.provider is None or not hasattr(self.provider, "chat"):
            return {"content": ""}
        return self.provider.chat({"model": self.model_for(role), "messages": messages, "tools": tools})

    def is_mock(self) -> bool:
        return self.name == "mock"
