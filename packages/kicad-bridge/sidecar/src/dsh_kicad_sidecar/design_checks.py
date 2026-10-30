"""kicad_check_design: unit tests for a schematic, written from the parts' datasheets.

A check names a rule, the pin or part it is about, its bound, and where the bound comes from: a quote from a datasheet
(kept by kicad_datasheet) or from a workspace file such as design-brief.md. Every verdict comes from KiCad's netlist and
the part values. A check passes only when the schematic meets the bound *and* its source holds: the quote is in the
source and states the bound's numbers. A check whose source does not hold, or that needs a value the design does not
give (a rail's voltage, a readable part value), says it cannot verify instead of guessing."""
from __future__ import annotations

import json
import os
import re
from typing import Any

from . import datasheet
from .datasheet import DatasheetError, parse_value

CHECKS_FILE = "design-checks.json"

# rule → required fields, bound fields with their unit, and the bounds of which at least one must be given
RULES: dict[str, dict[str, Any]] = {
    "max_voltage": {"fields": ["pin", "max"], "bounds": {"max": "V"}},
    "voltage_range": {"fields": ["pin", "min", "max"], "bounds": {"min": "V", "max": "V"}},
    "voltage_difference": {"fields": ["pin", "minus"], "bounds": {"min": "V", "max": "V"}, "one_of": ["min", "max"]},
    "capacitance": {"fields": ["pin"], "bounds": {"min": "F", "max": "F"}, "one_of": ["min", "max"]},
    "resistance": {"fields": ["pin", "to"], "bounds": {"min": "ohm", "max": "ohm", "value": "ohm"}, "one_of": ["min", "max", "value"]},
    "same_net": {"fields": ["pins"], "bounds": {}},
    "led_current": {"fields": ["led", "vf"], "bounds": {"vf": "V", "min": "A", "max": "A"}, "one_of": ["min", "max"]},
}
# A bound past these is a unit slip ('22' meant as 22 µF), not a design value.
SANE = {"V": 1000.0, "F": 1.0, "ohm": 1e9, "A": 100.0}
UNIT_TEXT = {"V": "V", "F": "F", "ohm": "Ω", "A": "A"}


class CheckError(Exception):
    """A check definition is malformed: nothing is saved."""


# ---- the checks file -----------------------------------------------------------------------------------------------

def checks_path(schematic: str) -> str:
    return os.path.join(os.path.dirname(schematic), CHECKS_FILE)


def load_checks(path: str) -> dict[str, Any]:
    if not os.path.exists(path):
        return {"rails": {}, "checks": []}
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    return {"rails": dict(data.get("rails") or {}), "checks": list(data.get("checks") or [])}


def save_checks(path: str, data: dict[str, Any]) -> None:
    with open(path + ".part", "w", encoding="utf-8") as fh:
        json.dump({"rails": data["rails"], "checks": data["checks"]}, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    os.replace(path + ".part", path)


def merge(data: dict[str, Any], checks: list[Any] | None = None, rails: dict[str, Any] | None = None,
          remove: list[str] | None = None) -> dict[str, Any]:
    """New checks replace the ones with the same id where they stand, or go last; every check must be well formed, or
    nothing changes."""
    out = {"rails": dict(data["rails"]), "checks": [c for c in data["checks"] if c.get("id") not in set(remove or [])]}
    for name, volts in (rails or {}).items():
        if parse_value(volts) is None:
            raise CheckError(f"rails: the voltage of {name!r} must be a number, got {volts!r}")
        out["rails"][name] = parse_value(volts)
    for i, check in enumerate(checks or []):
        problems = validate(check)
        if problems:
            raise CheckError(f"check {i} ({check.get('id', '?') if isinstance(check, dict) else '?'}): " + "; ".join(problems))
        at = next((j for j, c in enumerate(out["checks"]) if c.get("id") == check["id"]), None)
        if at is None:
            out["checks"].append(check)
        else:
            out["checks"][at] = check
    return out


def validate(check: Any) -> list[str]:
    if not isinstance(check, dict):
        return ["a check is an object"]
    problems = []
    if not re.fullmatch(r"[A-Za-z0-9_.:+-]{1,64}", str(check.get("id", ""))):
        problems.append("id: 1-64 letters, digits or _.:+-")
    rule = RULES.get(check.get("rule", ""))
    if rule is None:
        return problems + [f"rule must be one of {', '.join(RULES)}"]
    for field in rule["fields"]:
        if field == "pins" and check.get("rule") == "same_net":
            if not (isinstance(check.get("pins"), list) and len(check["pins"]) >= 2):
                problems.append("pins: two or more 'REF:PIN'")
        elif field not in check:
            problems.append(f"{field} is required")
    if rule.get("one_of") and not any(f in check for f in rule["one_of"]):
        problems.append(f"give {' or '.join(rule['one_of'])}")
    for field, unit in rule["bounds"].items():
        if field in check:
            value = parse_value(check[field])
            if value is None:
                problems.append(f"{field}: {check[field]!r} is not a number (write '22u', '4.7k', '20m', 3.3)")
            elif abs(value) > SANE[unit]:
                problems.append(f"{field}: {check[field]!r} {UNIT_TEXT[unit]} is not a plausible bound; write the prefix ('22u' for 22 µF)")
    sources = check.get("source")
    sources = sources if isinstance(sources, list) else [sources]
    for s in sources:
        if not isinstance(s, dict) or not s.get("quote"):
            problems.append("source: {url | pdf | part | file, page?, quote} with the exact words the bound comes from")
        elif not (s.get("url") or s.get("pdf") or s.get("part") or s.get("file") or check.get("part")):
            problems.append("source: say where the quote is (url, a workspace pdf, part — its datasheet link — or a workspace file)")
    return problems


# ---- the design, from KiCad's netlist ------------------------------------------------------------------------------

def rail_voltage(net: str, rails: dict[str, float]) -> float | None:
    """A net's nominal voltage: declared in rails, ground, or spelled in the name (+3V3, +5V, +1V8, +3.3V)."""
    bare = net.lstrip("/")
    for key in (net, bare):
        if key in rails:
            return float(rails[key])
    if re.fullmatch(r"(?i)[adp]?gnd[a-z0-9_]*|gnd[a-z0-9_]*|vss[a-z0-9_]*|earth", bare):
        return 0.0
    m = re.fullmatch(r"\+?(\d+)V(\d+)?", bare)
    if m:
        return float(f"{m.group(1)}.{m.group(2) or 0}")
    m = re.fullmatch(r"\+?(\d+(?:\.\d+)?)V", bare)
    return float(m.group(1)) if m else None


def _function(name: str, number: str) -> list[str]:
    # KiCad appends the pin number to the function ('VO_2', 'GND_A12'); a name may list alternates ('~{RESET}/PB5')
    base = name[:-len(number) - 1] if number and name.endswith("_" + number) else name
    return [name, base] + [part.replace("~{", "").replace("}", "") for part in base.split("/")]


class Design:
    """Pins, nets and two-pin parts of a netlist (kicad_cli.netlist)."""

    def __init__(self, netlist: dict[str, Any], rails: dict[str, float]):
        self.components = {c["reference"]: c for c in netlist["components"]}
        self.rails = rails
        self.pins: dict[str, list[tuple[str, str, str | None]]] = {}  # ref → [(number, function, net)]
        self.nets: dict[str, list[str]] = {}  # net → refs on it
        for net in netlist["nets"]:
            name = net["name"]
            real = None if name.startswith("unconnected-") else name
            for node in net["nodes"]:
                self.pins.setdefault(node["ref"], []).append((node.get("pin", ""), node.get("pin_function", ""), real))
                if real:
                    self.nets.setdefault(real, []).append(node["ref"])

    def net_of(self, spec: str) -> str | None:
        """The net on 'REF:PIN' (number or name); raises CheckError for a part or pin that is not there."""
        ref, _, pin = str(spec).partition(":")
        if ref not in self.components:
            raise CheckError(f"no part {ref} in the schematic")
        if not pin:
            raise CheckError(f"{spec}: write the pin as REF:PIN")
        pins = self.pins.get(ref, [])
        hits = [net for number, function, net in pins if pin == number or pin in _function(function, number)]
        if not hits:
            names = ", ".join(sorted({f"{n}({_function(f, n)[1]})" if f else n for n, f, _ in pins}))
            raise CheckError(f"{ref} has no pin {pin}; pins: {names}")
        if len(set(hits)) > 1:
            raise CheckError(f"{spec} is several pins on different nets; give the pin number")
        return hits[0]

    def net_named(self, name: str) -> str | None:
        for net in (name, "/" + name.lstrip("/")):
            if net in self.nets:
                return net
        return None

    def target(self, spec: str) -> str | None:
        return self.net_of(spec) if ":" in spec else self.net_named(spec)

    def volts(self, net: str | None) -> float | None:
        return None if net is None else rail_voltage(net, self.rails)

    def between(self, kind: str, a: str, b: str) -> list[str]:
        """Two-pin parts of a kind ('C', 'R') with one pin on net a and the other on net b."""
        out = []
        for ref, pins in self.pins.items():
            if _kind(ref) == kind and len(pins) == 2:
                if {pins[0][2], pins[1][2]} == {a, b} and a != b:
                    out.append(ref)
        return sorted(out, key=_ref_order)

    def two_pin_on(self, kind: str, net: str) -> list[tuple[str, str | None]]:
        """(part, the net on its other pin) for two-pin parts of a kind with a pin on ``net``."""
        out = []
        for ref, pins in self.pins.items():
            if _kind(ref) == kind and len(pins) == 2:
                nets = [p[2] for p in pins]
                if net in nets:
                    out.append((ref, nets[1] if nets[0] == net else nets[0]))
        return out

    def value(self, ref: str) -> float | None:
        return parse_value(self.components[ref].get("value", ""))


def _kind(ref: str) -> str:
    """The letters of a reference: 'C' for C12, 'R' for R3."""
    m = re.match(r"[A-Z]+", ref)
    return m.group(0) if m else ""


def _ref_order(ref: str) -> tuple[str, int]:
    m = re.match(r"([A-Za-z]+)(\d+)", ref)
    return (m.group(1), int(m.group(2))) if m else (ref, 0)


def _fmt(value: float, unit: str) -> str:
    if value == 0:
        return f"0 {UNIT_TEXT[unit]}"
    for scale, prefix in ((1e9, "G"), (1e6, "M"), (1e3, "k"), (1.0, ""), (1e-3, "m"), (1e-6, "µ"), (1e-9, "n")):
        if abs(value) >= scale * 0.9999:
            return f"{value / scale:.4g} {prefix}{UNIT_TEXT[unit]}"
    return f"{value / 1e-12:.4g} p{UNIT_TEXT[unit]}"


def _within(value: float, check: dict[str, Any], unit: str, what: str) -> tuple[str, str]:
    lo, hi = parse_value(check.get("min")), parse_value(check.get("max"))
    target, tol = parse_value(check.get("value")), parse_value(check.get("tolerance"))
    if target is not None:
        tol = 0.05 if tol is None else tol
        ok = abs(value - target) <= abs(target) * tol + 1e-15
        return ("pass" if ok else "fail"), f"{what} = {_fmt(value, unit)} ({'' if ok else 'not '}within {_fmt(target, unit)} ±{tol:.0%})"
    fails = []
    if lo is not None and value < lo * (1 - 1e-9):
        fails.append(f"< {_fmt(lo, unit)} (min)")
    if hi is not None and value > hi * (1 + 1e-9):
        fails.append(f"> {_fmt(hi, unit)} (max)")
    limits = " ".join(x for x in (f"≥ {_fmt(lo, unit)}" if lo is not None else "", f"≤ {_fmt(hi, unit)}" if hi is not None else "") if x)
    return ("fail", f"{what} = {_fmt(value, unit)} {' and '.join(fails)}") if fails else ("pass", f"{what} = {_fmt(value, unit)}, {limits}")


def evaluate(design: Design, check: dict[str, Any]) -> tuple[str, str]:
    """(pass | fail | cannot_verify, what the schematic gives against the bound)."""
    rule = check["rule"]
    try:
        if rule in ("max_voltage", "voltage_range"):
            net = design.net_of(check["pin"])
            if net is None:
                return "fail", f"{check['pin']} is not connected"
            v = design.volts(net)
            if v is None:
                return "cannot_verify", f"the voltage of {net} is unknown: name the rail like +3V3 or declare it in rails"
            return _within(v, {"max": check.get("max"), "min": check.get("min")}, "V", f"{check['pin']} on {net}")
        if rule == "voltage_difference":
            a, b = design.net_of(check["pin"]), design.net_of(check["minus"])
            va, vb = design.volts(a), design.volts(b)
            if va is None or vb is None:
                unknown = a if va is None else b
                return "cannot_verify", f"the voltage of {unknown or 'an unconnected pin'} is unknown"
            return _within(va - vb, check, "V", f"{check['pin']} − {check['minus']} ({a} − {b})")
        if rule == "capacitance":
            a, b = design.net_of(check["pin"]), design.target(check.get("to", "GND"))
            if a is None or b is None:
                return "fail", f"{check['pin'] if a is None else check.get('to', 'GND')} is not connected"
            caps = design.between("C", a, b)
            values = {c: design.value(c) for c in caps}
            unread = [c for c, v in values.items() if v is None]
            if unread:
                return "cannot_verify", f"cannot read the value of {', '.join(unread)}"
            total = sum(values.values())  # type: ignore[arg-type]
            parts = ", ".join(f"{c} {design.components[c]['value']}" for c in caps) or "no capacitor"
            status, detail = _within(total, check, "F", f"capacitance {a} → {b}")
            return status, f"{detail} ({parts})"
        if rule == "resistance":
            a, b = design.net_of(check["pin"]), design.target(check["to"])
            if a is None or b is None:
                return "fail", f"{check['pin'] if a is None else check['to']} is not connected"
            res = design.between("R", a, b)
            if not res:
                return "fail", f"no resistor between {a} and {b}"
            results = []
            for r in res:
                v = design.value(r)
                if v is None:
                    results.append(("cannot_verify", f"cannot read the value of {r}"))
                else:
                    status, detail = _within(v, check, "ohm", r)
                    results.append((status, detail))
            best = next((x for x in results if x[0] == "pass"), None) or next((x for x in results if x[0] == "cannot_verify"), results[0])
            return best[0], "; ".join(d for _, d in results) + f" (between {a} and {b})"
        if rule == "same_net":
            nets = {p: design.net_of(p) for p in check["pins"]}
            if None in nets.values():
                return "fail", ", ".join(p for p, n in nets.items() if n is None) + " not connected"
            if len(set(nets.values())) == 1:
                return "pass", f"{', '.join(check['pins'])} on {next(iter(nets.values()))}"
            return "fail", "; ".join(f"{p} on {n}" for p, n in nets.items())
        if rule == "led_current":
            return _led_current(design, check)
    except CheckError as exc:
        return "fail", str(exc)
    raise CheckError(f"unknown rule {rule}")


def _led_current(design: Design, check: dict[str, Any]) -> tuple[str, str]:
    led = check["led"]
    anode, cathode = design.net_of(f"{led}:A"), design.net_of(f"{led}:K")
    vf = parse_value(check["vf"])
    assert vf is not None

    def side(net: str | None) -> tuple[float | None, list[str], str]:
        """The rail voltage this LED pin reaches and the resistors on the way (one series resistor at most)."""
        if net is None:
            return None, [], "not connected"
        v = design.volts(net)
        if v is not None:
            return v, [], net
        resistors = [(r, far) for r, far in design.two_pin_on("R", net)]
        others = [ref for ref in design.nets.get(net, []) if ref != led and ref not in {r for r, _ in resistors}]
        if len(resistors) != 1 or others:
            return None, [], f"{net} (not one series resistor to a rail)"
        r, far = resistors[0]
        return design.volts(far), [r], far or "?"

    va, ra, na = side(anode)
    vk, rk, nk = side(cathode)
    if va is None or vk is None:
        return "cannot_verify", f"{led}: cannot follow {na if va is None else nk} to a rail of known voltage"
    resistors = ra + rk
    if not resistors:
        return "fail", f"{led} sits between {na} and {nk} without a series resistor"
    values = [design.value(r) for r in resistors]
    if None in values:
        return "cannot_verify", f"cannot read the value of {', '.join(r for r, v in zip(resistors, values) if v is None)}"
    current = (va - vk - vf) / sum(values)  # type: ignore[arg-type]
    if current <= 0:
        return "fail", f"{led} does not light: {na} − {nk} = {va - vk:.3g} V is not above Vf {vf:g} V"
    status, detail = _within(current, check, "A", f"I({led})")
    return status, f"{detail} = ({va:g} V − {vk:g} V − {vf:g} V) / {' + '.join(design.components[r]['value'] for r in resistors)}"


# ---- sources -------------------------------------------------------------------------------------------------------

def verify_source(project_dir: str, design: Design, check: dict[str, Any], download: bool) -> tuple[bool, str]:
    """(holds, where it was found, or why it does not hold)."""
    sources = check["source"] if isinstance(check["source"], list) else [check["source"]]
    quotes, where = [], []
    root = os.path.realpath(project_dir)

    def inside(rel: str) -> str | None:
        path = os.path.realpath(os.path.join(project_dir, rel))
        return path if path.startswith(root + os.sep) and os.path.isfile(path) else None

    for s in sources:
        quote = s["quote"]
        if s.get("file"):
            path = inside(s["file"])
            if path is None:
                return False, f"{s['file']} is not a file in the project"
            with open(path, encoding="utf-8", errors="replace") as fh:
                if not datasheet.quote_in_text(fh.read(), quote):
                    return False, f"the quote is not in {s['file']}"
            where.append(s["file"])
        else:
            url, pdf = s.get("url"), None
            part = s.get("part") or check.get("part")
            if s.get("pdf"):
                pdf = inside(s["pdf"])
                if pdf is None:
                    return False, f"{s['pdf']} is not a file in the project"
            elif not url and part:
                url = (design.components.get(part) or {}).get("datasheet")
                if not url:
                    return False, f"{part} has no datasheet link: give the source's url or a workspace pdf"
            try:
                ds = (datasheet.cached(project_dir, url or pdf)  # type: ignore[arg-type]
                      or datasheet.load(project_dir, url=url, pdf=pdf, download=download))
            except DatasheetError as exc:
                return False, str(exc)
            page = datasheet.find_quote(ds, quote, s.get("page"))
            if page is None:
                return False, f"the quote is not in {ds.title} ({ds.pages} pages)" if len(datasheet.normalize(quote)) >= datasheet.MIN_QUOTE \
                    else f"the quote is too short to prove anything (at least {datasheet.MIN_QUOTE} characters)"
            where.append(f"{ds.title} p.{page}")
        quotes.append(quote)
    for field, unit in RULES[check["rule"]]["bounds"].items():
        if field in check:
            value = parse_value(check[field])
            if not any(datasheet.states(q, value, unit) for q in quotes):  # type: ignore[arg-type]
                return False, f"no quote states {field} {check[field]}"
    return True, "; ".join(where)


def run(project_dir: str, netlist: dict[str, Any], data: dict[str, Any], download: bool = True) -> dict[str, Any]:
    design = Design(netlist, {k: float(v) for k, v in data["rails"].items()})
    results = []
    for check in data["checks"]:
        holds, where = verify_source(project_dir, design, check, download)
        if holds:
            status, detail = evaluate(design, check)
        else:
            status, detail = "cannot_verify", f"source: {where}"
        results.append({"id": check["id"], "rule": check["rule"], **({"part": check["part"]} if check.get("part") else {}),
                        "status": status, "detail": detail, **({"source": where} if holds else {})})
    counts = {k: sum(1 for r in results if r["status"] == k) for k in ("pass", "fail", "cannot_verify")}
    return {"counts": counts, "results": results}
