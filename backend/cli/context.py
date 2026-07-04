from dataclasses import dataclass
from typing import Literal

from .config import load_config
from .logger import ConsoleLogger
from .providers import LLMProvider, create_provider
from .store import MemoryStore


@dataclass
class ExecutionContext:
    mode: Literal["cli", "api", "agent"]
    logger: ConsoleLogger
    persistence: MemoryStore
    provider: LLMProvider


def create_cli_context() -> ExecutionContext:
    config = load_config()
    return ExecutionContext(
        mode="cli",
        logger=ConsoleLogger(),
        persistence=MemoryStore(),
        provider=create_provider(config),
    )

