from argparse import _SubParsersAction
from typing import Any

from ..context import create_cli_context
from ..runtime_adapter import CliRuntimeAdapter


def register(subparsers: _SubParsersAction) -> None:
    parser = subparsers.add_parser("chat", help="Start an interactive Genesis research session.")
    parser.set_defaults(handler=handle)


def handle(args: Any) -> int:
    print("Genesis research chat started. Type exit to quit.")
    while True:
        try:
            line = input("> ").strip()
        except EOFError:
            break
        if not line:
            continue
        if line.lower() in ("exit", "quit"):
            break
        context = create_cli_context()
        CliRuntimeAdapter(context).run(line)
    return 0
