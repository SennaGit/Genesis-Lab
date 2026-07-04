import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional


@dataclass
class SkillSpec:
    id: str
    name: str
    description: str
    triggers: List[str]
    input_schema: Dict[str, Any]
    output_schema: Dict[str, Any]
    required_tools: List[str]
    default_model_role: str
    prompt: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "triggers": list(self.triggers),
            "input_schema": dict(self.input_schema),
            "output_schema": dict(self.output_schema),
            "required_tools": list(self.required_tools),
            "default_model_role": self.default_model_role,
            "prompt": self.prompt,
        }


class SkillRegistry:
    def __init__(self, skills: Optional[Iterable[SkillSpec]] = None) -> None:
        self._skills: Dict[str, SkillSpec] = {}
        for skill in skills or []:
            self.register(skill)

    def register(self, skill: SkillSpec) -> None:
        if not skill.id:
            raise ValueError("Skill id is required.")
        self._skills[skill.id] = skill

    def list(self) -> List[SkillSpec]:
        return sorted(self._skills.values(), key=lambda item: item.id)

    def get(self, skill_id: str) -> SkillSpec:
        try:
            return self._skills[skill_id]
        except KeyError as exc:
            raise KeyError(skill_id) from exc

    def select(self, text: str, methods: Optional[Iterable[str]] = None) -> List[SkillSpec]:
        q = (text or "").lower()
        selected: List[SkillSpec] = []
        method_text = " ".join(methods or []).lower()
        for skill in self.list():
            haystack = q + " " + method_text
            if any(trigger.lower() in haystack for trigger in skill.triggers):
                selected.append(skill)
        if not selected and self._skills:
            selected.append(self._skills["research_literature"])
        return selected


def create_default_skill_registry(extra_roots: Optional[Iterable[Path]] = None) -> SkillRegistry:
    registry = SkillRegistry(default_skill_specs())
    for root in default_skill_roots(extra_roots):
        load_skill_root(registry, root)
    return registry


def default_skill_roots(extra_roots: Optional[Iterable[Path]]) -> List[Path]:
    roots = []
    repo_root = Path(__file__).resolve().parents[4]
    roots.append(repo_root / "skills")
    roots.extend(Path(item) for item in (extra_roots or []))
    return roots


def load_skill_root(registry: SkillRegistry, root: Path) -> None:
    if not root.exists():
        return
    for skill_json in root.glob("*/skill.json"):
        skill = load_skill(skill_json)
        registry.register(skill)


def load_skill(skill_json: Path) -> SkillSpec:
    data = json.loads(skill_json.read_text(encoding="utf-8-sig"))
    prompt_path = skill_json.parent / "prompt.md"
    prompt = prompt_path.read_text(encoding="utf-8") if prompt_path.exists() else ""
    return SkillSpec(
        id=str(data["id"]),
        name=str(data.get("name") or data["id"]),
        description=str(data.get("description") or ""),
        triggers=[str(item) for item in data.get("triggers", [])],
        input_schema=dict(data.get("input_schema") or {"type": "object"}),
        output_schema=dict(data.get("output_schema") or {"type": "object"}),
        required_tools=[str(item) for item in data.get("required_tools", [])],
        default_model_role=str(data.get("default_model_role") or "executor"),
        prompt=prompt,
    )


def default_skill_specs() -> List[SkillSpec]:
    common_input = {"type": "object", "properties": {"question": {"type": "string"}}}
    common_output = {"type": "object", "properties": {"evidenceIds": {"type": "array"}}}
    return [
        SkillSpec(
            id="research_literature",
            name="Research Literature",
            description="Search and summarize literature-grade evidence for a research question.",
            triggers=["literature", "paper", "research", "review", "文献", "论文", "检索", "研究"],
            input_schema=common_input,
            output_schema=common_output,
            required_tools=["literature.local_search", "mcp.call"],
            default_model_role="executor",
            prompt="Collect source-grounded evidence and keep every claim traceable.",
        ),
        SkillSpec(
            id="paper_analysis",
            name="Paper Analysis",
            description="Analyze papers, claims, methods, limitations, and citation support.",
            triggers=["paper", "citation", "doi", "pdf", "论文", "引用", "方法"],
            input_schema=common_input,
            output_schema=common_output,
            required_tools=["literature.local_search"],
            default_model_role="executor",
            prompt="Extract claims, methods, assumptions, limitations, and evidence links.",
        ),
        SkillSpec(
            id="experiment_design",
            name="Experiment Design",
            description="Design reproducible experiments, checks, and analysis artifacts.",
            triggers=["experiment", "analysis", "simulate", "python", "实验", "分析", "仿真"],
            input_schema=common_input,
            output_schema={"type": "object", "properties": {"artifacts": {"type": "array"}}},
            required_tools=["python.sandbox"],
            default_model_role="executor",
            prompt="Design a reproducible experiment or analysis path with explicit assumptions.",
        ),
    ]

