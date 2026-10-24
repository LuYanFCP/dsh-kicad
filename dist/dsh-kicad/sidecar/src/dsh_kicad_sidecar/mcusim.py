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
from .avr import DEVICES, Avr, AvrError, Unsupported, load_image
from .mcu import Circuit, _gpio_of, short_name
from .spice import SimulationError, parse_value

__all__ = ["simulate_firmware", "Board", "solve"]

OUT_OHMS = 40.0          # an AVR pin driver
PULLUP_OHMS = 35_000.0   # the internal pull-up, 20-50 kΩ
RESET_PULLUP_OHMS = 45_000.0  # the RESET pin's own pull-up, 30-60 kΩ (always there while the pin is RESET)
RESET_LOW = 0.2          # a RESET voltage below 0.2 VCC resets the chip (datasheet VRST)
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
    GPIOS = 6           # the chip's pins are PB0 .. PB5
    DEFAULT_VCC = 5.0

    def __init__(self, netlist: dict[str, Any], ref: str, provider: dict[str, Any], vcc: float | None = None, led_vf: float = 1.8, rstdisbl: bool = False):
        self.circuit = Circuit(netlist)
        self.ref = ref
        self.rstdisbl = rstdisbl  # the fuse: PB5 is a GPIO, not the RESET pin
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
        supply = self.supply_pin_names(provider)
        for pin, net in c.by_ref.get(ref, []):
            name = self.pin_names.get((ref, pin), "")
            bit = _gpio_of(provider, name)
            if bit is not None and 0 <= bit < self.GPIOS:
                self.pins[bit] = net
            elif name.upper() in supply:
                self.supply_net = net
        self.nets = [n["name"] for n in netlist["nets"]]
        self.fixed: dict[str, float] = {}
        guessed = vcc if vcc is not None else (rail_volts(self.supply_net) if self.supply_net else None)
        if guessed is None:
            guessed = self.DEFAULT_VCC
            self.notes.append(f"the supply voltage is not in the net name or the vcc argument: assumed {self.DEFAULT_VCC:g} V")
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

    def supply_pin_names(self, provider: dict[str, Any]) -> set[str]:
        return {"VCC"}

    def parse_pin(self, text: str) -> int:
        return _pin_bit(text)

    def pin_label(self, bit: int) -> str:
        return f"PB{bit}"

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
        """One DC solution per combination of levels of the PWM pins (a PWM pin is high for a fraction ``duty`` of the time and low
        for the rest), weighted: the average voltage of every net, the fraction of time each LED would light, the worst pin current."""
        edges = [(a, b, ohms) for a, b, ohms, _ in self.resistors]
        edges += [(a, b, SWITCH_OHMS) for r, (a, b) in self.switches.items() if r in closed]
        fixed = dict(self.fixed)
        for net, level in forced.items():  # an external drive is an ideal source (it also overrides a rail)
            if level is not None:
                fixed[net] = level
        static: list[tuple[str, float, float]] = []
        drivers: dict[int, float] = {}
        pwm: dict[int, dict[str, float]] = {}
        for bit, net in self.pins.items():
            if bit == 5 and not self.rstdisbl:  # the RESET pin: only its own pull-up is on the net
                static.append((net, self.vcc, RESET_PULLUP_OHMS))
                continue
            if avr.pin_driven(bit):
                wave = avr.pwm_pin(bit)
                if wave is not None:
                    pwm[bit] = wave
                else:
                    level = self.vcc if avr.pin_out_level(bit) else 0.0
                    static.append((net, level, OUT_OHMS))
                    drivers[bit] = level
            elif avr.pin_pullup(bit):
                static.append((net, self.vcc, PULLUP_OHMS))
        bits = sorted(pwm)
        totals: dict[str, float] = {}
        unknown: set[str] = set()
        leds = {r: 0.0 for r in self.leds}
        currents: dict[int, float] = {}
        for combo in range(1 << len(bits)):
            weight = 1.0
            sources = list(static)
            levels = dict(drivers)
            for i, bit in enumerate(bits):
                high = combo >> i & 1
                weight *= pwm[bit]["duty"] if high else 1.0 - pwm[bit]["duty"]
                levels[bit] = self.vcc if high else 0.0
                sources.append((self.pins[bit], levels[bit], OUT_OHMS))
            if weight <= 0:
                continue
            volts = solve(self.nets, fixed, edges, sources)
            for n, v in volts.items():
                if v is None:
                    unknown.add(n)
                else:
                    totals[n] = totals.get(n, 0.0) + weight * v
            for r, lit in self.led_lit(volts).items():
                leds[r] += weight * lit
            for bit, level in levels.items():
                v = volts.get(self.pins[bit])
                currents[bit] = max(currents.get(bit, 0.0), abs(level - v) / OUT_OHMS if v is not None else 0.0)
        volts_avg = {n: (None if n in unknown else totals.get(n)) for n in self.nets}
        return {"volts": volts_avg, "currents": currents, "leds": leds, "pwm": pwm}

    def logic(self, volts: float | None) -> int | None:
        if volts is None:
            return None
        if volts >= VIH * self.vcc:
            return 1
        if volts <= VIL * self.vcc:
            return 0
        return None

    def led_lit(self, volts: dict[str, float | None]) -> dict[str, bool]:
        out: dict[str, bool] = {}
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


class Timeline:
    """The recorded states of a run: ``timeline`` (snapshots, each in effect until the next) and their ``times``."""

    timeline: list[dict[str, Any]]
    times: list[float]

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


class Run(Timeline):
    """One simulation: the chip, the board, the stimuli and the recorded timeline."""

    RESET_CAUSES = ("any", "external", "watchdog")

    def __init__(self, avr: Avr, board: Board, initial_closed: set[str]):
        self.avr, self.board = avr, board
        self.closed = set(initial_closed)
        self.forced: dict[str, float | None] = {}
        self.timeline: list[dict[str, Any]] = []
        self.times: list[float] = []
        self.hazards: dict[tuple[str, int | str], dict[str, Any]] = {}
        self.undefined: dict[int, float] = {}
        self.last_volts: dict[str, float | None] = {}
        self.initial_eeprom = b""
        self._in_reset = False
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
            if avr.pin_driven(bit) or (bit == 5 and not board.rstdisbl):
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
        pwm = {f"PB{b}": {"duty": round(w["duty"], 4), "hz": round(w["hz"], 3)} for b, w in result["pwm"].items()}

        def pin_state(b: int) -> str:
            if b in result["pwm"]:
                return f"pwm {pwm[f'PB{b}']['duty']:.0%} {pwm[f'PB{b}']['hz']:.0f}Hz"
            if avr.pin_driven(b):
                return "out-high" if avr.pin_out_level(b) else "out-low"
            return "in-pullup" if avr.pin_pullup(b) else "in"

        snap = {
            "t": t,
            "pins": {f"PB{b}": pin_state(b) for b in board.pins},
            "pwm": pwm,
            "nets": {short_name(n): (None if volts[n] is None else round(volts[n], 3)) for n in sorted(set(board.pins.values()))},
            "leds": {r: round(f, 4) for r, f in result["leds"].items()},
            "switches": sorted(self.closed),
            "_volts": volts,
        }
        key = (tuple(sorted(snap["pins"].items())), tuple(sorted((k, v) for k, v in snap["nets"].items())), tuple(sorted(snap["leds"].items())), tuple(snap["switches"]),
               tuple(sorted((k, w["duty"], w["hz"]) for k, w in snap["pwm"].items())), avr.held)
        snap["held"] = avr.held
        if not (self.timeline and self.timeline[-1].get("_key") == key):
            snap["_key"] = key
            if self.timeline and self.timeline[-1]["t"] == t:
                self.timeline[-1] = snap  # several changes in the same instant: the last one stands
            else:
                self.timeline.append(snap)
                self.times.append(t)
            self.times[-1] = snap["t"]
        if not board.rstdisbl and 5 in board.pins and not self._in_reset:
            v = volts.get(board.pins[5])
            asserted = v is not None and v <= RESET_LOW * board.vcc
            if asserted != avr.held:
                self._in_reset = True
                try:
                    avr.set_reset_line(asserted)  # a reset changes the pins: resolve the board again
                    self.update(stamp=stamp)
                finally:
                    self._in_reset = False

    @property
    def chip(self) -> Avr:
        return self.avr


def _led_label(fraction: float) -> str:
    return "on" if fraction >= 0.99 else "off" if fraction <= 0.01 else f"dim {fraction:.0%}"


def _measure(board: Board, snap: dict[str, Any], a: dict[str, Any]) -> tuple[Any, str]:
    """``(value, label)`` of an assertion's subject in a state."""
    volts = snap["_volts"]
    if "led" in a:
        ref = a["led"]
        if ref not in board.leds:
            raise SimulationError(f"no LED {ref} in the circuit (LEDs: {', '.join(sorted(board.leds)) or 'none'})")
        fraction = snap["leds"].get(ref, 0.0)
        return (fraction if "min" in a or "max" in a else _led_label(fraction)), f"LED {ref}"
    if "pin" in a:
        bit = board.parse_pin(a["pin"])
        label = board.pin_label(bit)
        if bit not in board.pins:
            raise SimulationError(f"{label} is not connected to anything")
        wave = snap["pwm"].get(label)
        if "duty" in a:
            if wave:
                return wave["duty"], label
            level = board.logic(volts[board.pins[bit]])
            return (None if level is None else float(level)), label
        if "freq" in a:
            return (wave["hz"] if wave else None), label
        if wave and "min" not in a and "max" not in a:
            return f"pwm {wave['duty']:.0%} at {wave['hz']:.0f} Hz", label
        return _level_or_volts(board, volts[board.pins[bit]], a), label
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
    if "duty" in a:
        return abs(value - parse_value(a["duty"], "duty")) <= (parse_value(a["tol"], "tol") if "tol" in a else 0.02)
    if "freq" in a:
        want = parse_value(a["freq"], "freq")
        return abs(value - want) <= want * (parse_value(a["tol_pct"], "tol_pct") if "tol_pct" in a else 2.0) / 100
    if "min" in a or "max" in a:
        lo = parse_value(a["min"], "min") if "min" in a else None
        hi = parse_value(a["max"], "max") if "max" in a else None
        return (lo is None or value >= lo) and (hi is None or value <= hi)
    if "led" in a:
        return value == a.get("is", "on")
    return value == a.get("level", a.get("is"))


def _time_of(value: Any, what: str, names: dict[str, float]) -> float:
    if isinstance(value, str) and value in names:
        return names[value]
    return _seconds(value, what)


def _within(value: float, lo: Any, hi: Any) -> bool:
    return (lo is None or value >= lo) and (hi is None or value <= hi)


def _judge_logged(run: Run, a: dict[str, Any], names: dict[str, float], abort_at: float | None, end: float) -> dict[str, Any]:
    """Assertions about what the chip logged rather than what a pin did: resets, EEPROM contents, USI transfers."""
    chip = run.chip
    when = a.get("at", a.get("by"))
    t0 = t1 = None
    if "after" in a or "from" in a:
        t0 = _time_of(a.get("after", a.get("from")), "after", names)
        t1 = t0 + _seconds(a["within"], "within") if "within" in a else _time_of(a["to"], "to", names) if "to" in a else None
        if t1 is None:
            raise SimulationError(f"assertion {a}: a window needs within (after a time or a stimulus) or to (from a time)")
    elif when is not None:
        t1 = _time_of(when, "at", names)
    else:
        raise SimulationError(f"assertion {a}: say when: at / by a time, or after + within, or from + to")
    result: dict[str, Any] = {"t0": t0 if t0 is not None else t1, "t1": t1}
    if abort_at is not None and t1 > abort_at:
        name = a.get("name") or str(next(k for k in ("reset", "resets", "eeprom", "usi") if k in a))
        return {**result, "name": name, "when": f"by {t1 * 1000:g} ms", "passed": None, "reason": f"cannot verify: the simulation stopped at {abort_at * 1000:.3f} ms"}
    if t1 > end + 1e-12:
        raise SimulationError(f"assertion {a}: it looks at {t1 * 1000:g} ms but the simulation ends at {end * 1000:g} ms: raise duration")
    if "reset" in a:
        cause = a["reset"]
        if cause not in run.RESET_CAUSES:
            raise SimulationError("reset must be " + ", ".join(run.RESET_CAUSES[:-1]) + " or " + run.RESET_CAUSES[-1])
        hits = [(t, c) for t, c in chip.resets if (cause == "any" or c == cause) and (t0 is None or t > t0) and t <= t1 + 1e-12]
        name = a.get("name") or f"{cause} reset"
        text = f"within {a['within']} after {a.get('after', a.get('from'))}" if "within" in a else f"from {a.get('from')} to {a.get('to')}" if "to" in a else f"by {a.get('at', a.get('by'))}"
        passed = bool(hits)
        return {**result, "name": name, "when": text, "passed": passed, "value": len(hits),
                **({"first_at": hits[0][0]} if hits else {"reason": f"no {cause} reset happened in that window"})}
    if "resets" in a:
        count = sum(1 for t, _ in chip.resets if t <= t1 + 1e-12)
        spec = a["resets"]
        lo, hi = (spec.get("min"), spec.get("max")) if isinstance(spec, dict) else (spec, spec)
        passed = _within(count, lo, hi)
        want = spec if not isinstance(spec, dict) else f"{lo if lo is not None else ''}..{hi if hi is not None else ''}"
        return {**result, "name": a.get("name") or f"resets by {t1 * 1000:g} ms", "when": f"by {t1 * 1000:g} ms", "passed": passed, "value": count,
                **({} if passed else {"reason": f"{count} reset(s) by then, expected {want}"})}
    if "eeprom" in a:
        addr = int(parse_value(a["eeprom"], "eeprom"))
        if not 0 <= addr < len(run.initial_eeprom):
            raise SimulationError(f"EEPROM address {addr} is outside the device's {len(run.initial_eeprom)} bytes")
        value = run.initial_eeprom[addr]
        for t, at, v in chip.eeprom_log:
            if at == addr and t <= t1 + 1e-12:
                value = v
        want = int(parse_value(a["is"], "is")) if "is" in a else None
        if want is None:
            raise SimulationError("an eeprom assertion needs is (the byte it must hold)")
        passed = value == want
        return {**result, "name": a.get("name") or f"EEPROM[{addr}] = {want}", "when": f"at {t1 * 1000:g} ms", "passed": passed, "value": value,
                **({} if passed else {"reason": f"it held {value} (0x{value:02X}) at {t1 * 1000:g} ms, expected {want}"})}
    kind = a["usi"]
    if kind not in ("tx", "rx"):
        raise SimulationError("usi must be tx or rx (the byte sent or received in a transfer)")
    nth = int(a.get("nth", 1))
    transfers = [(t, tx, rx) for t, tx, rx in chip.usi_log if t <= t1 + 1e-12]
    want = int(parse_value(a["is"], "is")) if "is" in a else None
    if want is None:
        raise SimulationError("a usi assertion needs is (the byte)")
    name = a.get("name") or f"USI transfer {nth} {kind} 0x{want:02X}"
    if len(transfers) < nth:
        return {**result, "name": name, "when": f"by {t1 * 1000:g} ms", "passed": False, "value": None,
                "reason": f"only {len(transfers)} USI transfer(s) completed by {t1 * 1000:g} ms, expected at least {nth}"}
    value = transfers[nth - 1][1 if kind == "tx" else 2]
    return {**result, "name": name, "when": f"by {t1 * 1000:g} ms", "passed": value == want, "value": value,
            **({} if value == want else {"reason": f"transfer {nth} {kind} was 0x{value:02X}, expected 0x{want:02X}"})}


def _judge(run: Run, a: dict[str, Any], names: dict[str, float], abort_at: float | None, end: float) -> dict[str, Any]:
    board = run.board
    if not isinstance(a, dict):
        raise SimulationError("each assertion is an object")
    if any(k in a for k in ("reset", "resets", "eeprom", "usi")):
        return _judge_logged(run, a, names, abort_at, end)
    want = (f"duty {a['duty']}" if "duty" in a else f"{a['freq']} Hz" if "freq" in a else a.get("is") or a.get("level")
            or (f"{a.get('min', '')}..{a.get('max', '')}" if ("min" in a or "max" in a) else ("on" if "led" in a else None)))
    if want is None:
        raise SimulationError(f"assertion {a}: give is (led: on|off), level (pin/net: high|low), duty or freq (a PWM pin), or min/max (volts; for an LED a brightness 0-1)")
    if ("duty" in a or "freq" in a) and "pin" not in a:
        raise SimulationError("duty and freq describe a PWM pin: use pin: \"PB0\"")
    if "led" in a and "min" not in a and "max" not in a and a.get("is", "on") not in ("on", "off"):
        raise SimulationError("an LED assertion's is must be on or off (or give min/max: its brightness between 0 and 1)")
    if ("pin" in a or "net" in a) and not any(k in a for k in ("min", "max", "duty", "freq")) and a.get("level", a.get("is")) not in ("high", "low"):
        raise SimulationError("a pin or net assertion's level must be high or low (or give min/max in volts, or duty / freq for a PWM pin)")
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


def parse_initial(board: Board, initial: dict[str, str] | None) -> set[str]:
    """The switches closed at the start."""
    closed = set()
    for ref, state in (initial or {}).items():
        if ref not in board.switches:
            raise SimulationError(f"initial: no switch {ref} (switches: {', '.join(sorted(board.switches)) or 'none'})")
        if state not in ("open", "closed"):
            raise SimulationError("initial switch state must be open or closed")
        if state == "closed":
            closed.add(ref)
    return closed


def parse_stimuli(board: Board, stimuli: list[dict[str, Any]] | None, end: float,
                  kinds: tuple[str, ...] = ("press", "release", "toggle", "drive", "temperature")) -> tuple[list[tuple[float, int, dict[str, Any]]], dict[str, float]]:
    """``(events in time order, the times of the named ones)``."""
    events: list[tuple[float, int, dict[str, Any]]] = []
    names: dict[str, float] = {}
    for i, s in enumerate(stimuli or []):
        if not isinstance(s, dict) or "at" not in s:
            raise SimulationError("each stimulus needs at, e.g. {at: \"50ms\", press: \"SW1\"}")
        t = _seconds(s["at"], "at")
        given = [k for k in kinds if k in s]
        if len(given) != 1:
            raise SimulationError(f"stimulus {s}: give exactly one of {', '.join(kinds)}")
        kind = given[0]
        if kind == "temperature":
            parse_value(s["temperature"], "temperature")
        elif kind == "drive":
            _net_name(board, s["drive"])
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
    return events, names


def simulate_firmware(netlist: dict[str, Any], mcu_ref: str, provider: dict[str, Any], firmware: str, stimuli: list[dict[str, Any]] | None,
                      assertions: list[dict[str, Any]] | None, duration: Any = None, clock_hz: Any = None, vcc: Any = None, led_vf: Any = None,
                      initial: dict[str, str] | None = None, timeout: float = 60.0, device: str = "attiny85", eeprom: Any = None,
                      usi_input: list[Any] | None = None, temperature: Any = None, rstdisbl: bool = False, startup_ms: Any = None) -> dict[str, Any]:
    try:
        flash, eeprom_image = load_image(firmware, device)
    except (OSError, AvrError) as exc:
        raise SimulationError(f"cannot load firmware {firmware}: {exc}") from exc
    eeprom_size = DEVICES[device]["eeprom"]
    eeprom_bytes = bytearray(eeprom_image if eeprom_image is not None else b"\xff" * eeprom_size)
    for addr, value in (eeprom.items() if isinstance(eeprom, dict) else enumerate(eeprom or [])):
        a_ = int(parse_value(addr, "eeprom address"))
        if not 0 <= a_ < eeprom_size:
            raise SimulationError(f"eeprom: address {a_} is outside the {device}'s {eeprom_size} bytes")
        eeprom_bytes[a_] = int(parse_value(value, "eeprom value")) & 0xFF
    queue = [int(parse_value(b, "usi_input")) & 0xFF for b in usi_input or []]
    celsius = parse_value(temperature, "temperature") if temperature is not None else 25.0
    clock = int(parse_value(clock_hz, "clock_hz")) if clock_hz is not None else 1_000_000
    if clock <= 0 or clock > 20_000_000:
        raise SimulationError("clock_hz must be between 1 and 20000000")
    end = _seconds(duration, "duration") if duration is not None else DEFAULT_DURATION
    if not 0 < end <= MAX_SECONDS:
        raise SimulationError(f"duration must be between 0 and {MAX_SECONDS:g} s")
    board = Board(netlist, mcu_ref, provider, vcc=parse_value(vcc, "vcc") if vcc is not None else None,
                  led_vf=parse_value(led_vf, "led_vf") if led_vf is not None else 1.8, rstdisbl=bool(rstdisbl))
    if not board.pins:
        raise SimulationError(f"{mcu_ref} has no pin connected to a PB0-PB5 net")
    closed = parse_initial(board, initial)
    chip = Avr(flash, clock, device=device, eeprom=bytes(eeprom_bytes), usi_input=queue, temperature_c=celsius, rstdisbl=bool(rstdisbl))
    if startup_ms is not None:  # a number is milliseconds, a string like "4ms" is a time
        delay = parse_value(startup_ms, "startup_ms")
        chip.reset_delay_s = delay / 1000 if isinstance(startup_ms, (int, float)) else delay
        if not 0 <= chip.reset_delay_s <= 1:
            raise SimulationError("startup_ms must be between 0 and 1000")
    run = Run(chip, board, closed)
    run.initial_eeprom = bytes(eeprom_bytes)
    events, names = parse_stimuli(board, stimuli, end)
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
            elif "temperature" in s:
                chip.temperature_c = parse_value(s["temperature"], "temperature")
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
    if chip.resets:
        causes = ", ".join(f"{cause} at {t * 1000:.1f} ms" for t, cause in chip.resets[:6]) + (" …" if len(chip.resets) > 6 else "")
        hazards.append({"severity": "info", "rule": "resets", "pin": "", "net": "", "t": chip.resets[0][0],
                        "message": f"the chip was reset {len(chip.resets)} time(s): {causes}; it restarts {chip.reset_delay_s * 1000:g} ms after each reset (the default start-up fuses)"})
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
        item = {"t": snap["t"], "pins": snap["pins"], "nets": snap["nets"], "leds": dict(snap["leds"]), "switches": snap["switches"], "pwm": snap["pwm"]}
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
        "device": device,
        "resets": [{"t": t, "cause": cause} for t, cause in chip.resets],
        "eeprom": {"changed": {a_: chip.eeprom[a_] for a_ in range(len(chip.eeprom)) if chip.eeprom[a_] != run.initial_eeprom[a_]},
                   "writes": [{"t": t, "address": a_, "value": v} for t, a_, v in chip.eeprom_log]},
        "usi_transfers": [{"t": t, "tx": tx, "rx": rx} for t, tx, rx in chip.usi_log],
    }
