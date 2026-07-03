from typing import Dict, Iterable, List

from .models import DagNode, ResearchTask


class DagEngine:
    def build(self, task: ResearchTask) -> List[DagNode]:
        nodes = []
        for sub_question in task.subQuestions:
            nodes.append(
                DagNode(
                    id="literature-%s" % sub_question.id,
                    type="literature_search",
                    status="pending",
                    requires=["literature-%s" % item for item in sub_question.requires],
                    agent="LiteratureAgent",
                    outputs={"question": sub_question.text},
                )
            )

        literature_ids = [node.id for node in nodes]
        if "python_analysis" in task.methods:
            nodes.append(
                DagNode(
                    id="analysis-1",
                    type="python_analysis",
                    status="pending",
                    requires=literature_ids,
                    agent="CodeAgent",
                    outputs={"goal": "生成轻量级可复现分析摘要。"},
                )
            )

        synthesis_requires = [node.id for node in nodes]
        nodes.append(
            DagNode(
                id="synthesis-1",
                type="report_synthesis",
                status="pending",
                requires=synthesis_requires,
                agent="SynthesisAgent",
            )
        )
        nodes.append(
            DagNode(
                id="review-1",
                type="self_review",
                status="pending",
                requires=["synthesis-1"],
                agent="ReviewAgent",
            )
        )
        self.validate(nodes)
        return nodes

    def validate(self, nodes: Iterable[DagNode]) -> None:
        node_map = {node.id: node for node in nodes}
        for node in node_map.values():
            for dependency in node.requires:
                if dependency not in node_map:
                    raise ValueError("missing dependency %s for node %s" % (dependency, node.id))
        self.topological_sort(list(node_map.values()))

    def topological_sort(self, nodes: List[DagNode]) -> List[DagNode]:
        node_map: Dict[str, DagNode] = {node.id: node for node in nodes}
        temporary = set()
        permanent = set()
        ordered = []

        def visit(node: DagNode) -> None:
            if node.id in permanent:
                return
            if node.id in temporary:
                raise ValueError("DAG contains a cycle at %s" % node.id)
            temporary.add(node.id)
            for dependency in node.requires:
                visit(node_map[dependency])
            temporary.remove(node.id)
            permanent.add(node.id)
            ordered.append(node)

        for candidate in nodes:
            visit(candidate)
        return ordered
