"""Regenerate tests/fixtures with the sidecar's own editor (needs KiCad symbol libraries).

    python tests/make_fixtures.py
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from dsh_kicad_sidecar.schematic import Schematic, new_schematic_text  # noqa: E402


def project(name):
    d = os.path.join(HERE, "fixtures", name)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, f"{name}.kicad_sch"), "w") as fh:
        fh.write(new_schematic_text())
    with open(os.path.join(d, f"{name}.kicad_pro"), "w") as fh:
        json.dump({"meta": {"filename": f"{name}.kicad_pro", "version": 3}}, fh, indent=2)
        fh.write("\n")
    return Schematic(os.path.join(d, f"{name}.kicad_sch"))


def rc_filter():
    """RC low-pass with a 3-pin connector: ERC-clean."""
    s = project("rc_filter")
    s.add_symbol("Connector:Conn_01x03_Pin", 80.01, 90.17, reference="J1", value="IN_OUT_GND")
    s.add_symbol("Device:R", 100.33, 80.01, reference="R1", value="10k", footprint="Resistor_SMD:R_0603_1608Metric")
    s.add_symbol("Device:C", 119.38, 90.17, reference="C1", value="100n", footprint="Capacitor_SMD:C_0603_1608Metric")
    s.add_symbol("power:PWR_FLAG", 139.7, 100.33, reference="#FLG01")
    s.connect_pins(("R1", "2"), ("C1", "1"))
    s.connect_pin_to_net("R1", "1", "IN")
    s.connect_pin_to_net("C1", "1", "OUT")
    s.connect_pin_to_net("C1", "2", "GND", kind="power")
    s.connect_pin_to_net("#FLG01", "1", "GND", kind="power")
    s.connect_pin_to_net("J1", "1", "IN")
    s.connect_pin_to_net("J1", "2", "OUT")
    s.connect_pin_to_net("J1", "3", "GND", kind="power")
    s.save()


def erc_errors():
    """A lone resistor: both pins unconnected."""
    s = project("erc_errors")
    s.add_symbol("Device:R", 100.33, 80.01, reference="R1", value="1k")
    s.save()


def blank():
    project("blank")


if __name__ == "__main__":
    rc_filter()
    erc_errors()
    blank()
    print("fixtures written")
