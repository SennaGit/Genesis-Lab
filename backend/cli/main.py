import argparse
import sys
from typing import Iterable, Optional


for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8")

from .commands import chat as chat_command
from .commands import compile as compile_command
from .commands import config as config_command
from .commands import init as init_command
from .commands import mcp as mcp_command
from .commands import report as report_command
from .commands import resume as resume_command
from .commands import run as run_command
from .commands import skills as skills_command
from .commands import status as status_command


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="genesis", description="Genesis CLI research runtime")
    subparsers = parser.add_subparsers(dest="command")
    init_command.register(subparsers)
    run_command.register(subparsers)
    compile_command.register(subparsers)
    chat_command.register(subparsers)
    resume_command.register(subparsers)
    status_command.register(subparsers)
    report_command.register(subparsers)
    config_command.register(subparsers)
    skills_command.register(subparsers)
    mcp_command.register(subparsers)
    return parser


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)
    if not hasattr(args, "handler"):
        parser.print_help()
        return 0
    try:
        return int(args.handler(args))
    except KeyError as exc:
        print("Run not found: %s" % exc, file=sys.stderr)
        return 1
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
