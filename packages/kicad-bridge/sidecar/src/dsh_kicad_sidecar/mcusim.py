"""Firmware simulation against the board: run a firmware image on the simulated chip (avr.py) while the schematic around it is a
resistive network. Buttons are switches the scenario presses, LEDs are lit or dark by the voltage across them, and what the chip
reads on an input is whatever the network (pull-ups, switches, other resistors) makes of the pin. The verdict on every assertion
comes from this simulation, never from the model.

What the board model is: a DC network of resistors, closed switches, the chip's pin drivers (40 Ω) and internal pull-ups (35 kΩ),
rails and ground. LEDs, capacitors and anything else are open circuits (an LED only reports whether it would light). Parts it
does not model on a net the chip touches are listed in the result.
"""

from __future__ import annotations

import bisect
import re
import time
from typing import Any

from . import avr as avrmod
from .avr import Avr, AvrError, Unsupported, load_firmware
from .mcu import Circuit, _gpio_of, short_name
from .spice import SimulationError, parse_value

__all__ = ["simulate_firmware", "Board", "solve"]

OUT_OHMS = 40.0          # an AVR pin driver
PULLUP_OHMS = 35_000.0   # the internal pull-up, 20-50 kΩ
SWITCH_OHMS = 0.05
VIH, VIL = 0.6, 0.3      # logic thresholds as a fraction of VCC
PIN_WARN_A, PIN_ERROR_A = 0.020, 0.040
MAX_SECONDS = 5.0
DEFAULT_DURATION = 0.1
_CHUNK = 20_000


# ---- the resistive network -------------------------------------------------------------------
def solve(nets: list[str], fixed: dict[str, float], edges: list[tuple[str, str, float]], sources: list[tuple[str, float, float]]) -> dict[str, float | None]:
    """Node voltages. ``fixed``: nets held at a voltage; ``edges``: resistors ``(a, b, ohms)``; ``sources``: ``(net, volts, ohms)`` Thévenin
    sources. A net with no path to any fixed net or source floats: ``None``."""
    # connectivity: which free nets reach a voltage source
    parent: dict[str, str] = {n: n for n in nets}

    def find(x: str) -> str:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for a, b, _ in edges:
        if a in parent and b in parent:
            parent[find(a)] = find(b)
    anchored = {find(n) for n in fixed if n in parent} | {find(n) for n, _, _ in sources if n in parent}
    free = [n for n in nets if n not in fixed and find(n) in anchored]
    index = {n: i for i, n in enumerate(free)}
    size = len(free)
    g = [[0.0] * size for _ in range(size)]
    rhs = [0.0] * size
    for a, b, ohms in edges:
        cond = 1.0 / max(ohms, 1e-6)
        for x, y in ((a, b), (b, a)):
            if x in index:
                g[index[x]][index[x]] += cond
                if y in index:
                    g[index[x]][index[y]] -= cond
                elif y in fixed:
                    rhs[index[x]] += cond * fixed[y]
    for net, volts, ohms in sources:
        if net in index:
            cond = 1.0 / max(ohms, 1e-6)
            g[index[net]][index[net]] += cond
            rhs[index[net]] += cond * volts
    # Gaussian elimination with partial pivoting
    for col in range(size):
        pivot = max(range(col, size), key=lambda r: abs(g[r][col]))
        if abs(g[pivot][col]) < 1e-18:
            raise SimulationError("the board network is singular (this is a bug in the board model)")
        g[col], g[pivot] = g[pivot], g[col]
        rhs[col], rhs[pivot] = rhs[pivot], rhs[col]
        for row in range(col + 1, size):
            factor = g[row][col] / g[col][col]
            if factor:
                for k in range(col, size):
                    g[row][k] -= factor * g[col][k]
                rhs[row] -= factor * rhs[col]
    volts = [0.0] * size
    for row in range(size - 1, -1, -1):
        acc = rhs[row] - sum(g[row][k] * volts[k] for k in range(row + 1, size))
        volts[row] = acc / g[row][row]
    out: dict[str, float | None] = {}
    for n in nets:
        out[n] = fixed[n] if n in fixed else (volts[index[n]] if n in index else None)
    return out


# ---- the board -------------------------------------------------------------------------------
def rail_volts(name: str) -> float | None:
    """``+3V3`` → 3.3, ``+5V`` → 5, ``3.3V`` → 3.3, ``VCC`` → None."""
    n = short_name(name).lstrip("+")
    m = re.fullmatch(r"(\d+)V(\d+)?(?:_\w*)?", n, re.I) or re.fullmatch(r"(\d+)(?:\.(\d+))?V(?:_\w*)?", n, re.I)
    if not m:
        return None
    return float(f"{m.group(1)}.{m.group(2) or 0}")


class Board:
    def __init__(self, netlist: dict[str, Any], ref: str, provider: dict[str, Any], vcc: float | None = None, led_vf: float = 1.8):
        self.circuit = Circuit(netlist)
        self.ref = ref
        self.led_vf = led_vf
        self.notes: list[str] = []
        c = self.circuit
        self.pin_names: dict[tuple[str, str], str] = {}
        for net in netlist["nets"]:
            for node in net["nodes"]:
                if node.get("pin_function"):
                    self.pin_names[(node["ref"], node["pin"])] = node["pin_function"].rsplit("_", 1)[0]
        self.pins: dict[int, str] = {}   # chip pin bit → net
        self.supply_net: str | None = None
        for pin, net in c.by_ref.get(ref, []):
            name = self.pin_names.get((ref, pin), "")
            bit = _gpio_of(provider, name)
            if bit is not None and 0 <= bit < 6:
                self.pins[bit] = net
            elif name.upper() == "VCC":
                self.supply_net = net
        self.nets = [n["name"] for n in netlist["nets"]]
        self.fixed: dict[str, float] = {}
        guessed = vcc if vcc is not None else (rail_volts(self.supply_net) if self.supply_net else None)
        if guessed is None:
            guessed = 5.0
            self.notes.append("the supply voltage is not in the net name or the vcc argument: assumed 5 V")
        self.vcc = guessed
        for n in self.nets:
            kind = c.kind(n)
            if kind == "ground":
                self.fixed[n] = 0.0
            elif kind == "rail":
                self.fixed[n] = self.vcc if n == self.supply_net else (rail_volts(n) or self.vcc)
        if self.supply_net:
            self.fixed.setdefault(self.supply_net, self.vcc)
        self.resistors: list[tuple[str, str, float, str]] = []
        self.switches: dict[str, tuple[str, str]] = {}
        self.leds: dict[str, tuple[str, str]] = {}
        modelled = {ref}
        for r, comp in c.components.items():
            lib = comp.get("lib_id", "")
            ends = c.by_ref.get(r, [])
            if r.startswith("R") and lib.startswith("Device:R") and len(ends) == 2:
                try:
                    ohms = parse_value(comp.get("value", ""))
                except SimulationError:
                    continue
                if ends[0][1] != ends[1][1]:
                    self.resistors.append((ends[0][1], ends[1][1], ohms, r))
                modelled.add(r)
            elif (r.startswith("SW") or lib.startswith("Switch:SW")) and len(ends) == 2:
                self.switches[r] = (ends[0][1], ends[1][1])
                modelled.add(r)
            elif lib.startswith("Device:LED") and len(ends) == 2:
                names = {self.pin_names.get((r, p), ""): n for p, n in ends}
                if "A" in names and "K" in names:
                    self.leds[r] = (names["A"], names["K"])
                    modelled.add(r)
            elif lib.startswith("Device:C") or lib.startswith("power:") or r.startswith("#"):
                modelled.add(r)
        self.unmodelled = self._unmodelled(modelled)

    def _unmodelled(self, modelled: set[str]) -> list[str]:
        """Parts on a net the chip touches (or one step away through a resistor or switch) that this model does not simulate."""
        reach = set(self.pins.values())
        for _ in range(2):
            for a, b, _, _ in self.resistors:
                if a in reach or b in reach:
                    reach |= {a, b}
            for a, b in self.switches.values():
                if a in reach or b in reach:
                    reach |= {a, b}
        found = set()
        for n in reach:
            for node in self.circuit.nets[n]["nodes"]:
                if node["ref"] not in modelled and not self.circuit.components.get(node["ref"], {}).get("lib_id", "").startswith("power:"):
                    found.add(node["ref"])
        return sorted(found)

    # ---- state → voltages ----
    def solve(self, avr: Avr, closed: set[str], forced: dict[str, float | None]) -> dict[str, Any]:
        edges = [(a, b, ohms) for a, b, ohms, _ in self.resistors]
        edges += [(a, b, SWITCH_OHMS) for r, (a, b) in self.switches.items() if r in closed]
        sources: list[tuple[str, float, float]] = []
        drivers: dict[int, tuple[float, float]] = {}
        for bit, net in self.pins.items():
            if avr.pin_driven(bit):
                level = self.vcc if avr.pin_out_level(bit) else 0.0
                sources.append((net, level, OUT_OHMS))
                drivers[bit] = (level, OUT_OHMS)
            elif avr.pin_pullup(bit):
                sources.append((net, self.vcc, PULLUP_OHMS))
        fixed = dict(self.fixed)
        for net, level in forced.items():  # an external drive is an ideal source (it also overrides a rail)
            if level is not None:
                fixed[net] = level
        volts = solve(self.nets, fixed, edges, sources)
        currents = {}
        for bit, (level, ohms) in drivers.items():
            v = volts.get(self.pins[bit])
            currents[bit] = abs(level - v) / ohms if v is not None else 0.0
        return {"volts": volts, "currents": currents}

    def logic(self, volts: float | None) -> int | None:
        if volts is None:
            return None
        if volts >= VIH * self.vcc:
            return 1
        if volts <= VIL * self.vcc:
            return 0
        return None

    def led_states(self, volts: dict[str, float | None]) -> dict[str, bool | None]:
        out: dict[str, bool | None] = {}
        for r, (a, k) in self.leds.items():
            va, vk = volts.get(a), volts.get(k)
            out[r] = False if va is None or vk is None else (va - vk) >= self.led_vf  # a floating end carries no current: dark
        return out


# ---- the scenario ----------------------------------------------------------------------------
def _seconds(value: Any, what: str) -> float:
    t = parse_value(value, what)
    if t < 0:
        raise SimulationError(f"{what} {value!r} is negative")
    return t


def _net_name(board: Board, text: str) -> str:
    wanted = text.lstrip("/").lower()
    for n in board.nets:
        if n.lower() == text.lower() or short_name(n).lower() == wanted:
            return n
    raise SimulationError(f"no net named {text}; nets on the chip: " + ", ".join(sorted(short_name(n) for n in board.pins.values())))


def _pin_bit(text: str) -> int:
    m = re.fullmatch(r"(?:\w+:)?PB(\d)", text.strip(), re.I)
    if not m or int(m.group(1)) > 5:
        raise SimulationError(f"pin {text!r}: use PB0-PB5, e.g. PB4 or U1:PB4")
    return int(m.group(1))


class Run:
    """One simulation: the chip, the board, the stimuli and the recorded timeline."""

    def __init__(self, avr: Avr, board: Board, initial_closed: set[str]):
        self.avr, self.board = avr, board
        self.closed = set(initial_closed)
        self.forced: dict[str, float | None] = {}
        self.timeline: list[dict[str, Any]] = []
        self.times: list[float] = []
        self.hazards: dict[tuple[str, int | str], dict[str, Any]] = {}
        self.undefined: dict[int, float] = {}
        self.last_volts: dict[str, float | None] = {}
        avr.vcc_volts = board.vcc
        avr.adc_input = self.pin_volts
        avr.on_pin_change = self.update
        self.update()

    def pin_volts(self, bit: int) -> float | None:
        """What the ADC sees on a pin: the solved voltage of its net (None: the net floats)."""
        net = self.board.pins.get(bit)
        return None if net is None else self.last_volts.get(net)

    def update(self, stamp: float | None = None) -> None:
        """Resolve the board and record the state; ``stamp`` is the exact time of a stimulus (the chip may be a few cycles past it)."""
        avr, board = self.avr, self.board
        result = board.solve(avr, self.closed, self.forced)
        volts = result["volts"]
        self.last_volts = volts
        levels: list[int | None] = [None] * 6
        for bit, net in board.pins.items():
            if avr.pin_driven(bit):
                continue
            level = board.logic(volts.get(net))
            levels[bit] = level
            if level is None and volts.get(net) is not None:
                self.undefined.setdefault(bit, avr.now())
        t = avr.now() if stamp is None else max(stamp, self.times[-1] if self.times else 0.0)
        for bit, amps in result["currents"].items():
            if amps > PIN_WARN_A:
                severity = "error" if amps > PIN_ERROR_A else "warning"
                key = ("overcurrent", bit)
                if key not in self.hazards or severity == "error" and self.hazards[key]["severity"] != "error":
                    net = short_name(board.pins[bit])
                    self.hazards[key] = {"severity": severity, "rule": "overcurrent", "pin": f"PB{bit}", "net": net, "t": t,
                                         "message": f"PB{bit} drives {amps * 1000:.0f} mA into net {net} (the ATtiny85 allows 20 mA per pin, 40 mA absolute): "
                                                    "an output fighting a switch or a short to the opposite rail"}
        avr.set_inputs(levels)
        snap = {
            "t": t,
            "pins": {f"PB{b}": ("out-high" if avr.pin_out_level(b) else "out-low") if avr.pin_driven(b) else ("in-pullup" if avr.pin_pullup(b) else "in") for b in board.pins},
            "nets": {short_name(n): (None if volts[n] is None else round(volts[n], 3)) for n in sorted(set(board.pins.values()))},
            "leds": board.led_states(volts),
            "switches": sorted(self.closed),
            "_volts": volts,
        }
        key = (tuple(sorted(snap["pins"].items())), tuple(sorted((k, v) for k, v in snap["nets"].items())), tuple(sorted(snap["leds"].items())), tuple(snap["switches"]))
        if self.timeline and self.timeline[-1].get("_key") == key:
            return
        snap["_key"] = key
        if self.timeline and self.timeline[-1]["t"] == t:
            self.timeline[-1] = snap  # several changes in the same instant: the last one stands
        else:
            self.timeline.append(snap)
            self.times.append(t)
        self.times[-1] = snap["t"]

    def state_at(self, t: float) -> dict[str, Any]:
        i = bisect.bisect_right(self.times, t + 1e-12) - 1
        return self.timeline[max(i, 0)]

    def segments(self, start: float, end: float) -> list[tuple[float, float, dict[str, Any]]]:
        """The piecewise-constant states overlapping ``(start, end]``."""
        out = []
        for i, snap in enumerate(self.timeline):
            lo = snap["t"]
            hi = self.timeline[i + 1]["t"] if i + 1 < len(self.timeline) else float("inf")
            if hi > start and lo < end + 1e-12 and hi > lo:
                out.append((max(lo, start), min(hi, end), snap))
        return out


def _measure(board: Board, snap: dict[str, Any], a: dict[str, Any]) -> tuple[Any, str]:
    """``(value, label)`` of an assertion's subject in a state."""
    volts = snap["_volts"]
    if "led" in a:
        ref = a["led"]
        if ref not in board.leds:
            raise SimulationError(f"no LED {ref} in the circuit (LEDs: {', '.join(sorted(board.leds)) or 'none'})")
        state = snap["leds"].get(ref)
        return (None if state is None else ("on" if state else "off")), f"LED {ref}"
    if "pin" in a:
        bit = _pin_bit(a["pin"])
        if bit not in board.pins:
            raise SimulationError(f"PB{bit} is not connected to anything")
        return _level_or_volts(board, volts[board.pins[bit]], a), f"PB{bit}"
    if "net" in a:
        net = _net_name(board, a["net"])
        return _level_or_volts(board, volts.get(net), a), short_name(net)
    raise SimulationError("each assertion needs led, pin or net")


def _level_or_volts(board: Board, v: float | None, a: dict[str, Any]) -> Any:
    if "min" in a or "max" in a:
        return v
    logic = board.logic(v)
    return None if logic is None else ("high" if logic else "low")


def _holds(value: Any, a: dict[str, Any]) -> bool | None:
    if value is None:
        return False
    if "led" in a:
        return value == a.get("is", "on")
    if "min" in a or "max" in a:
        lo = parse_value(a["min"], "min") if "min" in a else None
        hi = parse_value(a["max"], "max") if "max" in a else None
        return (lo is None or value >= lo) and (hi is None or value <= hi)
    return value == a.get("level", a.get("is"))


def _judge(run: Run, a: dict[str, Any], names: dict[str, float], abort_at: float | None, end: float) -> dict[str, Any]:
    board = run.board
    if not isinstance(a, dict):
        raise SimulationError("each assertion is an object")
    want = a.get("is") or a.get("level") or (f"{a.get('min', '')}..{a.get('max', '')}" if ("min" in a or "max" in a) else ("on" if "led" in a else None))
    if want is None:
        raise SimulationError(f"assertion {a}: give is (led: on|off), level (pin/net: high|low) or min/max (volts)")
    if "led" in a and a.get("is", "on") not in ("on", "off"):
        raise SimulationError("an LED assertion's is must be on or off")
    if ("pin" in a or "net" in a) and "min" not in a and "max" not in a and a.get("level", a.get("is")) not in ("high", "low"):
        raise SimulationError("a pin or net assertion's level must be high or low (or give min/max in volts)")
    _, label = _measure(board, run.timeline[0], a)
    name = a.get("name") or f"{label} {'is' if 'led' in a else ''} {want}".replace("  ", " ")

    def time_of(value: Any, what: str) -> float:
        if isinstance(value, str) and value in names:
            return names[value]
        return _seconds(value, what)

    if "at" in a:
        t0 = t1 = time_of(a["at"], "at")
        text = f"at {a['at']}"
    elif "within" in a:
        if "after" not in a:
            raise SimulationError(f"assertion {name!r}: within needs after (a time or a stimulus name), e.g. {{after: \"press\", within: \"20ms\"}}")
        t0 = time_of(a["after"], "after")
        t1 = t0 + _seconds(a["within"], "within")
        text = f"within {a['within']} after {a['after']}"
    elif "to" in a or "from" in a:
        if "to" not in a or "from" not in a:
            raise SimulationError(f"assertion {name!r}: a window needs from and to")
        t0, t1 = time_of(a["from"], "from"), time_of(a["to"], "to")
        text = f"from {a['from']} to {a['to']}"
    else:
        raise SimulationError(f"assertion {name!r}: say when: at, or after + within, or from + to")
    result = {"name": name, "when": text, "t0": t0, "t1": t1}
    if abort_at is not None and t1 > abort_at:
        return {**result, "passed": None, "reason": f"cannot verify: the simulation stopped at {abort_at * 1000:.3f} ms"}
    if t1 > end + 1e-12:
        raise SimulationError(f"assertion {name!r} looks at {t1 * 1000:g} ms but the simulation ends at {end * 1000:g} ms: raise duration")
    if "at" in a:
        value, _ = _measure(board, run.state_at(t0), a)
        ok = _holds(value, a)
        return {**result, "passed": bool(ok), "value": value, **({} if ok else {"reason": f"it was {value} at {t0 * 1000:g} ms, expected {want}"})}
    segments = run.segments(t0, t1)
    values = [(lo, hi, _measure(board, snap, a)[0]) for lo, hi, snap in segments]
    if "within" in a:
        # The state in effect at the start is the board's old state (the firmware has not reacted yet): it does not count as a response
        # unless it holds for the whole window; a state that begins inside the window and holds does.
        hit = next(((lo, v) for lo, hi, v in values if lo > t0 + 1e-12 and _holds(v, a)), None)
        if hit is None and values and all(_holds(v, a) for _, _, v in values):
            hit = (values[0][0], values[0][2])
        if hit:
            return {**result, "passed": True, "value": hit[1], "first_at": hit[0]}
        seen = ", ".join(sorted({str(v) for _, _, v in values}))
        return {**result, "passed": False, "value": values[-1][2] if values else None, "reason": f"never {want} in that window (it was {seen})"}
    bad = next(((lo, v) for lo, hi, v in values if not _holds(v, a)), None)
    if bad:
        return {**result, "passed": False, "value": bad[1], "reason": f"it was {bad[1]} from {bad[0] * 1000:g} ms, expected {want} throughout"}
    return {**result, "passed": True, "value": values[0][2] if values else None}


def simulate_firmware(netlist: dict[str, Any], mcu_ref: str, provider: dict[str, Any], firmware: str, stimuli: list[dict[str, Any]] | None,
                      assertions: list[dict[str, Any]] | None, duration: Any = None, clock_hz: Any = None, vcc: Any = None, led_vf: Any = None,
                      initial: dict[str, str] | None = None, timeout: float = 60.0) -> dict[str, Any]:
    try:
        flash = load_firmware(firmware)
    except (OSError, AvrError) as exc:
        raise SimulationError(f"cannot load firmware {firmware}: {exc}") from exc
    clock = int(parse_value(clock_hz, "clock_hz")) if clock_hz is not None else 1_000_000
    if clock <= 0 or clock > 20_000_000:
        raise SimulationError("clock_hz must be between 1 and 20000000")
    end = _seconds(duration, "duration") if duration is not None else DEFAULT_DURATION
    if not 0 < end <= MAX_SECONDS:
        raise SimulationError(f"duration must be between 0 and {MAX_SECONDS:g} s")
    board = Board(netlist, mcu_ref, provider, vcc=parse_value(vcc, "vcc") if vcc is not None else None,
                  led_vf=parse_value(led_vf, "led_vf") if led_vf is not None else 1.8)
    if not board.pins:
        raise SimulationError(f"{mcu_ref} has no pin connected to a PB0-PB5 net")
    closed = set()
    for ref, state in (initial or {}).items():
        if ref not in board.switches:
            raise SimulationError(f"initial: no switch {ref} (switches: {', '.join(sorted(board.switches)) or 'none'})")
        if state not in ("open", "closed"):
            raise SimulationError("initial switch state must be open or closed")
        if state == "closed":
            closed.add(ref)
    chip = Avr(flash, clock)
    run = Run(chip, board, closed)
    events: list[tuple[float, int, dict[str, Any]]] = []
    names: dict[str, float] = {}
    for i, s in enumerate(stimuli or []):
        if not isinstance(s, dict) or "at" not in s:
            raise SimulationError("each stimulus needs at, e.g. {at: \"50ms\", press: \"SW1\"}")
        t = _seconds(s["at"], "at")
        kinds = [k for k in ("press", "release", "toggle", "drive") if k in s]
        if len(kinds) != 1:
            raise SimulationError(f"stimulus {s}: give exactly one of press, release, toggle, drive")
        kind = kinds[0]
        if kind == "drive":
            net = _net_name(board, s["drive"])
            if s.get("level") not in ("high", "low", "release"):
                try:
                    parse_value(s.get("level"), "level")
                except SimulationError:
                    raise SimulationError("drive needs level: high, low, release, or a voltage such as 2.7 or \"3.3V\"") from None
        elif s[kind] not in board.switches:
            raise SimulationError(f"stimulus {s}: no switch {s[kind]} (switches: {', '.join(sorted(board.switches)) or 'none'})")
        if t > end:
            raise SimulationError(f"stimulus at {s['at']} is after the end of the simulation ({end * 1000:g} ms)")
        if s.get("name"):
            names[str(s["name"])] = t
        events.append((t, i, s))
    events.sort(key=lambda e: (e[0], e[1]))
    deadline = time.monotonic() + timeout
    aborted: dict[str, Any] | None = None

    def advance(to_t: float) -> None:
        target = chip.cycle_for(to_t)
        while chip.cycle < target:
            if time.monotonic() > deadline:
                raise SimulationError(f"the simulation did not finish within {timeout:g} s of wall-clock time (reached {chip.now() * 1000:.1f} ms of {end * 1000:g} ms); "
                                      "shorten duration, use a lower clock_hz, or let the firmware sleep")
            chip.run(min(target, chip.cycle + _CHUNK))

    try:
        for t, _, s in events:
            advance(t)
            if "drive" in s:
                net = _net_name(board, s["drive"])
                level = s["level"]
                run.forced[net] = {"high": board.vcc, "low": 0.0, "release": None}[level] if level in ("high", "low", "release") else parse_value(level, "level")
            elif "press" in s:
                run.closed.add(s["press"])
            elif "release" in s:
                run.closed.discard(s["release"])
            else:
                run.closed.symmetric_difference_update({s["toggle"]})
            run.update(stamp=t)
        advance(end)
    except Unsupported as exc:
        aborted = {"what": exc.what, "reason": str(exc), "t": chip.now()}
    except AvrError as exc:
        aborted = {"what": "fault", "reason": str(exc), "t": chip.now()}
    abort_at = aborted["t"] if aborted else None
    judged = [_judge(run, a, names, abort_at, end) for a in assertions or []]
    hazards = list(run.hazards.values())
    for bit, cycle in sorted(chip.floating_reads.items()):
        net = short_name(board.pins[bit]) if bit in board.pins else f"PB{bit}"
        hazards.append({"severity": "warning", "rule": "floating_input", "pin": f"PB{bit}", "net": net, "t": cycle / chip.base_clock_hz,
                        "message": f"the firmware reads PB{bit} while net {net} floats (no pull-up, pull-down or driver reaches it): the value is arbitrary",
                        "fix": f"Enable the internal pull-up (PORTB |= 1 << PB{bit}) or add an external pull resistor."})
    for bit, t in sorted(run.undefined.items()):
        if bit in chip.adc_used:
            continue  # an analog level on a pin the ADC samples is what it is for
        net = short_name(board.pins[bit])
        hazards.append({"severity": "warning", "rule": "undefined_level", "pin": f"PB{bit}", "net": net, "t": t,
                        "message": f"PB{bit} (net {net}) sits between the logic levels while it is an input (a divider or a weak pull against a switch): it reads unpredictably",
                        "fix": "Use a stronger pull-up/pull-down or remove the competing path."})
    if board.unmodelled:
        hazards.append({"severity": "info", "rule": "unmodelled_parts", "pin": "", "net": "", "t": 0.0,
                        "message": "not simulated, treated as open circuits: " + ", ".join(board.unmodelled) + " (they touch nets the chip drives or reads)"})
    order = {"error": 0, "warning": 1, "info": 2}
    hazards.sort(key=lambda h: (order[h["severity"]], h["t"]))
    failed = any(j["passed"] is False for j in judged) or any(h["severity"] == "error" for h in hazards)
    unknown = any(j["passed"] is None for j in judged) or aborted is not None
    passed: bool | None = False if failed else (None if unknown else True)
    if not judged and not aborted and not failed:
        passed = True
    events_out = []
    last = None
    for snap in run.timeline[:120]:
        if snap["t"] > end + 1e-9:
            continue
        item = {"t": snap["t"], "pins": snap["pins"], "nets": snap["nets"], "leds": {k: v for k, v in snap["leds"].items() if v is not None}, "switches": snap["switches"]}
        view = (tuple(item["pins"].items()), tuple(item["leds"].items()), tuple(item["switches"]))
        if view != last:
            events_out.append(item)
            last = view
    return {
        "mcu": mcu_ref, "firmware": firmware, "clock_hz": clock, "vcc": board.vcc, "duration": end,
        "cycles": chip.cycle, "instructions": chip.instructions, "simulated_to": chip.now(), "aborted": aborted,
        "assertions": judged, "hazards": hazards, "timeline": events_out, "passed": passed,
        "switches": sorted(board.switches), "leds": sorted(board.leds), "notes": board.notes,
        "pins": {f"PB{b}": short_name(n) for b, n in sorted(board.pins.items())},
    }
