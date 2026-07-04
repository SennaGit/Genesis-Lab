import json
import os
from pathlib import Path
from typing import Any, Dict, Iterable, Optional


DEFAULT_MODELS: Dict[str, str] = {
    "planner": "gpt-4.1",
    "executor": "gpt-4.1",
    "critic": "gpt-4.1",
    "synthesizer": "gpt-4.1-mini",
}

DEFAULT_CONFIG: Dict[str, Any] = {
    "provider": "mock",
    "apiKey": "",
    "baseURL": "",
    "model": "gpt-4.1",
    "models": dict(DEFAULT_MODELS),
    "max_steps": 6,
    "max_refinement_rounds": 1,
    "language": "zh",
}


def genesis_home() -> Path:
    return Path(os.environ.get("GENESIS_HOME", Path.home() / ".genesis")).expanduser()


def config_path() -> Path:
    return genesis_home() / "config.json"


def mcp_config_path() -> Path:
    return genesis_home() / "mcp.json"


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


def save_config(config: Dict[str, Any]) -> Dict[str, Any]:
    normalized = normalize_config(config)
    genesis_home().mkdir(parents=True, exist_ok=True)
    with config_path().open("w", encoding="utf-8") as handle:
        json.dump(normalized, handle, ensure_ascii=False, indent=2)
    return normalized


def ensure_default_files(force: bool = False) -> Dict[str, str]:
    genesis_home().mkdir(parents=True, exist_ok=True)
    if force or not config_path().exists():
        save_config(DEFAULT_CONFIG)
    if force or not mcp_config_path().exists():
        with mcp_config_path().open("w", encoding="utf-8") as handle:
            json.dump({"servers": {}}, handle, ensure_ascii=False, indent=2)
    (genesis_home() / "runs").mkdir(parents=True, exist_ok=True)
    return {"home": str(genesis_home()), "config": str(config_path()), "mcp": str(mcp_config_path())}


def normalize_config(config: Dict[str, Any]) -> Dict[str, Any]:
    provider = config.get("provider", "mock")
    if provider == "local":
        provider = "mock"
    elif provider == "openai-compatible":
        provider = "custom"
    models = dict(DEFAULT_MODELS)
    if isinstance(config.get("models"), dict):
        models.update({str(key): str(value) for key, value in config["models"].items()})

    return {
        "provider": provider,
        "apiKey": config.get("apiKey") or config.get("api_key") or "",
        "baseURL": config.get("baseURL") or config.get("base_url") or "",
        "model": config.get("model") or DEFAULT_CONFIG["model"],
        "models": models,
        "max_steps": int(config.get("max_steps", DEFAULT_CONFIG["max_steps"])),
        "max_refinement_rounds": int(config.get("max_refinement_rounds", DEFAULT_CONFIG["max_refinement_rounds"])),
        "language": "zh",
    }


def set_config_value(key: str, value: str) -> Dict[str, Any]:
    config = load_config()
    normalized_key = normalize_config_key(key)
    parsed: Any = value
    if normalized_key in ("max_steps", "max_refinement_rounds"):
        parsed = int(value)
    if normalized_key.startswith("models."):
        role = normalized_key.split(".", 1)[1]
        models = dict(config.get("models") or {})
        models[role] = value
        config["models"] = models
    else:
        config[normalized_key] = parsed
    return save_config(config)


def unset_config_value(key: str) -> Dict[str, Any]:
    config = load_config()
    normalized_key = normalize_config_key(key)
    if normalized_key.startswith("models."):
        role = normalized_key.split(".", 1)[1]
        models = dict(config.get("models") or {})
        models.pop(role, None)
        config["models"] = models
    elif normalized_key in ("apiKey", "baseURL"):
        config[normalized_key] = ""
    elif normalized_key in DEFAULT_CONFIG:
        config[normalized_key] = DEFAULT_CONFIG[normalized_key]
    return save_config(config)


def redacted_config(config: Dict[str, Any]) -> Dict[str, Any]:
    redacted = normalize_config(config)
    if redacted.get("apiKey"):
        redacted["apiKey"] = "******"
    return redacted


def normalize_config_key(key: str) -> str:
    map_keys = {
        "apiKey": "apiKey",
        "api_key": "apiKey",
        "baseURL": "baseURL",
        "baseUrl": "baseURL",
        "base_url": "baseURL",
        "provider": "provider",
        "model": "model",
        "max_steps": "max_steps",
        "maxSteps": "max_steps",
        "max_refinement_rounds": "max_refinement_rounds",
        "maxRefinementRounds": "max_refinement_rounds",
    }
    if key.startswith("models."):
        return key
    normalized = map_keys.get(key)
    if not normalized:
        raise ValueError("未知配置项: %s" % key)
    return normalized


def join_python_path(entries: Iterable[Path], existing: Optional[str]) -> str:
    parts = [str(entry) for entry in entries]
    if existing:
        parts.append(existing)
    return os.pathsep.join(parts)
