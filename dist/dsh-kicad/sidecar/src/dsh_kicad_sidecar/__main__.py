"""Entry point: ``python -m dsh_kicad_sidecar`` or ``dsh-kicad-sidecar``."""

from __future__ import annotations

import sys

if sys.version_info < (3, 10):  # before importing modules that need 3.10
    sys.stderr.write(f"dsh-kicad-sidecar needs Python 3.10 or newer, but {sys.executable} is {sys.version.split()[0]}. "
                     "Install Python 3.10+ and set the KiCad bridge 'python' setting to it.\n")
    sys.exit(3)

import argparse  # noqa: E402
import json  # noqa: E402

from . import __version__  # noqa: E402
from .server import Server  # noqa: E402
from .tools import Toolbox  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="dsh-kicad-sidecar", description="KiCad tools over MCP-style JSON-RPC on stdio.")
    parser.add_argument("--kicad-cli", help="kicad-cli executable (default: $KICAD_CLI, PATH, standard install locations)")
    parser.add_argument("--root", action="append", default=[], help="restrict file access to this directory (repeatable)")
    parser.add_argument("--java", help="Java for Freerouting (default: $JAVA_HOME, PATH)")
    parser.add_argument("--freerouting", help="freerouting.jar or a freerouting executable (default: $FREEROUTING_JAR, the downloaded jar)")
    parser.add_argument("--call", metavar="TOOL", help="run one tool and print its JSON result instead of serving")
    parser.add_argument("--args", default="{}", help="JSON arguments for --call")
    parser.add_argument("--version", action="version", version=__version__)
    opts = parser.parse_args(argv)
    # Line-buffered UTF-8 regardless of the platform's default encoding.
    sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)  # type: ignore[attr-defined]
    sys.stdin.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    toolbox = Toolbox(kicad_cli=opts.kicad_cli, roots=opts.root, java=opts.java, freerouting=opts.freerouting)
    if opts.call:
        print(json.dumps(toolbox.call(opts.call, json.loads(opts.args)), indent=1, ensure_ascii=False))
        return 0
    Server(toolbox).serve()
    return 0


if __name__ == "__main__":
    sys.exit(main())
