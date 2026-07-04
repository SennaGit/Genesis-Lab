import json
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional


@dataclass
class ToolSpec:
    name: str
    description: str
    inputSchema: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return {"name": self.name, "description": self.description, "inputSchema": self.inputSchema}


@dataclass
class ToolCallResult:
    ok: bool
    toolName: str
    output: Any = None
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {"ok": self.ok, "toolName": self.toolName, "output": self.output, "error": self.error}


ToolHandler = Callable[[Any], Any]


class ToolRegistry:
    def __init__(self) -> None:
        self._specs: Dict[str, ToolSpec] = {}
        self._handlers: Dict[str, ToolHandler] = {}

    def register(self, spec: ToolSpec, handler: ToolHandler) -> None:
        if not spec.name:
            raise ValueError("Tool name is required.")
        self._specs[spec.name] = spec
        self._handlers[spec.name] = handler

    def list(self) -> List[ToolSpec]:
        return sorted(self._specs.values(), key=lambda item: item.name)

    def get(self, name: str) -> ToolSpec:
        try:
            return self._specs[name]
        except KeyError as exc:
            raise KeyError(name) from exc

    def call(self, name: str, input_data: Any = None) -> ToolCallResult:
        handler = self._handlers.get(name)
        if handler is None:
            return ToolCallResult(False, name, error="Unknown tool: %s" % name)
        try:
            return ToolCallResult(True, name, output=handler(input_data or {}))
        except Exception as exc:
            return ToolCallResult(False, name, error=str(exc))


def create_default_tool_registry(mcp_config_path: Optional[Path] = None) -> ToolRegistry:
    registry = ToolRegistry()
    registry.register(
        ToolSpec(
            "literature.local_search",
            "Search the built-in Genesis Lab literature seed corpus.",
            {"type": "object", "properties": {"query": {"type": "string"}, "domains": {"type": "array"}}},
        ),
        local_literature_search,
    )
    registry.register(
        ToolSpec(
            "python.sandbox",
            "Run a short Python snippet in a temporary working directory.",
            {"type": "object", "properties": {"code": {"type": "string"}, "timeoutSeconds": {"type": "number"}}},
        ),
        python_sandbox,
    )
    registry.register(
        ToolSpec(
            "mcp.call",
            "Call a configured stdio MCP server tool.",
            {"type": "object", "properties": {"server": {"type": "string"}, "toolName": {"type": "string"}, "input": {"type": "object"}}},
        ),
        lambda input_data: mcp_call(input_data, mcp_config_path),
    )
    return registry


LOCAL_CORPUS = [
    {
        "id": "PMID:quantum-001",
        "title": "Bell experiments and no-signalling constraints",
        "domain": "physics",
        "snippet": "Bell experiments support non-classical correlations while preserving the no-signalling condition.",
    },
    {
        "id": "ARXIV:quantum-002",
        "title": "Quantum entanglement and relativistic causality",
        "domain": "physics",
        "snippet": "Entanglement correlations cannot be controlled as a faster-than-light communication channel.",
    },
    {
        "id": "PMID:mrna-001",
        "title": "mRNA vaccine design principles",
        "domain": "biomedicine",
        "snippet": "mRNA vaccine design jointly considers antigen choice, RNA stability, delivery formulation, and immune readout.",
    },
    {
        "id": "PMID:mrna-002",
        "title": "Lipid nanoparticle delivery for RNA therapeutics",
        "domain": "biomedicine",
        "snippet": "Lipid nanoparticles can protect RNA payloads and improve delivery efficiency in vaccine applications.",
    },
    {
        "id": "GENERIC:science-001",
        "title": "Evidence-backed scientific synthesis",
        "domain": "general science",
        "snippet": "Reliable scientific answers connect claims to sources, assumptions, and reproducible intermediate artifacts.",
    },
]


def local_literature_search(input_data: Any) -> List[Dict[str, Any]]:
    value = input_data if isinstance(input_data, dict) else {}
    domains = set(str(item) for item in value.get("domains") or [])
    if not domains:
        domains.add("general science")
    matches = [item for item in LOCAL_CORPUS if item["domain"] in domains]
    if not matches:
        matches = [item for item in LOCAL_CORPUS if item["domain"] == "general science"]
    return matches


def python_sandbox(input_data: Any) -> Dict[str, Any]:
    value = input_data if isinstance(input_data, dict) else {}
    code = str(value.get("code") or "")
    timeout = float(value.get("timeoutSeconds") or 3)
    if not code.strip():
        raise ValueError("python.sandbox requires code.")
    with tempfile.TemporaryDirectory(prefix="genesis-sandbox-") as tmpdir:
        completed = subprocess.run(
            [sys.executable, "-c", code],
            cwd=tmpdir,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            universal_newlines=True,
        )
    return {"returnCode": completed.returncode, "stdout": completed.stdout, "stderr": completed.stderr}


def mcp_call(input_data: Any, config_path: Optional[Path]) -> Dict[str, Any]:
    value = input_data if isinstance(input_data, dict) else {}
    server_name = str(value.get("server") or "")
    tool_name = str(value.get("toolName") or "")
    if not server_name or not tool_name:
        raise ValueError("mcp.call requires server and toolName.")
    config = load_mcp_config(config_path)
    server = config.get("servers", {}).get(server_name)
    if not server:
        raise KeyError("MCP server not configured: %s" % server_name)
    command = server.get("command")
    args = [str(item) for item in server.get("args", [])]
    if not command:
        raise ValueError("MCP server %s is missing command." % server_name)
    # v1 keeps this boundary explicit. Full JSON-RPC transport can replace this handler later.
    raise RuntimeError("MCP stdio transport is configured but not enabled in this MVP: %s %s" % (command, " ".join(args)))


def load_mcp_config(config_path: Optional[Path]) -> Dict[str, Any]:
    path = config_path or Path.home() / ".genesis" / "mcp.json"
    if not path.exists():
        return {"servers": {}}
    return json.loads(path.read_text(encoding="utf-8"))
