from argparse import _SubParsersAction
from typing import Any

from ..context import create_cli_context
from ..runtime_adapter import CliRuntimeAdapter


def register(subparsers: _SubParsersAction) -> None:
    parser = subparsers.add_parser("compile", help="Compile a research question into a task and DAG.")
    parser.add_argument("question", nargs="+")
    parser.set_defaults(handler=handle)


def handle(args: Any) -> int:
    question = " ".join(args.question).strip()
    context = create_cli_context()
    adapter = CliRuntimeAdapter(context)
    result = adapter.compile(question)

    context.logger.section("COMPILE")
    context.logger.line("ResearchTask")
    context.logger.json(result["task"].to_dict())
    context.logger.section(" DAG ")
    context.logger.dag(result["dag"])
    return 0

