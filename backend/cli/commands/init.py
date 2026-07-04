from argparse import _SubParsersAction
from typing import Any

from ..config import ensure_default_files


def register(subparsers: _SubParsersAction) -> None:
    parser = subparsers.add_parser("init", help="Initialize Genesis home, config, MCP config, and run storage.")
    parser.add_argument("--force", action="store_true", help="Overwrite default config files.")
    parser.set_defaults(handler=handle)


def handle(args: Any) -> int:
    paths = ensure_default_files(force=bool(args.force))
    print("Genesis Lab initialized")
    print("home: %s" % paths["home"])
    print("config: %s" % paths["config"])
    print("mcp: %s" % paths["mcp"])
    return 0
