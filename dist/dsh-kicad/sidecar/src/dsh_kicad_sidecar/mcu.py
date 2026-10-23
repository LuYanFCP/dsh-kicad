"""MCU providers: static checks of how a microcontroller is wired, from the KiCad netlist and a per-family pin table.

A provider is a JSON file (``mcu_data/<family>.json``, or ``*.mcu.json`` next to the schematic) that says which symbols it
covers and, per GPIO, what matters: strapping behaviour at reset, reserved and input-only pins, ADC/DAC/touch capability.
The engine here applies the same rules to every provider. An MCU nobody covers is reported as "cannot verify", never as
passing: a false green is worse than no check. KiCad's netlist is the input; the model never decides.
"""

from __future__ import annotations

import fnmatch
import glob
import json
import os
import re
from typing import Any

from .spice import SimulationError, parse_value

__all__ = ["McuError", "DATA_DIR", "load_providers", "check_schematic", "Circuit"]

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mcu_data")
STRONG_PULL_OHMS = 47_000  # a resistor this small or smaller beats a chip's internal pull (about 45 kΩ)

_GROUND = re.compile(r"^(?:[ADPS]?GND\w*|VSS\w*|0V|GROUND)$", re.I)
_RAIL = re.compile(r"^(?:[+]?\d+(?:\.\d+)?V\d*\w*|V(?:CC|DD|BUS|IN|BAT|SYS)\w*|\+\w*V\w*)$", re.I)
_CANDIDATE_LIBS = ("MCU_", "Processor_")
_CANDIDATE_NAMES = re.compile(r"(?<![A-Z])(?:ESP\d|ESP-|NRF5|STM32|RP2\d|CC13|CC26|ATSAM|ATMEGA|ATTINY|PIC1[0-9]|PIC32|EFR32|SAMD|GD32|CH32|W806|BL6)", re.I)


class McuError(ValueError):
    """A provider file that cannot be used."""


# ---- providers -------------------------------------------------------------------------------
def _patterns(match: dict[str, Any] | None, lib_id: str, value: str) -> bool:
    match = match or {}
    if any(fnmatch.fnmatchcase(lib_id.lower(), p.lower()) for p in match.get("lib_id", [])):
        return True
    return any(re.search(p, value, re.I) for p in match.get("value", []))


def load_providers(project_dir: str | None = None) -> list[dict[str, Any]]:
    """Built-in providers plus the project's own ``*.mcu.json`` files (the project's win for the same ``id``)."""
    found: dict[str, dict[str, Any]] = {}
    files = sorted(glob.glob(os.path.join(DATA_DIR, "*.json")))
    if project_dir:
        files += sorted(glob.glob(os.path.join(project_dir, "*.mcu.json")))
    for path in files:
        try:
            with open(path, encoding="utf-8") as fh:
                provider = json.load(fh)
        except (OSError, json.JSONDecodeError) as exc:
            raise McuError(f"{path}: {exc}") from exc
        for key in ("id", "name", "match", "gpios"):
            if key not in provider:
                raise McuError(f"{path}: provider needs {key}")
        provider["_path"] = path
        found[provider["id"]] = provider
    return list(found.values())


def _gpio_of(provider: dict[str, Any], pin_name: str) -> int | None:
    alias = provider.get("pin_aliases", {}).get(pin_name)
    if alias is not None:
        return int(alias)
    match = re.search(provider.get("gpio_pin_pattern", r"(?:^|/)IO(\d+)$"), pin_name)
    return int(match.group(1)) if match else None


def _gpio_table(provider: dict[str, Any], lib_id: str, value: str) -> dict[int, dict[str, Any]]:
    table = {int(k): dict(v) for k, v in provider["gpios"].items()}
    for variant in provider.get("variants", []):
        if _patterns(variant.get("match"), lib_id, value):
            for gpio, why in variant.get("reserved", {}).items():
                table.setdefault(int(gpio), {})["reserved"] = why
    return table


# ---- the circuit -----------------------------------------------------------------------------
def short_name(net: str) -> str:
    """The net name without sheet path and the leading slash KiCad gives local labels."""
    return net.rsplit("/", 1)[-1]


class Circuit:
    """The KiCad netlist as lookups: which net a pin is on, what else is on it, what pulls it."""

    def __init__(self, netlist: dict[str, Any]):
        self.components = {c["reference"]: c for c in netlist["components"]}
        self.nets = {n["name"]: n for n in netlist["nets"]}
        self.pin_net: dict[tuple[str, str], str] = {}
        self.by_ref: dict[str, list[tuple[str, str]]] = {}
        for net in netlist["nets"]:
            for node in net["nodes"]:
                self.pin_net[(node["ref"], node["pin"])] = net["name"]
                self.by_ref.setdefault(node["ref"], []).append((node["pin"], net["name"]))

    def kind(self, net: str) -> str | None:
        """``ground``, ``rail`` or None: by the net's name, or a regulator output (a power_out pin) on it."""
        name = short_name(net)
        if _GROUND.match(name):
            return "ground"
        if _RAIL.match(name) or any(n.get("pin_type") == "power_out" for n in self.nets[net]["nodes"]):
            return "rail"
        return None

    def others(self, net: str, ref: str, pin: str) -> list[dict[str, Any]]:
        return [n for n in self.nets[net]["nodes"] if not (n["ref"] == ref and n["pin"] == pin)]

    def resistors(self, net: str, ref: str, pin: str) -> list[dict[str, Any]]:
        """Resistors from ``net`` to a rail or ground: ``{ref, ohms, to}``."""
        found = []
        for node in self.others(net, ref, pin):
            comp = self.components.get(node["ref"], {})
            if not (node["ref"].startswith("R") and (comp.get("lib_id", "").endswith(":R") or comp.get("lib_id", "").startswith("Device:R"))):
                continue
            ends = self.by_ref.get(node["ref"], [])
            other = [net_name for p, net_name in ends if p != node["pin"]]
            if len(other) != 1 or other[0] == net:
                continue
            kind = self.kind(other[0])
            if kind not in ("rail", "ground"):
                continue
            try:
                ohms = parse_value(comp.get("value", ""))
            except SimulationError:
                continue
            found.append({"ref": node["ref"], "ohms": ohms, "to": kind})
        return found

    def capacitors_to_ground(self, net: str) -> list[dict[str, Any]]:
        found = []
        for node in self.nets[net]["nodes"]:
            comp = self.components.get(node["ref"], {})
            if not node["ref"].startswith("C") or not comp.get("lib_id", "").startswith("Device:C"):
                continue
            other = [n for p, n in self.by_ref.get(node["ref"], []) if p != node["pin"]]
            if len(other) == 1 and other[0] != net and self.kind(other[0]) == "ground":
                try:
                    found.append({"ref": node["ref"], "farads": parse_value(comp.get("value", ""))})
                except SimulationError:
                    continue
        return found

    def has_switch(self, net: str, ref: str, pin: str) -> bool:
        for node in self.others(net, ref, pin):
            lib = self.components.get(node["ref"], {}).get("lib_id", "")
            if node["ref"].startswith("SW") or lib.startswith("Switch:") or "SW_" in lib:
                return True
        return False


# ---- checks ----------------------------------------------------------------------------------
def _finding(severity: str, rule: str, ref: str, pin: str, name: str, gpio: int | None, net: str, message: str, fix: str = "") -> dict[str, Any]:
    return {"severity": severity, "rule": rule, "pin": f"{ref}:{pin}", "pin_name": name, "gpio": gpio, "net": short_name(net) if net else "",
            "message": message, **({"fix": fix} if fix else {})}


def _connected(circuit: Circuit, net: str, ref: str, pin: str) -> bool:
    return bool(circuit.others(net, ref, pin))


def check_mcu(circuit: Circuit, ref: str, provider: dict[str, Any]) -> tuple[list[dict[str, Any]], int]:
    """``(findings, GPIO pins recognised)``: zero recognised means the symbol's pin names are not the ones the table knows."""
    comp = circuit.components[ref]
    table = _gpio_table(provider, comp.get("lib_id", ""), comp.get("value", ""))
    findings: list[dict[str, Any]] = []
    enable = provider.get("enable") or {}
    en_pattern = re.compile(enable["pin_pattern"]) if enable.get("pin_pattern") else None
    supply = {s.upper() for s in (provider.get("supply") or {}).get("pins", [])}
    supply_nets: dict[str, str] = {}  # net → the first supply pin on it
    recognised = 0
    for pin, net in circuit.by_ref.get(ref, []):
        node = next(n for n in circuit.nets[net]["nodes"] if n["ref"] == ref and n["pin"] == pin)
        name = (node.get("pin_function") or "").rsplit("_", 1)[0] if node.get("pin_function") else ""
        if name.upper() in supply and circuit.kind(net) != "ground":
            supply_nets.setdefault(net, pin)
        if en_pattern and en_pattern.search(name):
            findings += _check_enable(circuit, ref, pin, name, net, enable)
            continue
        gpio = _gpio_of(provider, name)
        if gpio is None:
            continue
        recognised += 1
        attrs = table.get(gpio, {})
        used = _connected(circuit, net, ref, pin)
        if not used:
            continue
        if attrs.get("reserved"):
            findings.append(_finding("error", "reserved_pin_used", ref, pin, name, gpio, net, f"GPIO{gpio} is {attrs['reserved']} and must stay unconnected, but it is on net {short_name(net)}",
                                     f"Move {short_name(net)} to a free GPIO and leave pin {pin} unconnected."))
            continue
        strapping = attrs.get("strapping")
        if strapping:
            findings += _check_strapping(circuit, ref, pin, name, gpio, net, strapping)
        if attrs.get("input_only"):
            findings += _check_input_only(circuit, ref, pin, name, gpio, net)
    findings += _check_supply(circuit, ref, supply_nets, provider)
    order = {"error": 0, "warning": 1, "info": 2}
    return sorted(findings, key=lambda f: (order[f["severity"]], f["gpio"] if f["gpio"] is not None else -1)), recognised


def _check_strapping(circuit: Circuit, ref: str, pin: str, name: str, gpio: int, net: str, strapping: dict[str, Any]) -> list[dict[str, Any]]:
    why = strapping.get("why", "")
    avoid = strapping.get("avoid")
    severity = strapping.get("severity", "warning")
    kind = circuit.kind(net)
    out: list[dict[str, Any]] = []
    if avoid:
        bad_kind, word, pull = ("rail", "high", "pull-up") if avoid == "high" else ("ground", "low", "pull-down")
        if kind == bad_kind:
            out.append(_finding(severity, "strapping_level", ref, pin, name, gpio, net,
                                f"GPIO{gpio} is a strapping pin and is tied {word} by net {short_name(net)}: {why}",
                                f"Do not tie GPIO{gpio} {word}; leave it floating (internal {strapping.get('internal', 'pull')}) or use it only after boot through a switch or driver that is off at reset."))
        else:
            for r in circuit.resistors(net, ref, pin):
                if r["to"] != bad_kind:
                    continue
                strong = r["ohms"] <= STRONG_PULL_OHMS
                out.append(_finding(severity if strong else "warning", "strapping_level", ref, pin, name, gpio, net,
                                    f"GPIO{gpio} is a strapping pin and {r['ref']} ({_ohms(r['ohms'])}) is a {'strong ' if strong else ''}{pull}: {why}",
                                    f"Remove {r['ref']}" + ("" if strong else " or use at least 100 kΩ") + f" unless the {word} level at reset is what you want."))
    if not out:
        out.append(_finding("info", "strapping_pin", ref, pin, name, gpio, net, f"GPIO{gpio} is a strapping pin (internal {strapping.get('internal', 'pull')} at reset): {why}"))
    return out


def _check_input_only(circuit: Circuit, ref: str, pin: str, name: str, gpio: int, net: str) -> list[dict[str, Any]]:
    out = []
    others = circuit.others(net, ref, pin)
    types = {n.get("pin_type") for n in others}
    if types and types <= {"input"}:
        out.append(_finding("warning", "input_only_drive", ref, pin, name, gpio, net,
                            f"GPIO{gpio} is input-only but net {short_name(net)} only has input pins on it: nothing here can drive it from the MCU",
                            "Use an output-capable GPIO (not 34-39) for a signal the MCU drives."))
    if circuit.kind(net) is None and circuit.has_switch(net, ref, pin) and not circuit.resistors(net, ref, pin):
        out.append(_finding("warning", "input_only_no_pull", ref, pin, name, gpio, net,
                            f"GPIO{gpio} has no internal pull-up or pull-down and net {short_name(net)} has a switch but no pull resistor, so it floats while the switch is open",
                            "Add a 10 kΩ pull-up (or pull-down) resistor, or use a GPIO with internal pulls."))
    return out


def _check_enable(circuit: Circuit, ref: str, pin: str, name: str, net: str, enable: dict[str, Any]) -> list[dict[str, Any]]:
    advice = enable.get("advice", "Pull it up to the supply with 10 kΩ.")
    if not _connected(circuit, net, ref, pin):
        return [_finding(enable.get("unconnected_severity", "error"), "enable_unconnected", ref, pin, name, None, net,
                         f"{name} is not connected: {enable.get('unconnected_why', 'the chip stays off or resets at random')}", advice)]
    if circuit.kind(net) == "rail" or any(r["to"] == "rail" for r in circuit.resistors(net, ref, pin)):
        return []
    return [_finding(enable.get("no_pullup_severity", "warning"), "enable_no_pullup", ref, pin, name, None, net,
                     f"{name} has no pull-up to the supply on net {short_name(net)}: {enable.get('no_pullup_why', 'it can float')}", advice)]


def _check_supply(circuit: Circuit, ref: str, supply_nets: dict[str, str], provider: dict[str, Any]) -> list[dict[str, Any]]:
    supply = provider.get("supply") or {}
    need = float(supply.get("min_uf", 0)) * 1e-6
    if not need:
        return []
    out = []
    for net in sorted(supply_nets):
        total = sum(c["farads"] for c in circuit.capacitors_to_ground(net))
        if total < need:
            have = f"{total * 1e6:.3g} µF" if total else "no capacitor"
            out.append(_finding("warning", "supply_decoupling", ref, supply_nets[net], "supply", None, net,
                                f"Supply net {short_name(net)} has {have} to ground; the vendor recommends at least {need * 1e6:g} µF close to the chip",
                                f"Add a {supply.get('advice', f'{need * 1e6:g} µF capacitor')} from {short_name(net)} to ground next to {ref}."))
    return out


def _ohms(value: float) -> str:
    for scale, suffix in ((1e6, "M"), (1e3, "k")):
        if value >= scale:
            return f"{value / scale:g}{suffix}Ω"
    return f"{value:g}Ω"


# ---- requirements ----------------------------------------------------------------------------
CAPABILITIES = ("output", "input", "adc", "adc1", "adc2", "dac", "touch", "boot_free")


def _capability(attrs: dict[str, Any], needs: str, known: set[str] = frozenset()) -> tuple[bool, str]:  # type: ignore[assignment]
    reserved = attrs.get("reserved")
    if reserved:
        return False, f"it is {reserved}"
    if needs == "input":
        return True, ""
    if needs == "output":
        return (not attrs.get("input_only"), "it is input-only (GPIO34-39 cannot drive a signal)")
    if needs in ("adc", "adc1", "adc2"):
        adc = attrs.get("adc")
        if not adc:
            return False, "it has no ADC"
        if needs != "adc" and adc != needs:
            return False, f"its ADC is {adc}" + (" (ADC2 cannot be used while WiFi is on)" if adc == "adc2" else "")
        return True, ""
    if needs == "dac":
        return bool(attrs.get("dac")), "it has no DAC"
    if needs == "touch":
        return bool(attrs.get("touch")), "it has no touch sensor"
    if needs == "boot_free":
        return (not attrs.get("strapping")), "it is a strapping pin: its level at reset changes how the chip boots"
    caps = attrs.get("caps") or []
    if needs in caps:
        return True, ""
    if needs in known:
        return False, f"it cannot do {needs}"
    raise McuError(f"unknown capability {needs!r} for this MCU; use one of {', '.join(sorted(set(CAPABILITIES) | known))}")


def check_requirements(circuit: Circuit, mcus: dict[str, dict[str, Any]], requirements: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Judge ``{net | pin, needs}`` requirements: does the GPIO a signal sits on have the capability the firmware needs."""
    results = []
    for req in requirements:
        if not isinstance(req, dict) or not (req.get("net") or req.get("pin")) or not req.get("needs"):
            raise McuError("each requirement needs net (or pin) and needs, e.g. {\"net\": \"VBAT_SENSE\", \"needs\": \"adc1\"}")
        needs = req["needs"] if isinstance(req["needs"], list) else [req["needs"]]
        label = req.get("net") or req["pin"]
        gpios = _gpios_of_target(circuit, mcus, req)
        if not gpios:
            results.append({"target": label, "needs": needs, "passed": False, "reason": f"{label} is not connected to a GPIO of a covered MCU"})
            continue
        for ref, pin, gpio, attrs in gpios:
            problems = []
            for need in needs:
                known = {c for a in mcus[ref]["table"].values() for c in a.get("caps", [])}
                ok, why = _capability(attrs, need, known)
                if not ok:
                    problems.append(f"{need}: {why}")
            results.append({"target": label, "needs": needs, "pin": f"{ref}:{pin}", "gpio": gpio, "passed": not problems,
                            **({"reason": f"GPIO{gpio} — " + "; ".join(problems)} if problems else {})})
    return results


def _gpios_of_target(circuit: Circuit, mcus: dict[str, dict[str, Any]], req: dict[str, Any]) -> list[tuple[str, str, int, dict[str, Any]]]:
    found = []
    wanted_net = (req.get("net") or "").lstrip("/").lower()
    wanted_pin = req.get("pin") or ""
    for ref, info in mcus.items():
        provider, table = info["provider"], info["table"]
        for pin, net in circuit.by_ref.get(ref, []):
            node = next(n for n in circuit.nets[net]["nodes"] if n["ref"] == ref and n["pin"] == pin)
            name = (node.get("pin_function") or "").rsplit("_", 1)[0]
            gpio = _gpio_of(provider, name)
            if gpio is None:
                continue
            hit = (wanted_net and short_name(net).lstrip("/").lower() == wanted_net) or (wanted_pin and wanted_pin.lower() in (f"{ref}:{pin}".lower(), f"{ref}:{name}".lower(), f"{ref}:io{gpio}".lower()))
            if hit:
                found.append((ref, pin, gpio, table.get(gpio, {})))
    return found


# ---- the whole schematic ---------------------------------------------------------------------
def _is_candidate(lib_id: str, value: str) -> bool:
    """A symbol that looks like a microcontroller: from an MCU library, or named like one (custom libraries are common)."""
    lib, _, part = lib_id.partition(":")
    return lib.startswith(_CANDIDATE_LIBS) or bool(_CANDIDATE_NAMES.search(f"{part or lib} {value}"))


def check_schematic(netlist: dict[str, Any], project_dir: str | None = None, requirements: list[dict[str, Any]] | None = None,
                    reference: str | None = None) -> dict[str, Any]:
    """Check every MCU in the netlist a provider covers; list the ones nobody covers as ``cannot_verify``."""
    providers = load_providers(project_dir)
    circuit = Circuit(netlist)
    mcus: dict[str, dict[str, Any]] = {}
    report: list[dict[str, Any]] = []
    for ref, comp in sorted(circuit.components.items()):
        if reference and ref != reference:
            continue
        lib_id, value = comp.get("lib_id", ""), comp.get("value", "")
        provider = next((p for p in providers if _patterns(p["match"], lib_id, value)), None)
        if provider is not None:
            findings, recognised = check_mcu(circuit, ref, provider)
            if not recognised:
                report.append({"reference": ref, "lib_id": lib_id, "value": value, "provider": provider["id"], "status": "cannot_verify",
                               "reason": f"the {provider['name']} provider matches this symbol, but none of its pin names are GPIO names it knows "
                                         "(expected names like IO12): the symbol's pins are named differently, so nothing could be checked"})
                continue
            mcus[ref] = {"provider": provider, "table": _gpio_table(provider, lib_id, value)}
            report.append({"reference": ref, "lib_id": lib_id, "value": value, "provider": provider["id"], "status": "checked", "findings": findings,
                           "errors": sum(f["severity"] == "error" for f in findings), "warnings": sum(f["severity"] == "warning" for f in findings)})
            continue
        if not _is_candidate(lib_id, value) and not any(_patterns({"lib_id": n.get("lib_id", [])}, lib_id, value) for p in providers for n in p.get("not_covered", [])):
            continue
        why = next((n["why"] for p in providers for n in p.get("not_covered", []) if _patterns({"lib_id": n.get("lib_id", [])}, lib_id, value)), None)
        report.append({"reference": ref, "lib_id": lib_id, "value": value, "provider": None, "status": "cannot_verify",
                       "reason": (why + "; " if why else "") + "no provider covers this MCU, so its pin usage was not checked. Covered: "
                                  + ", ".join(p["name"] for p in providers) + ". A project can add its own *.mcu.json provider."})
    checked = [r for r in report if r["status"] == "checked"]
    passed: bool | None
    if not checked:
        # Nothing was covered: the requirements are neither met nor failed, they cannot be verified.
        results = [{"target": r.get("net") or r.get("pin"), "needs": r.get("needs"), "passed": None,
                    "reason": "cannot verify: no MCU in the schematic is covered by a provider"} for r in requirements or [] if isinstance(r, dict)]
        passed = None
    else:
        results = check_requirements(circuit, mcus, requirements or []) if requirements else []
        passed = all(r["errors"] == 0 for r in checked) and all(x["passed"] for x in results)
    return {"mcus": report, "requirements": results, "passed": passed, "providers": [p["id"] for p in providers]}
