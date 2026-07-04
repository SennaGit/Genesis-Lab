from argparse import _SubParsersAction
from pathlib import Path
from typing import Any

from ..context import create_cli_context


def register(subparsers: _SubParsersAction) -> None:
    parser = subparsers.add_parser("report", help="Print the Markdown report for a saved run.")
    parser.add_argument("runId")
    parser.add_argument("--path", action="store_true", help="Print only the report file path.")
    parser.set_defaults(handler=handle)


def handle(args: Any) -> int:
    context = create_cli_context()
    snapshot = context.persistence.load_run(args.runId)
    markdown = snapshot.get("markdown") or ""
    markdown_path = snapshot.get("markdownPath") or ""

    if args.path:
        context.logger.line(markdown_path)
        return 0

    if not markdown and markdown_path and Path(markdown_path).exists():
        markdown = Path(markdown_path).read_text(encoding="utf-8")

    context.logger.line(markdown)
    return 0

