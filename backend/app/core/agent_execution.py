from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .agents import CodeAgent, LiteratureAgent, ReviewAgent, SynthesisAgent
from .evidence import EvidenceStore
from .models import AgentResult, DagNode, Report, ResearchTask


@dataclass
class AgentExecutionOutput:
    summary: str
    output: Dict[str, Any] = field(default_factory=dict)
    evidenceIds: List[str] = field(default_factory=list)
    artifacts: List[Dict[str, Any]] = field(default_factory=list)
    report: Optional[Report] = None
    agentResult: Optional[AgentResult] = None


class AgentExecutor:
    """Uniform adapter around role-specific agent implementations."""

    def __init__(
        self,
        literature_agent: LiteratureAgent,
        code_agent: CodeAgent,
        synthesis_agent: SynthesisAgent,
        review_agent: ReviewAgent,
    ) -> None:
        self._node_agents = {
            "LiteratureAgent": literature_agent,
            "CodeAgent": code_agent,
        }
        self._synthesis_agent = synthesis_agent
        self._review_agent = review_agent

    def run_node(
        self,
        run_id: str,
        task: ResearchTask,
        node: DagNode,
        evidence_store: EvidenceStore,
    ) -> AgentExecutionOutput:
        agent = self._node_agents.get(node.agent)
        if not agent:
            raise ValueError("Unsupported agent: %s" % node.agent)
        result = agent.run(run_id, task, node, evidence_store)
        return AgentExecutionOutput(
            summary=result.summary,
            output=result.to_dict(),
            evidenceIds=list(result.evidenceIds),
            artifacts=list(result.artifacts),
            agentResult=result,
        )

    def synthesize(
        self,
        run_id: str,
        task: ResearchTask,
        results: List[AgentResult],
        evidence_store: EvidenceStore,
    ) -> AgentExecutionOutput:
        report = self._synthesis_agent.run(run_id, task, results, evidence_store)
        output = {"resultCount": len(report.results), "artifactCount": len(report.artifacts)}
        return AgentExecutionOutput(summary="Report synthesis completed.", output=output, report=report)

    def review(self, report: Report) -> AgentExecutionOutput:
        reviewed = self._review_agent.run(report)
        review = reviewed.review if isinstance(reviewed.review, dict) else reviewed.review.to_dict()
        return AgentExecutionOutput(summary="Critic review completed.", output=review, report=reviewed)
