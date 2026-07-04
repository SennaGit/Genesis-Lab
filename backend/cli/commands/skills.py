import json
from argparse import _SubParsersAction
from typing import Any

try:
    from backend.app.core.skills import create_default_skill_registry
except ModuleNotFoundError:  # pragma: no cover - supports running from backend/
    from app.core.skills import create_default_skill_registry


def register(subparsers: _SubParsersAction) -> None:
    parser = subparsers.add_parser("skills", help="List or inspect Genesis skills.")
    nested = parser.add_subparsers(dest="skills_command")

    list_parser = nested.add_parser("list", help="List skills.")
    list_parser.set_defaults(handler=handle_list)

    inspect_parser = nested.add_parser("inspect", help="Inspect a skill.")
    inspect_parser.add_argument("skillId")
    inspect_parser.set_defaults(handler=handle_inspect)


def handle_list(args: Any) -> int:
    registry = create_default_skill_registry()
    for skill in registry.list():
        print("- %s: %s" % (skill.id, skill.description))
    return 0


def handle_inspect(args: Any) -> int:
    registry = create_default_skill_registry()
    print(json.dumps(registry.get(args.skillId).to_dict(), ensure_ascii=False, indent=2))
    return 0
