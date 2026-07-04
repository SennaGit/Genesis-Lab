from typing import Any, Dict

try:
    from backend.app.core.runtime import GenesisRuntime
    from backend.app.core.tools import create_default_tool_registry
except ModuleNotFoundError:  # pragma: no cover - supports running from backend/
    from app.core.runtime import GenesisRuntime
    from app.core.tools import create_default_tool_registry

from .config import mcp_config_path
from .context import ExecutionContext


class CliRuntimeAdapter:
    def __init__(self, context: ExecutionContext, runtime: GenesisRuntime = None) -> None:
        self.context = context
        self.runtime = runtime or GenesisRuntime(
            store=context.store,
            provider=context.provider,
            tools=create_default_tool_registry(mcp_config_path()),
        )

    def compile(self, question: str) -> Dict[str, Any]:
        task = self.runtime.compile(question)
        dag = self.runtime.dag_engine.build(task)
        return {"task": task, "dag": dag}

    def run(self, question: str) -> Dict[str, Any]:
        logger = self.context.logger

        logger.section("CONFIG")
        logger.line("mode: %s" % self.context.mode)
        logger.line("runId: %s" % self.context.runId)
        logger.line("provider: %s" % self.context.provider.name)

        task = self.runtime.compile(question)
        dag = self.runtime.dag_engine.build(task)

        logger.section("COMPILE")
        logger.line("ResearchTask")
        logger.json(task.to_dict())

        logger.section("DAG")
        logger.dag(dag)

        logger.section("STEP EXECUTION")
        run = self.runtime.execute(task, self.context, dag=dag)

        evidence = self.runtime.list_evidence(run.id)
        markdown = self.runtime.markdown_report(run.id)
        snapshot = self.context.store.getRun(run.id)

        logger.section("EVIDENCE")
        logger.evidence(evidence)

        logger.section("REPORT")
        logger.line("path: %s" % snapshot.get("markdownPath", ""))
        logger.line(markdown)

        return {"run": run, "evidence": evidence, "markdown": markdown, "snapshot": snapshot}
