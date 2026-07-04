from argparse import _SubParsersAction
from pathlib import Path
from typing import Any

from ..context import create_cli_context


def register(subparsers: _SubParsersAction) -> None:
    parser = subparsers.add_parser("resume", help="Resume or inspect a saved Genesis run.")
    parser.add_argument("runId")
    parser.set_defaults(handler=handle)


def handle(args: Any) -> int:
    context = create_cli_context()
    snapshot = context.store.getRun(args.runId)
    run = snapshot.get("run", {})
    status = run.get("status", "unknown")
    print("RESUME")
    print("runId: %s" % run.get("id", args.runId))
    print("status: %s" % status)
    print("question: %s" % run.get("question", ""))
    markdown_path = snapshot.get("markdownPath") or ""
    if markdown_path:
        print("reportPath: %s" % markdown_path)
    if status == "completed":
        markdown = snapshot.get("markdown") or ""
        if not markdown and markdown_path and Path(markdown_path).exists():
            markdown = Path(markdown_path).read_text(encoding="utf-8")
        if markdown:
            print(markdown)
        return 0
    print("Run is not completed. The current MVP restores saved state for inspection; re-execution will be added after SQLite/job queues.")
    return 0
