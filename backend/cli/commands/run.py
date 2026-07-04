from argparse import _SubParsersAction
from typing import Any

from ..context import create_cli_context
from ..runtime_adapter import CliRuntimeAdapter


def register(subparsers: _SubParsersAction) -> None:
    parser = subparsers.add_parser("run", help="Run the complete Genesis research workflow.")
    parser.add_argument("question", nargs="+")
    parser.set_defaults(handler=handle)


def handle(args: Any) -> int:
    question = " ".join(args.question).strip()
    context = create_cli_context()
    CliRuntimeAdapter(context).run(question)
    return 0

