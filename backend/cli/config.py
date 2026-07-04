import json
import os
from pathlib import Path
from typing import Any, Dict, Iterable, Optional


DEFAULT_CONFIG: Dict[str, Any] = {
    "provider": "mock",
    "apiKey": "",
    "baseURL": "",
    "model": "gpt-4.1",
    "max_steps": 6,
    "language": "zh",
}


def genesis_home() -> Path:
    return Path(os.environ.get("GENESIS_HOME", Path.home() / ".genesis")).expanduser()


def config_path() -> Path:
    return genesis_home() / "config.json"


def load_config() -> Dict[str, Any]:
    path = config_path()
    try:
        with path.open("r", encoding="utf-8") as handle:
            loaded = json.load(handle)
    except FileNotFoundError:
        return dict(DEFAULT_CONFIG)
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid Genesis config JSON at %s: %s" % (path, exc)) from exc
    return normalize_config({**DEFAULT_CONFIG, **loaded})


def normalize_config(config: Dict[str, Any]) -> Dict[str, Any]:
    provider = config.get("provider", "mock")
    if provider == "local":
        provider = "mock"
    elif provider == "openai-compatible":
        provider = "custom"

    return {
        "provider": provider,
        "apiKey": config.get("apiKey") or config.get("api_key") or "",
        "baseURL": config.get("baseURL") or config.get("base_url") or "",
        "model": config.get("model") or DEFAULT_CONFIG["model"],
        "max_steps": config.get("max_steps", DEFAULT_CONFIG["max_steps"]),
        "language": "zh",
    }


def join_python_path(entries: Iterable[Path], existing: Optional[str]) -> str:
    parts = [str(entry) for entry in entries]
    if existing:
        parts.append(existing)
    return os.pathsep.join(parts)

