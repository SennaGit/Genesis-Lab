import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


@dataclass
class ChatOutput:
    content: str
    toolCalls: Optional[List[Dict[str, Any]]] = None


class LLMProvider:
    name = "mock"

    def chat(self, input_data: Dict[str, Any]) -> ChatOutput:
        raise NotImplementedError


class MockProvider(LLMProvider):
    name = "mock"

    def chat(self, input_data: Dict[str, Any]) -> ChatOutput:
        messages = input_data.get("messages") or []
        content = messages[-1].get("content", "") if messages else ""
        return ChatOutput(content="Mock provider received: %s" % content)


class OpenAICompatibleProvider(LLMProvider):
    def __init__(self, config: Dict[str, Any], name: str = "custom") -> None:
        self.config = config
        self.name = name

    def chat(self, input_data: Dict[str, Any]) -> ChatOutput:
        base_url = (self.config.get("baseURL") or "https://api.openai.com/v1").rstrip("/")
        api_key = require_api_key(self.config)
        payload = {
            "model": input_data.get("model") or self.config.get("model"),
            "messages": input_data.get("messages") or [],
            "tools": input_data.get("tools"),
            "tool_choice": "auto" if input_data.get("tools") else None,
        }
        response = post_json(
            "%s/chat/completions" % base_url,
            payload,
            {"Authorization": "Bearer %s" % api_key},
        )
        message = ((response.get("choices") or [{}])[0].get("message") or {})
        return ChatOutput(
            content=message.get("content") or "",
            toolCalls=message.get("tool_calls"),
        )


class OpenAIProvider(OpenAICompatibleProvider):
    def __init__(self, config: Dict[str, Any]) -> None:
        next_config = dict(config)
        next_config["baseURL"] = next_config.get("baseURL") or "https://api.openai.com/v1"
        super().__init__(next_config, "openai")


class AnthropicProvider(LLMProvider):
    name = "anthropic"

    def __init__(self, config: Dict[str, Any]) -> None:
        self.config = config

    def chat(self, input_data: Dict[str, Any]) -> ChatOutput:
        base_url = (self.config.get("baseURL") or "https://api.anthropic.com/v1").rstrip("/")
        api_key = require_api_key(self.config)
        messages = input_data.get("messages") or []
        system = next((item.get("content") for item in messages if item.get("role") == "system"), None)
        payload = {
            "model": input_data.get("model") or self.config.get("model"),
            "max_tokens": 4096,
            "system": system,
            "messages": [item for item in messages if item.get("role") != "system"],
            "tools": input_data.get("tools"),
        }
        response = post_json(
            "%s/messages" % base_url,
            payload,
            {"x-api-key": api_key, "anthropic-version": "2023-06-01"},
        )
        blocks = response.get("content") or []
        text = "\n".join(block.get("text", "") for block in blocks if block.get("type") == "text")
        tool_calls = [
            {"id": block.get("id"), "name": block.get("name"), "input": block.get("input")}
            for block in blocks
            if block.get("type") == "tool_use"
        ]
        return ChatOutput(content=text, toolCalls=tool_calls or None)


def create_provider(config: Dict[str, Any]) -> LLMProvider:
    provider = config.get("provider", "mock")
    if provider == "openai":
        return OpenAIProvider(config)
    if provider == "anthropic":
        return AnthropicProvider(config)
    if provider == "custom":
        return OpenAICompatibleProvider(config, "custom")
    return MockProvider()


def require_api_key(config: Dict[str, Any]) -> str:
    api_key = config.get("apiKey") or config.get("api_key")
    if not api_key:
        raise ValueError("Missing apiKey. Run `genesis config set apiKey <key>` first.")
    return api_key


def post_json(url: str, payload: Dict[str, Any], headers: Dict[str, str]) -> Dict[str, Any]:
    cleaned_payload = {key: value for key, value in payload.items() if value is not None}
    request = urllib.request.Request(
        url,
        data=json.dumps(cleaned_payload).encode("utf-8"),
        headers={"Content-Type": "application/json", **headers},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError("Provider request failed: HTTP %s %s" % (exc.code, detail)) from exc

