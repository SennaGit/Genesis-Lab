import json
from argparse import _SubParsersAction
from typing import Any

from ..config import config_path, load_config, redacted_config, set_config_value, unset_config_value


def register(subparsers: _SubParsersAction) -> None:
    parser = subparsers.add_parser("config", help="Show or update Genesis provider configuration.")
    nested = parser.add_subparsers(dest="config_command")

    show = nested.add_parser("show", help="Show config with secrets redacted.")
    show.set_defaults(handler=handle_show)

    path = nested.add_parser("path", help="Print config path.")
    path.set_defaults(handler=handle_path)

    set_parser = nested.add_parser("set", help="Set config value.")
    set_parser.add_argument("key")
    set_parser.add_argument("value", nargs="+")
    set_parser.set_defaults(handler=handle_set)

    unset_parser = nested.add_parser("unset", help="Unset config value or restore its default.")
    unset_parser.add_argument("key")
    unset_parser.set_defaults(handler=handle_unset)


def handle_show(args: Any) -> int:
    print(json.dumps(redacted_config(load_config()), ensure_ascii=False, indent=2))
    return 0


def handle_path(args: Any) -> int:
    print(str(config_path()))
    return 0


def handle_set(args: Any) -> int:
    config = set_config_value(args.key, " ".join(args.value))
    print("updated config: %s" % args.key)
    print(json.dumps(redacted_config(config), ensure_ascii=False, indent=2))
    return 0


def handle_unset(args: Any) -> int:
    config = unset_config_value(args.key)
    print("unset config: %s" % args.key)
    print(json.dumps(redacted_config(config), ensure_ascii=False, indent=2))
    return 0
