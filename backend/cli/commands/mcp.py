import json
from argparse import _SubParsersAction
from typing import Any

try:
    from backend.app.core.tools import create_default_tool_registry
except ModuleNotFoundError:  # pragma: no cover - supports running from backend/
    from app.core.tools import create_default_tool_registry

from ..config import mcp_config_path


def register(subparsers: _SubParsersAction) -> None:
    parser = subparsers.add_parser("mcp", help="List or test configured MCP servers.")
    nested = parser.add_subparsers(dest="mcp_command")

    list_parser = nested.add_parser("list", help="List configured MCP servers.")
    list_parser.set_defaults(handler=handle_list)

    test_parser = nested.add_parser("test", help="Test a configured MCP server tool call.")
    test_parser.add_argument("server")
    test_parser.add_argument("toolName")
    test_parser.set_defaults(handler=handle_test)


def load_mcp() -> dict:
    path = mcp_config_path()
    if not path.exists():
        return {"servers": {}}
    return json.loads(path.read_text(encoding="utf-8"))


def handle_list(args: Any) -> int:
    config = load_mcp()
    servers = config.get("servers") or {}
    if not servers:
        print("No MCP servers configured.")
        print("path: %s" % mcp_config_path())
        return 0
    for name, server in servers.items():
        print("- %s: %s" % (name, server.get("command", "")))
    return 0


def handle_test(args: Any) -> int:
    registry = create_default_tool_registry(mcp_config_path())
    result = registry.call("mcp.call", {"server": args.server, "toolName": args.toolName, "input": {}})
    print(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))
    return 0 if result.ok else 1
