"""SPICE verification: KiCad exports the netlist (``kicad-cli sch export netlist --format spice``, which reads the
symbols' ``Sim.*`` properties), ngspice runs it in batch mode, and requirement assertions are judged on the numbers.
The verdict is computed here, never by the model.
"""

from __future__ import annotations

import math
import os
import re
import shutil
import subprocess
from typing import Any

__all__ = ["SimulationError", "locate_ngspice", "ngspice_version", "parse_value", "prepare_netlist", "parse_raw",
           "Probe", "parse_probe", "evaluate", "simulate", "ANALYSES"]

ANALYSES = ("op", "tran", "ac")
DEFAULT_TIMEOUT = 60.0
MAX_TIMEOUT = 600.0
DOWNLOAD_URL = "https://ngspice.sourceforge.io/download.html"


class SimulationError(RuntimeError):
    """A simulation could not run or an argument is wrong (reported to the caller as an error)."""


# ---- ngspice ---------------------------------------------------------------------------------
def locate_ngspice(explicit: str | None = None) -> str | None:
    """The ngspice executable: the explicit path, ``$NGSPICE``, then ``PATH`` (and the usual Windows install)."""
    for candidate in (explicit, os.environ.get("NGSPICE")):
        if candidate and os.path.isfile(candidate):
            return candidate
    for name in ("ngspice", "ngspice_con"):
        found = shutil.which(name)
        if found:
            return found
    for root in (os.environ.get("ProgramFiles"), os.environ.get("ProgramFiles(x86)"), "C:\\"):
        for sub in ("Spice64\\bin\\ngspice_con.exe", "Spice\\bin\\ngspice_con.exe"):
            if root and os.path.isfile(os.path.join(root, sub)):
                return os.path.join(root, sub)
    return None


def ngspice_version(executable: str) -> str | None:
    try:
        out = subprocess.run([executable, "--version"], capture_output=True, text=True, timeout=20, stdin=subprocess.DEVNULL)
    except (OSError, subprocess.SubprocessError):
        return None
    match = re.search(r"ngspice[- ](?:version )?(\d+(?:\.\d+)*)", out.stdout + out.stderr, re.I)
    return match.group(1) if match else None


# ---- numbers ---------------------------------------------------------------------------------
_SUFFIX = {"t": 1e12, "g": 1e9, "meg": 1e6, "k": 1e3, "m": 1e-3, "u": 1e-6, "µ": 1e-6, "n": 1e-9, "p": 1e-12, "f": 1e-15}
_NUMBER = re.compile(r"^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(meg|[tgkmuµnpf])?[a-zµ]*$", re.I)


def parse_value(value: Any, what: str = "value") -> float:
    """A number or a SPICE-style string (``10k``, ``100n``, ``3.3V``, ``1Meg``, ``20ms``). ``m`` is milli, as in SPICE."""
    if isinstance(value, bool):
        raise SimulationError(f"{what} must be a number, got {value!r}")
    if isinstance(value, (int, float)):
        return float(value)
    match = _NUMBER.match(str(value).strip())
    if not match:
        raise SimulationError(f"{what} {value!r} is not a number (use e.g. 3.3, 10k, 100n, 20ms)")
    return float(match.group(1)) * (_SUFFIX[match.group(2).lower()] if match.group(2) else 1.0)


# ---- netlist ---------------------------------------------------------------------------------
def prepare_netlist(text: str) -> tuple[list[str], list[str], list[str]]:
    """Make KiCad's SPICE netlist runnable: ``(lines without .end, ignored elements, modelless diodes)``.

    Drops element lines that cannot be simulated (parts without a model are exported with a single node, e.g.
    ``J1 __J1``). A diode whose model name nothing defines comes from a symbol without ``Sim.Device``: KiCad then wires
    the nodes in symbol pin order (K before A on Device:LED), which is the reverse of SPICE's, so it is reported, not run.
    """
    lines: list[str] = []
    ignored: list[str] = []
    for raw in text.splitlines():
        line = raw.rstrip()
        stripped = line.strip()
        if not stripped or stripped.lower() == ".end":
            continue
        if stripped[0] in ".*+" or stripped[0] == "\\":
            lines.append(line)
            continue
        tokens = stripped.split()
        if len(tokens) < 3:  # name plus two nodes at least
            ignored.append(tokens[0])
            continue
        lines.append(line)
    body = "\n".join(lines).lower()
    defined = set(re.findall(r"^\.(?:model|subckt)\s+(\S+)", body, re.M))
    has_library = bool(re.search(r"^\.(?:include|inc|lib)\b", body, re.M))
    modelless = []
    for line in lines:
        tokens = line.split()
        if tokens and tokens[0][0].lower() == "d" and len(tokens) >= 4 and tokens[3].lower() not in defined and not has_library:
            modelless.append(tokens[0])
    return lines, ignored, modelless


def netlist_nodes(lines: list[str]) -> dict[str, str]:
    """Every node used by the element lines, best effort (the first tokens after the element name): ``{lower case: as written}``."""
    nodes: dict[str, str] = {}
    for line in lines:
        s = line.strip()
        if not s or s[0] in ".*+":
            continue
        tokens = s.split()
        letter = tokens[0][0].lower()
        count = {"r": 2, "c": 2, "l": 2, "d": 2, "v": 2, "i": 2, "q": 3, "m": 4, "j": 3, "e": 4, "g": 4, "f": 2, "h": 2, "b": 2, "s": 4, "w": 2}.get(letter)
        if letter == "x":
            nodes.update((t.lower(), t) for t in tokens[1:-1])
        elif count:
            nodes.update((t.lower(), t) for t in tokens[1:1 + count])
    return nodes


# ---- probes ----------------------------------------------------------------------------------
class Probe:
    """``V(node)``, ``V(a,b)`` or ``I(device)``."""

    def __init__(self, kind: str, names: tuple[str, ...], text: str):
        self.kind, self.names, self.text = kind, names, text

    @property
    def unit(self) -> str:
        return "V" if self.kind == "v" else "A"


_PROBE = re.compile(r"^\s*([vi])\s*\(\s*([^,()]+?)\s*(?:,\s*([^,()]+?)\s*)?\)\s*$", re.I)


def parse_probe(text: str) -> Probe:
    match = _PROBE.match(str(text))
    if not match:
        raise SimulationError(f"probe {text!r} is not V(net), V(netA,netB) or I(device)")
    kind = match.group(1).lower()
    names = tuple(n for n in (match.group(2), match.group(3)) if n)
    if kind == "i" and len(names) != 1:
        raise SimulationError(f"probe {text!r}: I() takes one device reference")
    return Probe(kind, names, f"{match.group(1).upper()}({', '.join(names)})")


def current_vector(device: str) -> str:
    """The ngspice vector holding a device's current, by the element's first letter."""
    ref = device.lower()
    letter = ref[0]
    if letter in "vl":
        return f"{ref}#branch"
    if letter == "r" or letter == "c":
        return f"@{ref}[i]"
    if letter == "d":
        return f"@{ref}[id]"
    raise SimulationError(f"I({device}) is supported for R, C, L, D and V elements only")


# ---- raw file --------------------------------------------------------------------------------
def parse_raw(text: str) -> dict[str, Any]:
    """An ngspice ASCII rawfile: ``{"plot", "complex", "scale", "vectors": {name: [values]}}``; names lower case, ``v(x)`` as ``x``."""
    head, _, body = text.partition("\nValues:")
    if not body:
        raise SimulationError("ngspice wrote no values")
    plot = (re.search(r"^Plotname:\s*(.*)$", head, re.M) or [None, ""])[1].strip()
    flags = (re.search(r"^Flags:\s*(.*)$", head, re.M) or [None, ""])[1].lower()
    count = int(re.search(r"^No\. Variables:\s*(\d+)", head, re.M).group(1))
    points = int(re.search(r"^No\. Points:\s*(\d+)", head, re.M).group(1))
    names: list[str] = []
    in_vars = False
    for line in head.splitlines():
        if line.startswith("Variables:"):
            in_vars = True
            continue
        if in_vars and line.strip():
            parts = line.split()
            names.append(_vector_name(parts[1]))
    if len(names) != count:
        raise SimulationError("ngspice rawfile has an unexpected variable list")
    complex_ = "complex" in flags
    tokens = body.split()
    columns: list[list[Any]] = [[] for _ in range(count)]
    pos = 0
    for _ in range(points):
        pos += 1  # the point index
        for v in range(count):
            token = tokens[pos]
            pos += 1
            if complex_:
                re_, im = token.split(",")
                columns[v].append(complex(float(re_), float(im)))
            else:
                columns[v].append(float(token))
    vectors = dict(zip(names, columns))
    return {"plot": plot, "complex": complex_, "points": points, "scale": columns[0], "scale_name": names[0], "vectors": vectors}


def _vector_name(name: str) -> str:
    """ngspice writes ``v(node)`` and ``i(source)`` / ``i(@d1[id])``; use ``node``, ``source#branch`` and ``@d1[id]``."""
    name = name.lower()
    match = re.fullmatch(r"v\((.*)\)", name)
    if match:
        return match.group(1)
    match = re.fullmatch(r"i\((.*)\)", name)
    if match:
        inner = match.group(1)
        return inner if inner.startswith("@") or inner.endswith("#branch") else f"{inner}#branch"
    return name


def find_vector(raw: dict[str, Any], probe: Probe, nodes: set[str]) -> list[Any]:
    vectors: dict[str, list[Any]] = raw["vectors"]
    if probe.kind == "i":
        key = current_vector(probe.names[0])
        if key not in vectors:
            raise SimulationError(f"{probe.text}: no such device current in the results (is {probe.names[0]} in the netlist?)")
        return vectors[key]
    series = [_node_vector(vectors, name, nodes, probe.text) for name in probe.names]
    if len(series) == 1:
        return series[0]
    return [a - b for a, b in zip(series[0], series[1])]


def _node_vector(vectors: dict[str, list[Any]], name: str, nodes: set[str], probe: str) -> list[Any]:
    wanted = name.lower().lstrip("/") if name.startswith("/") else name.lower()
    for candidate in (name.lower(), "/" + wanted, wanted):
        if candidate in vectors:
            return vectors[candidate]
    if wanted in ("0", "gnd"):
        return [0.0] * len(next(iter(vectors.values())))
    known = sorted(n.lstrip("/") for n in nodes if n not in ("0",))
    raise SimulationError(f"{probe}: no net named {name} (nets: {', '.join(known) or 'none'}); use the net name as KiCad lists it")


# ---- measures --------------------------------------------------------------------------------
def _interp(xs: list[float], ys: list[float], x: float, log: bool = False) -> float:
    if x < xs[0] or x > xs[-1]:
        raise SimulationError(f"at {x:g} is outside the simulated range {xs[0]:g} .. {xs[-1]:g}")
    lo, hi = 0, len(xs) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if xs[mid] <= x:
            lo = mid
        else:
            hi = mid
    x0, x1, y0, y1 = xs[lo], xs[hi], ys[lo], ys[hi]
    if x1 == x0:
        return y0
    t = (math.log(x / x0) / math.log(x1 / x0)) if log and x0 > 0 and x1 > 0 and x > 0 else (x - x0) / (x1 - x0)
    return y0 + (y1 - y0) * t


def _window(xs: list[float], ys: list[float], start: float | None, stop: float | None) -> tuple[list[float], list[float]]:
    lo = xs[0] if start is None else start
    hi = xs[-1] if stop is None else stop
    if lo > hi:
        raise SimulationError(f"window from {lo:g} is after to {hi:g}")
    px = [x for x in xs if lo <= x <= hi]
    if not px:
        raise SimulationError(f"window {lo:g} .. {hi:g} holds no simulated points")
    py = [y for x, y in zip(xs, ys) if lo <= x <= hi]
    if px[0] > lo:
        px.insert(0, lo)
        py.insert(0, _interp(xs, ys, lo))
    if px[-1] < hi:
        px.append(hi)
        py.append(_interp(xs, ys, hi))
    return px, py


def _integral(xs: list[float], ys: list[float]) -> float:
    return sum((xs[i + 1] - xs[i]) * (ys[i + 1] + ys[i]) / 2 for i in range(len(xs) - 1))


def _integral_squared(xs: list[float], ys: list[float]) -> float:
    """Exact integral of y² for the piecewise-linear signal through the samples."""
    return sum((xs[i + 1] - xs[i]) * (ys[i] ** 2 + ys[i] * ys[i + 1] + ys[i + 1] ** 2) / 3 for i in range(len(xs) - 1))


def _db(z: complex) -> float:
    return 20 * math.log10(max(abs(z), 1e-300))


def _cutoff(freqs: list[float], gains: list[float], reference: float, rising: bool) -> float:
    """First frequency where the gain crosses reference - 3 dB (low-pass: searching up from the lowest frequency;
    high-pass: reference is the passband at the highest frequency and the search runs down)."""
    target = reference - 3.0103
    order = range(len(freqs) - 1, 0, -1) if rising else range(0, len(freqs) - 1)
    for i in order:
        a, b = (i, i - 1) if rising else (i, i + 1)
        if (gains[a] - target) * (gains[b] - target) <= 0 and gains[a] != gains[b]:
            t = (target - gains[a]) / (gains[b] - gains[a])
            la, lb = math.log(freqs[a]), math.log(freqs[b])
            return math.exp(la + (lb - la) * t)
    raise SimulationError("the gain never falls 3 dB from its passband within the simulated frequency range")


MEASURES = {
    "op": ("value",),
    "tran": ("final", "initial", "max", "min", "mean", "rms", "pp", "at"),
    "ac": ("gain_db", "phase_deg", "peak_gain_db", "lowpass_cutoff_hz", "highpass_cutoff_hz"),
}
DEFAULT_MEASURE = {"op": "value", "tran": "final", "ac": "gain_db"}
_MEASURE_UNIT = {"gain_db": "dB", "peak_gain_db": "dB", "phase_deg": "deg", "lowpass_cutoff_hz": "Hz", "highpass_cutoff_hz": "Hz"}


def measure(kind: str, name: str, scale: list[float], values: list[Any], assertion: dict[str, Any], ref: list[Any] | None = None) -> float:
    at = parse_value(assertion["at"], "at") if assertion.get("at") is not None else None
    if kind == "op":
        return float(values[0].real if isinstance(values[0], complex) else values[0])
    if kind == "tran":
        xs = [float(x.real if isinstance(x, complex) else x) for x in scale]
        ys = [float(v) for v in values]
        if name == "at":
            if at is None:
                raise SimulationError("measure at needs at (a time, e.g. 5m)")
            return _interp(xs, ys, at)
        px, py = _window(xs, ys, parse_value(assertion["from"], "from") if assertion.get("from") is not None else None,
                         parse_value(assertion["to"], "to") if assertion.get("to") is not None else None)
        span = px[-1] - px[0]
        if name == "final":
            return py[-1]
        if name == "initial":
            return py[0]
        if name == "max":
            return max(py)
        if name == "min":
            return min(py)
        if name == "pp":
            return max(py) - min(py)
        if span <= 0:
            return py[0]
        if name == "mean":
            return _integral(px, py) / span
        if name == "rms":
            return math.sqrt(_integral_squared(px, py) / span)
    if kind == "ac":
        freqs = [float(x.real) for x in scale]
        z = [v if isinstance(v, complex) else complex(v) for v in values]
        if ref is not None:
            z = [a / b if b != 0 else complex("inf") for a, b in zip(z, ref)]
        gains = [_db(v) for v in z]
        if name == "peak_gain_db":
            return max(gains)
        if name == "lowpass_cutoff_hz":
            return _cutoff(freqs, gains, gains[0], rising=False)
        if name == "highpass_cutoff_hz":
            return _cutoff(freqs, gains, gains[-1], rising=True)
        if at is None:
            raise SimulationError(f"measure {name} needs at (a frequency, e.g. 1k)")
        if name == "gain_db":
            return _interp(freqs, gains, at, log=True)
        if name == "phase_deg":
            phases = [math.degrees(math.atan2(v.imag, v.real)) for v in z]
            for i in range(1, len(phases)):  # unwrap so interpolation does not jump through ±180
                while phases[i] - phases[i - 1] > 180:
                    phases[i] -= 360
                while phases[i] - phases[i - 1] < -180:
                    phases[i] += 360
            return _interp(freqs, phases, at, log=True)
    raise SimulationError(f"unknown measure {name} for {kind}")


def evaluate(assertion: dict[str, Any], results: dict[str, dict[str, Any]], nodes: set[str], order: list[str]) -> dict[str, Any]:
    """Judge one assertion against the simulation results."""
    if not isinstance(assertion, dict) or not assertion.get("probe"):
        raise SimulationError("each assertion needs a probe, e.g. {\"probe\": \"V(3V3)\", \"min\": 3.2, \"max\": 3.4}")
    kind = assertion.get("analysis") or (order[0] if len(order) == 1 else None)
    if kind is None:
        raise SimulationError(f"assertion on {assertion['probe']}: name its analysis ({', '.join(order)} were run)")
    if kind not in results:
        raise SimulationError(f"assertion on {assertion['probe']} uses analysis {kind}, which was not run (ran: {', '.join(order)})")
    name = assertion.get("measure") or DEFAULT_MEASURE[kind]
    if name not in MEASURES[kind]:
        raise SimulationError(f"measure {name} does not apply to {kind} (use {', '.join(MEASURES[kind])})")
    probe = parse_probe(assertion["probe"])
    raw = results[kind]
    values = find_vector(raw, probe, nodes)
    ref = find_vector(raw, parse_probe(assertion["ref"]), nodes) if assertion.get("ref") else None
    if kind != "ac" and any(isinstance(v, complex) for v in values):
        values = [v.real for v in values]
    try:
        value = measure(kind, name, raw["scale"], values, assertion, ref)
    except SimulationError as exc:
        raise SimulationError(f"{probe.text} {name}: {exc}") from exc
    shown = abs(value) if assertion.get("abs") else value
    lo = parse_value(assertion["min"], "min") if assertion.get("min") is not None else None
    hi = parse_value(assertion["max"], "max") if assertion.get("max") is not None else None
    if assertion.get("equals") is not None:
        target = parse_value(assertion["equals"], "equals")
        tolerance = parse_value(assertion["tol"], "tol") if assertion.get("tol") is not None else (
            abs(target) * parse_value(assertion["tol_pct"], "tol_pct") / 100 if assertion.get("tol_pct") is not None else 0.0)
        lo, hi = target - tolerance, target + tolerance
    if lo is None and hi is None:
        raise SimulationError(f"assertion on {probe.text} needs min, max or equals")
    slack = 1e-12 * max(1.0, abs(shown))
    passed = (lo is None or shown >= lo - slack) and (hi is None or shown <= hi + slack)
    unit = _MEASURE_UNIT.get(name, probe.unit if not (kind == "ac" and ref is not None) else "")
    return {
        "name": assertion.get("name") or _describe(probe, kind, name, assertion),
        "probe": probe.text, "analysis": kind, "measure": name, "value": shown, "unit": unit,
        "min": lo, "max": hi, "passed": bool(passed),
    }


def _describe(probe: Probe, kind: str, name: str, assertion: dict[str, Any]) -> str:
    at = f" at {assertion['at']}" if assertion.get("at") is not None else ""
    return f"{probe.text}" if kind == "op" else f"{probe.text} {name}{at}"


# ---- running ---------------------------------------------------------------------------------
def _analysis_command(spec: dict[str, Any]) -> tuple[str, str]:
    kind = spec.get("type")
    if kind == "op":
        return "op", "op"
    if kind == "tran":
        if spec.get("stop") is None:
            raise SimulationError("a tran analysis needs stop (the end time, e.g. 10m)")
        stop = parse_value(spec["stop"], "stop")
        step = parse_value(spec["step"], "step") if spec.get("step") is not None else stop / 1000
        if stop <= 0 or step <= 0:
            raise SimulationError("tran stop and step must be positive")
        if stop / step > 2_000_000:
            raise SimulationError("tran would need more than 2 million steps; raise step or shorten stop")
        return "tran", f"tran {step:.9g} {stop:.9g}"
    if kind == "ac":
        if spec.get("start") is None or spec.get("stop") is None:
            raise SimulationError("an ac analysis needs start and stop frequencies, e.g. 10 and 1Meg")
        start, stop = parse_value(spec["start"], "start"), parse_value(spec["stop"], "stop")
        sweep = spec.get("sweep", "dec")
        if sweep not in ("dec", "oct", "lin"):
            raise SimulationError("ac sweep must be dec, oct or lin")
        if not 0 < start < stop:
            raise SimulationError("ac needs 0 < start < stop")
        return "ac", f"ac {sweep} {int(spec.get('points', 20))} {start:.9g} {stop:.9g}"
    raise SimulationError(f"analysis type must be one of {', '.join(ANALYSES)}, got {kind!r}")


def simulate(cli: Any, schematic: str, out_dir: str, analyses: list[dict[str, Any]] | None, assertions: list[dict[str, Any]] | None,
             ngspice: str, timeout: float = DEFAULT_TIMEOUT, probes: list[str] | None = None,
             monte_carlo: dict[str, Any] | None = None) -> dict[str, Any]:
    """Export the netlist, run ``analyses`` (default: one operating point) and judge ``assertions``; with ``monte_carlo``
    run it again with the R, C, L (and source) values drawn within their tolerances and report how often each assertion holds."""
    specs = analyses or [{"type": "op"}]
    commands = [_analysis_command(s) for s in specs]
    order = [kind for kind, _ in commands]
    if len(set(order)) != len(order):
        raise SimulationError("run each analysis type at most once per call")
    stem = os.path.splitext(os.path.basename(schematic))[0]
    os.makedirs(out_dir, exist_ok=True)
    raw_netlist = os.path.join(out_dir, f"{stem}.net.cir")
    exported = cli.run("sch", "export", "netlist", "--format", "spice", "-o", raw_netlist, schematic, cwd=os.path.dirname(schematic), check=False)
    output = exported.stdout + "\n" + exported.stderr
    problems = [l.strip() for l in output.splitlines() if re.search(r"error|cannot|could not", l, re.I) and "assert" not in l.lower()]
    if exported.returncode != 0 or problems:
        raise SimulationError("KiCad could not build the SPICE netlist:\n" + "\n".join(dict.fromkeys(problems[:6] or output.strip().splitlines()[-4:])) +
                              "\nCheck Sim.Library / Sim.Name (kicad_sim_model lists what a model file holds).")
    with open(raw_netlist, encoding="utf-8") as fh:
        lines, ignored, modelless = prepare_netlist(fh.read())
    if modelless:
        raise SimulationError(
            f"{', '.join(modelless)} {'has' if len(modelless) == 1 else 'have'} no SPICE model: without Sim.Device KiCad wires a diode's nodes "
            "in symbol pin order (K before A), the reverse of SPICE's, so the result would be wrong. Bind a model with kicad_edit_schematic "
            "set_sim_model: {reference, device: \"D\"} (for an LED also params: \"is=1e-18 n=2 rs=3\"), or {reference, library, name} for a vendor model.")
    notes: list[str] = []
    nodes = netlist_nodes(lines)
    if not any(n in ("0", "gnd") for n in nodes):
        raise SimulationError("the circuit has no ground: connect a power:GND symbol (net GND) or a net named 0 to the circuit, "
                              "SPICE needs a reference node")
    if not any(line[:1].lower() in ("v", "i") for line in (l.strip() for l in lines)) and any(k != "op" for k in order):
        notes.append("there is no voltage or current source; add one from Simulation_SPICE (VDC, VSIN, VPULSE, ...)")
    probe_list = [parse_probe(p) for p in probes or []]
    for a in assertions or []:
        if isinstance(a, dict) and a.get("probe"):
            probe_list.append(parse_probe(a["probe"]))
            if a.get("ref"):
                probe_list.append(parse_probe(a["ref"]))
    saves = sorted({current_vector(p.names[0]) for p in probe_list if p.kind == "i"})
    elements = {line.split()[0].lower() for line in (l.strip() for l in lines) if line and line[0] not in ".*+"}
    for p in probe_list:
        if p.kind == "i" and p.names[0].lower() not in elements:
            raise SimulationError(f"{p.text}: no element {p.names[0]} in the circuit (elements: {', '.join(sorted(e.upper() for e in elements))})")

    if monte_carlo is not None and not assertions:
        raise SimulationError("monte_carlo judges how often each assertion holds: give assertions")
    cwd = os.path.dirname(schematic)
    results, log_text, deck, log = _run_deck(ngspice, lines, stem, out_dir, commands, order, saves, cwd, timeout)
    summary = {"analyses": [_summarize(kind, results[kind], nodes) for kind in order]}
    judged = [evaluate(a, results, set(nodes), order) for a in assertions or []]
    out: dict[str, Any] = {
        "path": schematic, "ngspice": ngspice_version(ngspice), "netlist": deck, "log": log, **summary,
        "assertions": judged, "passed": all(a["passed"] for a in judged) if judged else None,
        "ignored": ignored, "notes": notes,
    }
    warnings = _warnings(log_text)
    if warnings:
        out["warnings"] = warnings
    if monte_carlo is not None:
        mc = _monte_carlo(ngspice, lines, stem, out_dir, commands, order, saves, cwd, timeout, nodes, assertions or [], monte_carlo)
        out["monte_carlo"] = mc
        out["passed"] = bool(out["passed"] and mc["passed"])
    return out


def _run_deck(ngspice: str, lines: list[str], stem: str, out_dir: str, commands: list[tuple[str, str]], order: list[str],
              saves: list[str], cwd: str, timeout: float) -> tuple[dict[str, dict[str, Any]], str, str, str]:
    """Write the deck (netlist + control block) into ``out_dir``, run ngspice, and parse each analysis' rawfile."""
    deck = os.path.join(out_dir, f"{stem}.cir")
    log = os.path.join(out_dir, f"{stem}.log")
    raws = {kind: os.path.join(out_dir, f"{stem}.{kind}.raw") for kind in order}
    for path in (*raws.values(), log):
        if os.path.exists(path):
            os.remove(path)
    control = ["", ".control", "set filetype=ascii", "set noaskquit"]
    if saves:
        control.append("save all " + " ".join(saves))
    for kind, command in commands:
        control += [command, f"write {_quote(raws[kind])} all"]
    control += ["quit", ".endc", ".end", ""]
    body = list(lines)
    if body and not body[0].lower().startswith(".title") and not body[0].startswith("*"):
        body.insert(0, f".title {stem}")
    with open(deck, "w", encoding="utf-8") as fh:
        fh.write("\n".join(body + control))
    try:
        proc = subprocess.run([ngspice, "-b", "-o", log, deck], cwd=cwd, capture_output=True, text=True,
                              timeout=min(max(timeout, 1.0), MAX_TIMEOUT), stdin=subprocess.DEVNULL)
    except subprocess.TimeoutExpired as exc:
        raise SimulationError(f"ngspice did not finish within {timeout:g} s (a transient with a very small step, or a circuit that does not converge); "
                              "raise timeout or simulate a shorter time") from exc
    except OSError as exc:
        raise SimulationError(f"cannot run {ngspice}: {exc}") from exc
    log_text = _read(log) or (proc.stdout + proc.stderr)
    missing = [k for k, p in raws.items() if not os.path.isfile(p)]
    if missing:
        raise SimulationError(_failure(log_text, missing, deck))
    return {kind: parse_raw(_read(path)) for kind, path in raws.items()}, log_text, deck, log


# ---- Monte Carlo -----------------------------------------------------------------------------
DEFAULT_TOLERANCES = {"R": 5.0, "C": 10.0, "L": 10.0}  # percent: ordinary 5 % resistors, 10 % capacitors and inductors
MAX_RUNS = 500
DEFAULT_RUNS = 50


def _percent(value: Any, what: str) -> float:
    if isinstance(value, str) and value.strip().endswith("%"):
        value = value.strip()[:-1]
    pct = parse_value(value, what)
    if not 0 <= pct <= 100:
        raise SimulationError(f"{what} {value!r} must be between 0 and 100 (percent)")
    return pct


def varying_elements(lines: list[str]) -> dict[str, tuple[int, int, float]]:
    """``{REF: (line index, token index, nominal)}`` for what a Monte Carlo run can vary: the value of R, C and L, and the DC level of V and I sources."""
    found: dict[str, tuple[int, int, float]] = {}
    for i, line in enumerate(lines):
        s = line.strip()
        if not s or s[0] in ".*+":
            continue
        tokens = s.split()
        letter = tokens[0][0].upper()
        index = None
        if letter in "RCL" and len(tokens) >= 4:
            index = 3
        elif letter in "VI":
            index = next((j + 1 for j, t in enumerate(tokens) if t.upper() == "DC" and j + 1 < len(tokens)), None)
        if index is None:
            continue
        try:
            found[tokens[0].upper()] = (i, index, parse_value(tokens[index]))
        except SimulationError:
            continue  # a model name or an expression: not a plain number
    return found


def _monte_carlo(ngspice: str, lines: list[str], stem: str, out_dir: str, commands: list[tuple[str, str]], order: list[str], saves: list[str],
                 cwd: str, timeout: float, nodes: dict[str, str], assertions: list[dict[str, Any]], spec: dict[str, Any]) -> dict[str, Any]:
    import random
    import tempfile
    import time

    runs = int(spec.get("runs", DEFAULT_RUNS))
    if not 2 <= runs <= MAX_RUNS:
        raise SimulationError(f"monte_carlo runs must be between 2 and {MAX_RUNS}")
    seed = int(spec.get("seed", 1))
    distribution = spec.get("distribution", "uniform")
    if distribution not in ("uniform", "gaussian"):
        raise SimulationError("monte_carlo distribution must be uniform (within ±tolerance) or gaussian (3σ = tolerance)")
    min_rate = float(spec.get("min_pass_rate", 1.0))
    if not 0 < min_rate <= 1:
        raise SimulationError("monte_carlo min_pass_rate must be in (0, 1]")
    tolerances = {k: v for k, v in DEFAULT_TOLERANCES.items()}
    for key, value in (spec.get("tolerances") or {}).items():
        tolerances[str(key).upper()] = _percent(value, f"tolerance for {key}")
    elements = varying_elements(lines)
    plan: dict[str, float] = {}  # REF → percent
    for ref in elements:
        pct = tolerances.get(ref, tolerances.get(ref[0]))
        if pct:
            plan[ref] = pct
    for key in tolerances:
        if len(key) > 1 and key not in elements:
            raise SimulationError(f"tolerance for {key}: no such element with a plain value in the circuit "
                                  f"(variable: {', '.join(sorted(elements)) or 'none'})")
    if not plan:
        raise SimulationError("monte_carlo found nothing to vary: no R, C or L value (or V/I DC level) has a tolerance")
    rng = random.Random(seed)
    stats: list[dict[str, Any]] = [{"values": [], "passes": 0, "first_failure": None} for _ in assertions]
    started = time.monotonic()
    done = 0
    with tempfile.TemporaryDirectory(prefix="mc-", dir=out_dir) as scratch:
        for run in range(1, runs + 1):
            remaining = timeout - (time.monotonic() - started)
            if remaining <= 0:
                raise SimulationError(f"Monte Carlo used the whole {timeout:g} s budget after {done} of {runs} runs; raise timeout or lower runs")
            varied: dict[str, float] = {}
            current = list(lines)
            for ref, pct in plan.items():
                i, j, nominal = elements[ref]
                spread = pct / 100
                delta = rng.uniform(-spread, spread) if distribution == "uniform" else max(-spread, min(spread, rng.gauss(0, spread / 3)))
                varied[ref] = nominal * (1 + delta)
                tokens = current[i].split()
                tokens[j] = repr(varied[ref])
                current[i] = " ".join(tokens)
            results, _, _, _ = _run_deck(ngspice, current, stem, scratch, commands, order, saves, cwd, min(remaining, MAX_TIMEOUT))
            done += 1
            for slot, assertion in zip(stats, assertions):
                judged = evaluate(assertion, results, set(nodes), order)
                slot["values"].append(judged["value"])
                slot["judged"] = judged
                if judged["passed"]:
                    slot["passes"] += 1
                elif slot["first_failure"] is None:
                    slot["first_failure"] = {"run": run, "value": judged["value"], "varied": {k: float(f"{v:.6g}") for k, v in varied.items()}}
    rows = []
    for slot in stats:
        values = slot["values"]
        judged = slot["judged"]
        mean = sum(values) / len(values)
        stdev = math.sqrt(sum((v - mean) ** 2 for v in values) / (len(values) - 1))
        rate = slot["passes"] / runs
        rows.append({"name": judged["name"], "probe": judged["probe"], "unit": judged["unit"], "min_required": judged["min"], "max_required": judged["max"],
                     "passes": slot["passes"], "runs": runs, "pass_rate": rate, "min": min(values), "mean": mean, "max": max(values), "stdev": stdev,
                     "passed": rate >= min_rate, **({"first_failure": slot["first_failure"]} if slot["first_failure"] else {})})
    return {"runs": runs, "seed": seed, "distribution": distribution, "min_pass_rate": min_rate,
            "tolerances": {k: v for k, v in sorted(plan.items())}, "varied": sorted(plan),
            "assertions": rows, "passed": all(r["passed"] for r in rows)}


def _quote(path: str) -> str:
    return '"' + path.replace('"', "") + '"' if " " in path else path


def _read(path: str) -> str:
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            return fh.read()
    except OSError:
        return ""


def _warnings(log: str) -> list[str]:
    found = [l.strip() for l in log.splitlines() if re.match(r"\s*warning", l, re.I)]
    return found[:10]


def _failure(log: str, missing: list[str], deck: str) -> str:
    errors = [l.strip() for l in log.splitlines() if re.search(r"error|singular|no such|unknown|could not|doesn't converge|failed", l, re.I)]
    head = "ngspice did not produce results for " + ", ".join(missing) + "."
    detail = "\n".join(dict.fromkeys(errors[:12])) or "\n".join(log.strip().splitlines()[-12:])
    hints = []
    low = log.lower()
    if "singular matrix" in low or "no dc path" in low or "floating" in low:
        hints.append("A net has no DC path to ground (floating node, e.g. a capacitor-only net or a part without a SPICE model): "
                     "connect it, or give the part a model.")
    if "unknown subckt" in low or "could not find a valid modelname" in low or "model" in low and "not" in low:
        hints.append("A part has no usable SPICE model: set its Sim.Device/Sim.Library (or remove it from the simulated circuit).")
    return f"{head}\n{detail}\n" + ("\n".join(hints) + "\n" if hints else "") + f"Deck: {deck}"


def _summarize(kind: str, raw: dict[str, Any], nodes: dict[str, str]) -> dict[str, Any]:
    vectors = raw["vectors"]
    if kind == "op":  # an operating point has no scale: every vector is a result
        names = [n for n in vectors if "." not in n]  # x1.n1, b.x1.b1#branch: a subcircuit's insides
        values = {_label(n, nodes): _real(vectors[n][0]) for n in names}
        return {"type": "op", "values": values}
    names = [n for n in vectors if n != raw["scale_name"] and "." not in n]
    if kind == "tran":
        signals = {}
        for n in names[:60]:
            ys = [_real(y) for y in vectors[n]]
            signals[_label(n, nodes)] = {"initial": ys[0], "final": ys[-1], "min": min(ys), "max": max(ys)}
        scale = [_real(x) for x in raw["scale"]]
        return {"type": "tran", "points": raw["points"], "stop": scale[-1], "signals": signals}
    scale = [_real(x) for x in raw["scale"]]
    return {"type": "ac", "points": raw["points"], "start": scale[0], "stop": scale[-1]}


def _label(vector: str, nodes: dict[str, str]) -> str:
    if vector.endswith("#branch"):
        return f"I({vector[:-7].upper()})"
    match = re.fullmatch(r"@([a-z0-9_]+)\[(\w+)\]", vector)
    if match:
        return f"I({match.group(1).upper()})"
    return f"V({nodes.get(vector, vector).lstrip('/')})"


def _real(x: Any) -> float:
    return float(x.real if isinstance(x, complex) else x)
