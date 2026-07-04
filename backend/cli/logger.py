import json
from typing import Any, Dict, Iterable, List


class ConsoleLogger:
    def __init__(self, stream=None) -> None:
        self.stream = stream

    def section(self, title: str) -> None:
        self.write("\n== %s ==" % title)

    def line(self, text: str = "") -> None:
        self.write(text)

    def json(self, value: Dict[str, Any]) -> None:
        self.write(json.dumps(value, ensure_ascii=False, indent=2))

    def dag(self, nodes: Iterable[Any]) -> None:
        self.write(format_dag_tree(list(nodes)))

    def step_start(self, node: Any) -> None:
        requires = ", ".join(node.requires) if node.requires else "none"
        self.write("[start] %s (%s, agent=%s, requires=%s)" % (node.id, node.type, node.agent, requires))

    def step_end(self, node: Any) -> None:
        self.write("[done]  %s status=%s attempts=%s" % (node.id, node.status, node.attempts))

    def evidence(self, items: Iterable[Any]) -> None:
        for item in items:
            title = item.metadata.get("title", item.sourceType)
            self.write("- %s [%s] %s" % (item.id, item.sourceId, title))
            self.write("  %s" % item.snippet)

    def write(self, text: str) -> None:
        if self.stream is not None:
            self.stream.write(text + "\n")
            self.stream.flush()
            return
        print(text, flush=True)


def format_dag_tree(nodes: List[Any]) -> str:
    if not nodes:
        return "(empty DAG)"

    by_id = {node.id: node for node in nodes}
    required = set()
    for node in nodes:
        required.update(node.requires)

    roots = [node for node in nodes if node.id not in required]
    if not roots:
        roots = nodes[-1:]

    lines: List[str] = []
    for index, root in enumerate(roots):
        append_node(lines, by_id, root, "", index == len(roots) - 1, set())
    return "\n".join(lines)


def append_node(lines: List[str], by_id: Dict[str, Any], node: Any, prefix: str, is_last: bool, seen: set) -> None:
    connector = "`-- " if is_last else "|-- "
    marker = "" if node.id not in seen else " (seen)"
    lines.append("%s%s%s [%s] %s%s" % (prefix, connector, node.id, node.type, node.agent, marker))
    if node.id in seen:
        return
    next_seen = set(seen)
    next_seen.add(node.id)
    child_prefix = prefix + ("    " if is_last else "|   ")
    children = [by_id[item] for item in node.requires if item in by_id]
    for index, child in enumerate(children):
        append_node(lines, by_id, child, child_prefix, index == len(children) - 1, next_seen)

