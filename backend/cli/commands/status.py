from argparse import _SubParsersAction
from typing import Any, Dict, List

from ..context import create_cli_context


def register(subparsers: _SubParsersAction) -> None:
    parser = subparsers.add_parser("status", help="Show status for a saved run.")
    parser.add_argument("runId")
    parser.set_defaults(handler=handle)


def handle(args: Any) -> int:
    context = create_cli_context()
    snapshot = context.store.getRun(args.runId)
    run = snapshot["run"]
    nodes: List[Dict[str, Any]] = run.get("dag") or []
    evidence = snapshot.get("evidence") or []

    context.logger.section("STATUS")
    context.logger.line("runId: %s" % run.get("id"))
    context.logger.line("status: %s" % run.get("status"))
    context.logger.line("question: %s" % run.get("question"))
    context.logger.line("createdAt: %s" % run.get("createdAt"))
    context.logger.line("updatedAt: %s" % run.get("updatedAt"))
    context.logger.line("evidenceCount: %s" % len(evidence))
    context.logger.line("reportPath: %s" % snapshot.get("markdownPath", ""))

    context.logger.section("Nodes")
    for node in nodes:
        context.logger.line(
            "- %s [%s] status=%s agent=%s"
            % (node.get("id"), node.get("type"), node.get("status"), node.get("agent"))
        )

    context.logger.section("TRACE")
    for item in run.get("trace") or []:
        context.logger.line(
            "- %s status=%s logs=%s"
            % (item.get("nodeId"), item.get("status"), len(item.get("logs") or []))
        )

    context.logger.section("Logs")
    for line in run.get("logs") or []:
        context.logger.line("- %s" % line)
    return 0

