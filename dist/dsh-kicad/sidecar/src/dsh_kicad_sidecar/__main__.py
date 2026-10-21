"""Entry point: ``python -m dsh_kicad_sidecar`` or ``dsh-kicad-sidecar``."""

from __future__ import annotations

import argparse
import json
import sys

from . import __version__
from .server import Server
from .tools import Toolbox


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="dsh-kicad-sidecar", description="KiCad tools over MCP-style JSON-RPC on stdio.")
    parser.add_argument("--kicad-cli", help="kicad-cli executable (default: $KICAD_CLI, PATH, standard install locations)")
    parser.add_argument("--root", action="append", default=[], help="restrict file access to this directory (repeatable)")
    parser.add_argument("--call", metavar="TOOL", help="run one tool and print its JSON result instead of serving")
    parser.add_argument("--args", default="{}", help="JSON arguments for --call")
    parser.add_argument("--version", action="version", version=__version__)
    opts = parser.parse_args(argv)
    # Line-buffered UTF-8 regardless of the platform's default encoding.
    sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)  # type: ignore[attr-defined]
    sys.stdin.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    toolbox = Toolbox(kicad_cli=opts.kicad_cli, roots=opts.root)
    if opts.call:
        print(json.dumps(toolbox.call(opts.call, json.loads(opts.args)), indent=1, ensure_ascii=False))
        return 0
    Server(toolbox).serve()
    return 0


if __name__ == "__main__":
    sys.exit(main())
