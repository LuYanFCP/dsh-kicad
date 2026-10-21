"""Shared inputs of the PCB-0 spike (#9), from the sidecar library modules both options use.

Both prototypes start from the same data, so the comparison is about the board writer only:
``netlist.read_netlist`` (``kicad-cli sch export netlist --format kicadsexpr``) for components, pins
and nets, and ``lib_tables.LibTable`` for ``Lib:Name`` → ``.kicad_mod`` through the fp-lib-table chain.
"""

from __future__ import annotations

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "packages", "kicad-bridge", "sidecar", "src"))

from dsh_kicad_sidecar.kicad_cli import KiCadCli, parse_version  # noqa: E402
from dsh_kicad_sidecar.lib_tables import LibTable  # noqa: E402
from dsh_kicad_sidecar.netlist import NetlistComponent as Component  # noqa: E402,F401
from dsh_kicad_sidecar.netlist import read_netlist as _read_netlist  # noqa: E402

CLI = KiCadCli(os.environ.get("KICAD_CLI"))


def kicad_cli(*args: str):
    return CLI.run(*args)


def kicad_major() -> int:
    return parse_version(CLI.version())[0]


def read_netlist(schematic: str) -> tuple[list[Component], list[str]]:
    """Components (with their pins' nets) and net names, in KiCad's order."""
    netlist = _read_netlist(CLI, os.path.abspath(schematic))
    return netlist.components, [n.name for n in netlist.nets]


def footprint_table(schematic: str) -> LibTable:
    return LibTable("fp", os.path.dirname(os.path.abspath(schematic)), kicad_major())
