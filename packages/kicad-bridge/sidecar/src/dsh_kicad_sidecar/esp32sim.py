"""ESP32 firmware against the board: the flash image runs on Espressif's QEMU (esp32qemu.py) while the schematic around the chip
is the DC network the ATtiny simulator uses (mcusim.py): buttons are switches the scenario presses, LEDs light by the voltage
across them, an input reads whatever the network makes of its pin. Scenarios, assertions and the timeline are the ATtiny
ones; the verdict on every assertion comes from this simulation, never from the model.

The chip side: outputs, output enables, open drain, internal pull-ups and pull-downs and input enables come from the
registers the firmware writes. A pad routed to an LEDC channel carries that channel's PWM wave (esp32ledc.py): the board is
solved for each combination of the PWM pads' levels, weighted by their duty cycles, as for the ATtiny's timers. An ADC
conversion reads the voltage of the pad's net (esp32adc.py: ESP-IDF's calibration of a typical chip, inverted). A pad routed
to another peripheral output (I2C, SPI, RMT, ...) has a level this simulator does not know, so a run where that pad is on the
board stops there and what follows is cannot-verify. So does a firmware
crash, or a firmware waiting for something that never comes. A GPIO interrupt the firmware enabled latches when the board
gives its pin the edge or level, and the machine raises it in QEMU's interrupt matrix, so the firmware's handler runs. The boot strapping pins are sampled from the board at power-on and given to QEMU, so a board that holds GPIO0
low really starts the serial bootloader.
"""

from __future__ import annotations

import os
import re
import tempfile
import threading
import time
from typing import Any, Callable

from . import esp32qemu as eq
from .esp32adc import ATTEN_DB, AdcState, calibrated_mv
from .esp32ledc import LedcState
from .mcu import _gpio_table, short_name
from .mcusim import SWITCH_OHMS, Board, Timeline, _judge, _net_name, _seconds, _time_of, parse_initial, parse_stimuli, solve
from .spice import SimulationError, parse_value

__all__ = ["simulate_firmware", "Esp32Board"]

PULL_OHMS = 45_000.0     # the ESP32's internal pull-up / pull-down
VIH, VIL = 0.75, 0.25    # input thresholds as a fraction of VDD
PIN_WARN_A, PIN_ERROR_A = 0.020, 0.040
VDD_MIN, VDD_MAX = 3.0, 3.6
MAX_SECONDS = 30.0
DEFAULT_DURATION = 2.0
UART_TAIL = 8000
INTERRUPT_LOG = 50  # GPIO interrupts listed in the result (all are counted)
ADC_LOG = 50        # ADC conversions listed in the result: each channel's first and those whose reading changed (all are counted)
CAPACITOR = re.compile(r"Device:C(?:P)?(?:_|$)")
TIMELINE_OUT = 200  # changes of the board listed in the result (the assertions see them all)
# What the firmware printing this means for the run
PANIC = re.compile(r"Guru Meditation Error[^\n]*|abort\(\) was called[^\n]*|CORRUPT HEAP[^\n]*|Stack canary watchpoint triggered[^\n]*|"
                   r"\*\*\*ERROR\*\*\* A stack overflow[^\n]*|assert failed:[^\n]*|Brownout detector was triggered[^\n]*")
INVALID_HEADER = re.compile(r"invalid header: 0x[0-9a-fA-F]+")
BOOT_ERROR = re.compile(r"E \(\d+\) (?:boot|esp_image|boot_comm): [^\n]*")
DOWNLOAD_MODE = re.compile(r"waiting for download|boot:0x[0-9a-fA-F]+ \((?:DOWNLOAD_BOOT|UART_BOOT)")
ROM_RESETS = {"POWERON_RESET": "power-on", "SW_RESET": "software", "SW_CPU_RESET": "software", "OWDT_RESET": "watchdog",
              "TG0WDT_SYS_RESET": "watchdog", "TG1WDT_SYS_RESET": "watchdog", "RTCWDT_SYS_RESET": "watchdog", "TGWDT_CPU_RESET": "watchdog",
              "RTCWDT_CPU_RESET": "watchdog", "RTCWDT_RTC_RESET": "watchdog", "DEEPSLEEP_RESET": "deep-sleep",
              "RTCWDT_BROWN_OUT_RESET": "brownout", "EXT_CPU_RESET": "external"}
ATTINY_ONLY = ("clock_hz", "eeprom", "usi_input", "temperature", "rstdisbl", "startup_ms")


# ---- the board -------------------------------------------------------------------------------
class Esp32Board(Board):
    GPIOS = 40
    DEFAULT_VCC = 3.3

    def __init__(self, netlist: dict[str, Any], ref: str, provider: dict[str, Any], vcc: float | None = None, led_vf: float = 1.8):
        super().__init__(netlist, ref, provider, vcc=vcc, led_vf=led_vf)
        comp = self.circuit.components[ref]
        table = _gpio_table(provider, comp.get("lib_id", ""), comp.get("value", ""))
        for gpio in sorted(self.pins):
            net = self.pins[gpio]
            if len(self.circuit.nets[net]["nodes"]) < 2:  # an unconnected pad: only its own pull acts on it
                del self.pins[gpio]
                continue
            why = table.get(gpio, {}).get("reserved")
            if why or gpio not in eq.VALID_GPIOS:
                del self.pins[gpio]
                self.notes.append(f"GPIO{gpio} (net {short_name(net)}) is {why or 'not a GPIO of this chip'}: not simulated")
        pattern = re.compile((provider.get("enable") or {}).get("pin_pattern") or r"^EN$")
        self.en_net = next((net for pin, net in self.circuit.by_ref.get(ref, []) if pattern.search(self.pin_names.get((ref, pin), ""))), None)

    def supply_pin_names(self, provider: dict[str, Any]) -> set[str]:
        return {s.upper() for s in (provider.get("supply") or {}).get("pins", [])} | {"VDD", "3V3"}

    def parse_pin(self, text: str) -> int:
        m = re.fullmatch(r"(?:[\w.-]+:)?(?:GPIO|IO)?(\d{1,2})", str(text).strip(), re.I)
        if not m or int(m.group(1)) not in eq.VALID_GPIOS:
            raise SimulationError(f"pin {text!r}: use GPIO0-GPIO39, e.g. GPIO2 or U1:IO2")
        return int(m.group(1))

    def pin_label(self, bit: int) -> str:
        return f"GPIO{bit}"

    def logic(self, volts: float | None) -> int | None:
        if volts is None:
            return None
        if volts >= VIH * self.vcc:
            return 1
        if volts <= VIL * self.vcc:
            return 0
        return None

    def solve_pins(self, pins: dict[int, eq.Pin], closed: set[str], forced: dict[str, float | None],
                   waves: dict[int, tuple[str, float, float]] | None = None) -> dict[str, Any]:
        """The DC network for the pads as they are: their drivers and pulls, the resistors, the closed switches, the external
        drives. A pad an LEDC channel drives (``waves``: ("level", 0|1, 0) or ("pwm", duty, Hz)) is high a fraction ``duty`` of
        the time: the network is solved for every combination of such pads' levels, weighted, which gives the average voltage
        of every net, the fraction of time each LED lights, the worst current of each pad, and the nets that switch."""
        waves = waves or {}
        edges = [(a, b, ohms) for a, b, ohms, _ in self.resistors]
        edges += [(a, b, SWITCH_OHMS) for r, (a, b) in self.switches.items() if r in closed]
        fixed = dict(self.fixed)
        for net, level in forced.items():
            if level is not None:
                fixed[net] = level
        static: list[tuple[str, float, float]] = []
        drivers: dict[int, tuple[float, float]] = {}
        pwm: dict[int, tuple[float, float]] = {}
        for gpio, net in self.pins.items():
            pin = pins[gpio]
            wave = waves.get(gpio)
            if pin.driven and wave is not None and wave[0] == "pwm":
                pwm[gpio] = (wave[1], wave[2])
            elif pin.driven:
                high = wave[1] if wave is not None else pin.level
                if not (wave is not None and pin.open_drain and high):  # an open-drain LEDC pad lets go when high
                    level = self.vcc if high else 0.0
                    static.append((net, level, pin.drive_ohms))
                    drivers[gpio] = (level, pin.drive_ohms)
            if pin.pull_up:
                static.append((net, self.vcc, PULL_OHMS))
            if pin.pull_down:
                static.append((net, 0.0, PULL_OHMS))
        gpios = sorted(pwm)
        totals: dict[str, float] = {}
        lows: dict[str, float] = {}
        highs: dict[str, float] = {}
        unknown: set[str] = set()
        leds = {r: 0.0 for r in self.leds}
        currents: dict[int, float] = {}
        for combo in range(1 << len(gpios)):
            weight = 1.0
            sources = list(static)
            levels = {g: level for g, (level, _) in drivers.items()}
            for i, gpio in enumerate(gpios):
                high = combo >> i & 1
                duty = pwm[gpio][0]
                weight *= duty if high else 1.0 - duty
                if high and pins[gpio].open_drain:
                    continue
                levels[gpio] = self.vcc if high else 0.0
                sources.append((self.pins[gpio], levels[gpio], pins[gpio].drive_ohms))
            if weight <= 0:
                continue
            volts = solve(self.nets, fixed, edges, sources)
            for n, v in volts.items():
                if v is None:
                    unknown.add(n)
                else:
                    totals[n] = totals.get(n, 0.0) + weight * v
                    lows[n], highs[n] = min(lows.get(n, v), v), max(highs.get(n, v), v)
            for r, lit in self.led_lit(volts).items():
                leds[r] += weight * (1.0 if lit else 0.0)
            for gpio, level in levels.items():
                v = volts.get(self.pins[gpio])
                if v is not None:
                    currents[gpio] = max(currents.get(gpio, 0.0), abs(level - v) / pins[gpio].drive_ohms)
        volts_avg = {n: (None if n in unknown else totals.get(n)) for n in self.nets}
        switching = {n for n in highs if highs[n] - lows[n] > 0.05 * self.vcc}
        return {"volts": volts_avg, "currents": currents, "leds": leds, "switching": switching,
                "pwm": {g: {"duty": d, "hz": hz} for g, (d, hz) in pwm.items()}}


# ---- the run ---------------------------------------------------------------------------------
class Esp32Run(Timeline, eq.Handler):
    """The board side of one run: stimuli, the board's answers to the chip, and the recorded timeline."""

    RESET_CAUSES = ("any", "power-on", "external", "software", "watchdog", "deep-sleep", "brownout")

    def __init__(self, board: Esp32Board, gpio: eq.GpioState, ledc: LedcState, closed: set[str], events: list[tuple[float, int, dict[str, Any]]],
                 end: float):
        self.board, self.gpio, self.ledc, self.end = board, gpio, ledc, end
        self._followed = 0.0                # the fades on the board's pads are in the timeline up to here
        self.closed = set(closed)
        self.forced: dict[str, float | None] = {}
        self.events, self.next = events, 0
        self.timeline: list[dict[str, Any]] = []
        self.times: list[float] = []
        self.hazards: dict[tuple[str, Any], dict[str, Any]] = {}
        self.finished = False
        self.held = False                  # EN holds the chip in reset
        self._release: float | None = None
        self.resets: list[tuple[float, str]] = []
        self.chip = self                   # mcusim's judge reads the reset log from run.chip
        self.uart: list[tuple[float, float, str]] = []  # (seen at, the look before, text)
        self.uart_text = ""
        self.stops = [0.0, 0.0]            # the previous and the current stop
        self.floating_reads: dict[int, float] = {}
        self.undefined: dict[int, float] = {}
        self.levels: dict[int, int | None] = {}
        self.armed: dict[int, int] = {}
        self.interrupts: list[tuple[float, int, int]] = []  # (t, gpio, interrupt type): the edges and levels that latched one
        self.last_volts: dict[str, float | None] = {}
        self.last_switching: set[str] = set()  # of the last solve: the nets a PWM output switches...
        self.last_pwm: set[int] = set()        # ...and the pads carrying a PWM wave
        self.adc_floating: dict[int, float] = {}   # pads the ADC converted while they floated, and when first
        self.adc_filtered: dict[int, float] = {}   # pads the ADC converted while a PWM wave reached them through an RC filter
        self.download_mode = False
        self.boot_failure: str | None = None
        self.boot_errors: list[str] = []
        self.panic: tuple[float, str] | None = None
        self.power_on_strap = eq.STRAP_FLASH_BOOT
        self.update(0.0)

    # ---- the board ----
    def pins(self) -> dict[int, eq.Pin]:
        return {g: (self.gpio.reset_pin(g) if self.held else self.gpio.pin(g)) for g in self.board.pins}

    def en_low(self) -> bool:
        net = self.board.en_net
        v = self.last_volts.get(net) if net else None
        return v is not None and v <= VIL * self.board.vcc

    def apply(self, s: dict[str, Any]) -> None:
        board = self.board
        if "drive" in s:
            net = _net_name(board, s["drive"])
            level = s["level"]
            self.forced[net] = {"high": board.vcc, "low": 0.0, "release": None}[level] if level in ("high", "low", "release") else parse_value(level, "level")
        elif "press" in s:
            self.closed.add(s["press"])
        elif "release" in s:
            self.closed.discard(s["release"])
        else:
            self.closed.symmetric_difference_update({s["toggle"]})

    def catch_up(self, t: float) -> None:
        """Apply the stimuli up to ``t`` in order. The chip is stopped at every access to its pins, so between two stops only the
        board changes; when EN goes low the chip is held in reset from that moment."""
        if t != self.stops[1]:
            self.stops = [self.stops[1], t]
        while self.next < len(self.events) and self.events[self.next][0] <= t + 1e-12 and self._release is None:
            at, _, s = self.events[self.next]
            self.follow_fades(at)
            self.next += 1
            self.apply(s)
            self.update(at)
            if self.en_low() and not self.held:
                self.hold(at)
        self.follow_fades(t)

    def follow_fades(self, t: float) -> None:
        """The steps of fades on the board's pads up to ``t`` go into the timeline (the duty changes without the firmware)."""
        if t <= self._followed:
            return
        points: set[float] = set()
        if not self.held:
            for gpio in self.board.pins:
                pin = self.gpio.pin(gpio)
                if pin.pwm is not None and pin.driven:
                    points.update(self.ledc.change_points(pin.pwm, self._followed, t))
        self._followed = t
        for at in sorted(points):
            self.update(at)

    def hold(self, at: float) -> None:
        """EN went low at ``at``: the pads let go; the stimuli run on until EN rises, which restarts the chip (or the run ends held)."""
        self.held = True
        self.levels.clear()
        self.update(at)
        while self.next < len(self.events) and self.events[self.next][0] <= self.end + 1e-12:
            t, _, s = self.events[self.next]
            self.next += 1
            self.apply(s)
            self.update(t)
            if not self.en_low():
                self._release = t
                return
        self.finished = True

    def next_due(self) -> float | None:
        return self.events[self.next][0] if self.next < len(self.events) and self._release is None else None

    def reset_request(self) -> float | None:
        if self._release is None:
            return None
        at, self._release = self._release, None
        self.held = False
        if self.strap_levels(at)[0] != self.power_on_strap:
            raise eq.Unsupported("strap_change", "the strapping pins (GPIO0, 2, 4, 5, 12, 15) have other levels at this reset than at power-on; "
                                                 "QEMU only samples them when it starts", at)
        return at

    def update(self, t: float) -> None:
        """Resolve the board for the chip's pads as they are now and record the state at ``t`` (never before the last one)."""
        board = self.board
        t = max(t, self.times[-1] if self.times else 0.0)
        pins = self.pins()
        waves = self.waves(pins, t)
        result = board.solve_pins(pins, self.closed, self.forced, waves)
        volts = result["volts"]
        self.last_volts = volts
        self.last_switching, self.last_pwm = result["switching"], set(result["pwm"])
        for gpio, amps in result["currents"].items():
            if amps > PIN_WARN_A:
                severity = "error" if amps > PIN_ERROR_A else "warning"
                key = ("overcurrent", gpio)
                if key not in self.hazards or severity == "error" and self.hazards[key]["severity"] != "error":
                    net = short_name(board.pins[gpio])
                    self.hazards[key] = {"severity": severity, "rule": "overcurrent", "pin": f"GPIO{gpio}", "net": net, "t": t,
                                         "message": f"GPIO{gpio} drives {amps * 1000:.0f} mA into net {net} (an ESP32 pin gives about 20 mA at its "
                                                    "default drive strength, 40 mA at most): an output fighting a switch or a short to the other rail"}
        pwm = {g: {"duty": round(w["duty"], 4), "hz": round(w["hz"], 3)} for g, w in result["pwm"].items()}
        snap = {
            "t": t,
            "pins": {f"GPIO{g}": self.label(pins[g], waves.get(g), pwm.get(g)) for g in sorted(board.pins)},
            "pwm": {f"GPIO{g}": w for g, w in pwm.items()},
            "nets": {short_name(n): (None if volts[n] is None else round(volts[n], 3)) for n in sorted(set(board.pins.values()))},
            "leds": dict(result["leds"]),
            "switches": sorted(self.closed),
            "_volts": volts,
            "held": self.held,
        }
        key = (tuple(sorted(snap["pins"].items())), tuple(sorted(snap["nets"].items(), key=lambda kv: kv[0])), tuple(sorted(snap["leds"].items())),
               tuple(snap["switches"]), self.held, tuple(sorted((k, w["duty"], w["hz"]) for k, w in snap["pwm"].items())))
        if not (self.timeline and self.timeline[-1].get("_key") == key):
            snap["_key"] = key
            if self.timeline and self.timeline[-1]["t"] == t:
                self.timeline[-1] = snap  # several changes in the same instant: the last one stands
            else:
                self.timeline.append(snap)
                self.times.append(t)
        if not self.held:
            self.latch_interrupts(t, pins, volts, result["switching"])

    def waves(self, pins: dict[int, eq.Pin], t: float) -> dict[int, tuple[str, float, float]]:
        """What the LEDC channels routed to the board's pads put out at ``t`` (with the GPIO matrix's inversion)."""
        out: dict[int, tuple[str, float, float]] = {}
        for gpio in self.board.pins:
            pin = pins[gpio]
            if pin.pwm is None or not pin.driven:
                continue
            kind, value, hz = self.ledc.wave(pin.pwm, t)
            if kind == "unknown":
                raise eq.Unsupported("ledc_stopped", f"GPIO{gpio} (net {short_name(self.board.pins[gpio])}) is driven by {pin.function}, but "
                                                     f"{self.ledc.why_unknown(pin.pwm)}: not simulated", t)
            out[gpio] = (kind, 1 - value if pin.invert else value, hz)
        return out

    @staticmethod
    def label(pin: eq.Pin, wave: tuple[str, float, float] | None, pwm: dict[str, float] | None) -> str:
        if pwm is not None:
            return f"pwm {pwm['duty']:.0%} at {pwm['hz']:.0f} Hz"
        if wave is not None:  # an LEDC channel at a steady level
            if pin.open_drain:
                return "od-low" if not wave[1] else "od-released" + ("-pullup" if pin.pull_up else "")
            return "out-high" if wave[1] else "out-low"
        return pin.label()

    def latch_interrupts(self, t: float, pins: dict[int, eq.Pin], volts: dict[str, float | None], switching: set[str] | None = None) -> None:
        """The GPIO interrupt detector: an edge or level the pin's interrupt type reacts to latches its status bit (the
        machine raises the interrupt in QEMU's matrix when the firmware enabled it for a CPU). It sees the pad through the
        input buffer: with the input off it reads 0."""
        for gpio, net in self.board.pins.items():
            pin = pins[gpio]
            kind = pin.interrupt
            level = self.board.logic(volts.get(net)) if pin.input else 0
            previous = self.levels.get(gpio)
            self.levels[gpio] = level
            if not kind:
                self.armed.pop(gpio, None)
                self.gpio.level_condition(gpio, False)
                continue
            if switching and net in switching and pin.input:
                raise eq.Unsupported("pwm_interrupt", f"GPIO{gpio} (net {short_name(net)}) has a GPIO interrupt armed on a net a PWM output "
                                                      "switches: it would fire at the wave's edges, which are not simulated one by one", t)
            if level is None:
                self.floating_reads.setdefault(gpio, t)  # the interrupt watches a pin nothing defines
            fresh = self.armed.get(gpio) != kind
            self.armed[gpio] = kind
            edge = previous is not None and level is not None and previous != level and not fresh
            if (kind == 1 and edge and level == 1) or (kind == 2 and edge and level == 0) or (kind == 3 and edge):
                self.gpio.latch_interrupt(gpio)
                self.interrupts.append((t, gpio, kind))
            active = (kind == 4 and level == 0) or (kind == 5 and level == 1)
            if active and gpio not in self.gpio.level_active:
                self.interrupts.append((t, gpio, kind))
            self.gpio.level_condition(gpio, active)

    def strap_levels(self, t: float) -> tuple[int, dict[int, int], list[int]]:
        """``(GPIO_STRAP, levels, pins between the logic levels)`` with the chip in reset and the board as it is at ``t``."""
        pins = {g: self.gpio.reset_pin(g) for g in self.board.pins}
        volts = self.board.solve_pins(pins, self.closed, self.forced)["volts"]
        levels: dict[int, int] = {}
        undefined = []
        for gpio in eq.STRAP_PINS:
            default = 1 if eq.RESET_PULLS.get(gpio) == "up" else 0
            net = self.board.pins.get(gpio)
            level = self.board.logic(volts.get(net)) if net else default
            if level is None:
                undefined.append(gpio)
                level = default
            levels[gpio] = level
        return eq.strap_value(levels), levels, undefined

    # ---- the chip's callbacks ----
    def on_gpio(self, t: float, gpios: set[int]) -> None:
        self.catch_up(t)
        if self.held or self._release is not None or self.finished:
            return
        for gpio in sorted(gpios & set(self.board.pins)):
            pin = self.gpio.pin(gpio)
            if pin.unknown:
                net = short_name(self.board.pins[gpio])
                raise eq.Unsupported("peripheral_output", f"GPIO{gpio} (net {net}) is now driven by {pin.function}: the levels a peripheral "
                                                          "drives are not simulated", t)
        self.update(t)

    def gpio_in(self, t: float, bank: int) -> int:
        self.catch_up(t)
        if self.held:
            return 0
        word = 0
        first = 0 if bank == 0 else 32
        for gpio in range(first, first + (32 if bank == 0 else 8)):
            if gpio not in eq.VALID_GPIOS:
                continue
            pin = self.gpio.pin(gpio)
            if not pin.input:
                continue
            net = self.board.pins.get(gpio)
            if net is not None:
                volts = self.last_volts.get(net)
                level = self.board.logic(volts)
            else:  # not on the board: the pad's own driver or pull
                volts = None
                level = pin.level if pin.driven else 1 if pin.pull_up else 0 if pin.pull_down else None
            if level is None:
                if gpio in self.gpio.configured:
                    (self.floating_reads if volts is None else self.undefined).setdefault(gpio, t)
                level = 0
            word |= level << (gpio - first)
        return word

    def on_reset(self, t: float, cause: str, scope: str) -> None:
        self.catch_up(t)
        self.resets.append((t, cause))
        self.levels.clear()
        self.armed.clear()
        self.update(t)

    def on_tick(self, t: float) -> None:
        self.catch_up(t)

    def on_ledc(self, t: float, channels: set[int]) -> None:
        self.catch_up(t)
        if self.held or self._release is not None or self.finished:
            return
        if any(self.gpio.pin(g).pwm in channels for g in self.board.pins):
            self.update(t)

    def adc_volts(self, t: float, gpio: int) -> float | None:
        """The voltage an ADC conversion samples on a pad at ``t``: its net's, or off the board what the pad's own driver or pull
        makes of it. A net a PWM output switches is its average when a capacitor on it filters the wave (an RC filter), and is not
        simulated otherwise (the chip samples the wave's level at that instant). None: nothing defines it, the reading is arbitrary."""
        self.catch_up(t)
        net = self.board.pins.get(gpio)
        if net is None:
            pin = self.gpio.pin(gpio)
            if pin.unknown or pin.pwm is not None:
                raise eq.Unsupported("adc_driven", f"the firmware converts GPIO{gpio}, which {pin.function} drives: the level it puts there is not simulated", t)
            v = self.board.vcc * pin.level if pin.driven else self.board.vcc if pin.pull_up else 0.0 if pin.pull_down else None
        else:
            v = self.last_volts.get(net)
            if net in self.last_switching:
                if not self.filtered(net):
                    raise eq.Unsupported("adc_pwm", f"the firmware converts GPIO{gpio} (net {short_name(net)}), which a PWM output switches with "
                                                    "no capacitor to filter it: the chip samples the wave's level at that instant, which is not simulated", t)
                self.adc_filtered.setdefault(gpio, t)
        if v is None:
            self.adc_floating.setdefault(gpio, t)
        return v

    def filtered(self, net: str) -> bool:
        """A capacitor sits on the net and no PWM pad drives it directly: an RC filter, which gives the wave's average."""
        circuit = self.board.circuit
        caps = any(CAPACITOR.match(circuit.components.get(node["ref"], {}).get("lib_id", "")) for node in circuit.nets[net]["nodes"])
        return caps and all(self.board.pins.get(g) != net for g in self.last_pwm)

    def on_uart(self, t: float, text: str) -> None:
        self.uart.append((t, self.stops[0] if t == self.stops[1] else self.stops[1], text))
        recent = self.uart_text[-400:] + text
        self.uart_text += text
        if self.boot_failure is None and (m := INVALID_HEADER.search(recent)):
            self.boot_failure = m.group(0).strip()
            self.finished = True  # the ROM finds no bootloader and keeps retrying
        for m in BOOT_ERROR.finditer(text):
            if m.group(0).strip() not in self.boot_errors:
                self.boot_errors.append(m.group(0).strip())
        if DOWNLOAD_MODE.search(recent) and not self.download_mode:
            self.download_mode = True
            self.finished = True  # the ROM waits for a download: nothing else happens
        m = PANIC.search(recent)
        if m and self.panic is None:
            self.panic = (t, m.group(0).strip())
            raise eq.Unsupported("crash", f"the firmware crashed: {m.group(0).strip()} (on hardware too, unless it depends on a peripheral "
                                          "QEMU does not emulate; see not_emulated)", t)


# ---- assertions on the UART ------------------------------------------------------------------
def _judge_uart(run: Esp32Run, a: dict[str, Any], names: dict[str, float], abort_at: float | None, end: float, looked_until: float) -> dict[str, Any]:
    text = a["uart"]
    if not isinstance(text, str) or not text:
        raise SimulationError("a uart assertion needs the text to look for, e.g. {uart: \"ready\", by: \"2s\"}")
    want = a.get("is", "present")
    if want not in ("present", "absent"):
        raise SimulationError("a uart assertion's is must be present or absent")
    by = _time_of(a["by"], "by", names) if "by" in a else end
    if by > end + 1e-12:
        raise SimulationError(f"assertion {a}: it looks at {by * 1000:g} ms but the simulation ends at {end * 1000:g} ms: raise duration")
    name = a.get("name") or f"UART output {'has' if want == 'present' else 'does not have'} {text!r}"
    result: dict[str, Any] = {"name": name, "when": f"by {by * 1000:g} ms", "t0": 0.0, "t1": by}
    seen: tuple[float, float] | None = None
    acc = ""
    for at, before, chunk in run.uart:
        acc += chunk
        if text in acc:
            seen = (at, before)
            break
    if seen and seen[0] <= by + 1e-12:
        present: bool | None = True
    elif seen and seen[1] >= by:
        present = False
    elif seen:
        return {**result, "passed": None, "first_at": seen[0],
                "reason": f"cannot verify: the text arrived between {seen[1] * 1000:.1f} and {seen[0] * 1000:.1f} ms (the output is read at the "
                          "firmware's pin accesses and at least every half second), which straddles the deadline"}
    elif looked_until >= by and (abort_at is None or abort_at >= by):
        present = False
    else:
        stopped = abort_at if abort_at is not None else looked_until
        return {**result, "passed": None, "reason": f"cannot verify: the simulation stopped at {stopped * 1000:.3f} ms"}
    passed = present if want == "present" else not present
    out = {**result, "passed": passed, "value": "present" if present else "absent", **({"first_at": seen[0]} if seen else {})}
    if not passed:
        out["reason"] = (f"the UART output did not have {text!r} by {by * 1000:g} ms" if want == "present"
                         else f"the UART output had {text!r} at {seen[0] * 1000:.1f} ms" if seen else "")
    return out


# ---- one simulation --------------------------------------------------------------------------
def simulate_firmware(netlist: dict[str, Any], mcu_ref: str, provider: dict[str, Any], firmware: str, stimuli: list[dict[str, Any]] | None,
                      assertions: list[dict[str, Any]] | None, duration: Any = None, vcc: Any = None, led_vf: Any = None,
                      initial: dict[str, str] | None = None, timeout: float = 60.0, qemu: str | None = None,
                      allow: Callable[[str], str] | None = None, cancel: threading.Event | None = None,
                      progress: Callable[[float, float | None, str], None] | None = None, **attiny: Any) -> dict[str, Any]:
    given = sorted(k for k in ATTINY_ONLY if attiny.get(k) is not None)
    if given:
        raise SimulationError(f"{', '.join(given)} {'applies' if len(given) == 1 else 'apply'} to the ATtiny only; the ESP32 runs its flash image as it is")
    found = eq.locate(qemu)
    if not found.ok:
        why = "; ".join(found.problems) if found.problems else "it is not installed"
        raise SimulationError(f"QEMU with the ESP32 machine (Espressif's fork) was not found: {why}. Run kicad_doctor for how to install it "
                              "(/kicad-install qemu-esp32, or ESP-IDF's `idf_tools.py install qemu-xtensa`), or set the KiCad bridge 'qemu' "
                              "setting / $QEMU_XTENSA to qemu-system-xtensa.")
    end = _seconds(duration, "duration") if duration is not None else DEFAULT_DURATION
    if not 0 < end <= MAX_SECONDS:
        raise SimulationError(f"duration must be between 0 and {MAX_SECONDS:g} s")
    board = Esp32Board(netlist, mcu_ref, provider, vcc=parse_value(vcc, "vcc") if vcc is not None else None,
                       led_vf=parse_value(led_vf, "led_vf") if led_vf is not None else 1.8)
    if not board.pins:
        raise SimulationError(f"{mcu_ref} has no GPIO connected to anything")
    closed = parse_initial(board, initial)
    events, names = parse_stimuli(board, stimuli, end, kinds=("press", "release", "toggle", "drive"))
    for a in assertions or []:
        if not isinstance(a, dict):
            raise SimulationError("each assertion is an object")
        if "eeprom" in a or "usi" in a:
            raise SimulationError("eeprom and usi assertions are for the ATtiny; the ESP32 simulator judges pins, nets, LEDs, resets and the UART output")
    gpio = eq.GpioState()
    ledc = LedcState()
    adc = AdcState()
    run = Esp32Run(board, gpio, ledc, closed, events, end)
    run.catch_up(0.0)
    start_at = 0.0
    if run.en_low():  # EN held low from power-on: the chip starts when it rises
        run.hold(0.0)
        start_at = run._release if run._release is not None else end
        run._release, run.held = None, run.finished
    strap, levels, undefined = run.strap_levels(start_at)
    run.power_on_strap = strap
    _power_on_hazards(run, levels, undefined, start_at)
    if levels[0] == 0 and levels[2] == 0 and not run.finished:
        # The ROM's serial download mode (UART0, UART1, SDIO): the firmware does not run. QEMU is not started for it: its ROM
        # waits there for the SDIO slave QEMU does not emulate.
        run.download_mode = run.finished = True
    deadline = time.monotonic() + timeout
    aborted: dict[str, Any] | None = None
    probe: dict[str, Any] = {}
    unimplemented: dict[str, dict[str, int]] = {}
    uart_bytes = 0
    with tempfile.TemporaryDirectory(prefix="dshq") as tmp:
        image = os.path.join(tmp, "flash.bin")
        try:
            image_info = eq.flash_image(firmware, image, allow)
        except OSError as exc:
            raise SimulationError(f"cannot read the firmware {firmware}: {exc}") from exc
        except eq.QemuError as exc:
            raise SimulationError(f"cannot use {firmware}: {exc}") from exc
        try:
            probe = eq.probe(found.path or "", timeout=min(30.0, timeout))
        except eq.QemuError as exc:
            raise SimulationError(f"QEMU ({found.path}) cannot run the simulator: {exc}") from exc
        machine = eq.Machine(found.path or "", image, tmp, strap=strap, clock=probe["clock"], rtc_hz=probe.get("rtc_hz", eq.RTC_SLOW_HZ),
                             entry=image_info.get("entry"))
        machine.gpio = gpio
        machine.ledc = ledc
        machine.adc = adc
        try:
            if not run.finished:
                machine.start(deadline)
                machine.begin_at(start_at)
                machine.run(run, end, deadline, cancel, progress)
        except eq.Unsupported as exc:
            aborted = {"what": exc.what, "reason": exc.detail, "t": exc.t if exc.t is not None else machine.t}
        except eq.TimedOut as exc:
            raise SimulationError(f"the simulation did not finish within {timeout:g} s of wall-clock time ({exc}); shorten duration or raise timeout") from exc
        except eq.Cancelled as exc:
            raise SimulationError(str(exc)) from exc
        except eq.QemuError as exc:
            raise SimulationError(f"QEMU: {exc}") from exc
        finally:
            unimplemented = machine.unimplemented()
            uart_bytes = machine.uart_seen
            machine.close()
    if run.boot_failure:
        raise SimulationError(f"the flash image does not boot: the ESP32 ROM says {run.boot_failure!r} (no valid bootloader at 0x1000). {eq.MERGE_HINT}")
    simulated_to = min(max(machine.t, start_at), end)
    if run.finished and not aborted:
        simulated_to = end  # nothing more happens on the chip: the board alone goes on
    try:  # the board between the last stop and the end
        run.catch_up(aborted["t"] if aborted else simulated_to)
    except eq.Unsupported as exc:
        aborted = aborted or {"what": exc.what, "reason": exc.detail, "t": exc.t if exc.t is not None else simulated_to}
    if aborted:
        aborted["t"] = min(aborted["t"], end)
        simulated_to = aborted["t"]
    _resolve_reset_causes(run)
    abort_at = aborted["t"] if aborted else None
    judged = []
    for a in assertions or []:
        if "uart" in a:
            judged.append(_judge_uart(run, a, names, abort_at, end, simulated_to))
        else:
            judged.append(_judge(run, a, names, abort_at, end))
    hazards = _hazards(run, unimplemented)
    failed = any(j["passed"] is False for j in judged) or any(h["severity"] == "error" for h in hazards)
    unknown = any(j["passed"] is None for j in judged) or aborted is not None
    passed: bool | None = False if failed else (None if unknown else True)
    if not judged and not aborted and not failed:
        passed = True
    # the board over time, as reported: a run of changes in PWM duty only (a fade) shows its first and its last step
    events_out: list[dict[str, Any]] = []
    last = None
    steps = 0
    held_back: dict[str, Any] | None = None
    for snap in run.timeline:
        if snap["t"] > end + 1e-9:
            continue
        item = {"t": snap["t"], "pins": snap["pins"], "nets": snap["nets"], "leds": dict(snap["leds"]), "switches": snap["switches"], "pwm": snap["pwm"],
                **({"held": True} if snap["held"] else {})}
        view = (tuple(item["pins"].items()), tuple(item["leds"].items()), tuple(item["switches"]), snap["held"])
        if view == last:
            continue
        if last is not None and _duty_step(last, view):
            steps += 1
            if steps > 1:
                held_back = item
                last = view
                continue
        else:
            steps = 0
        if held_back is not None:
            events_out.append(held_back)
            held_back = None
        events_out.append(item)
        last = view
    if held_back is not None:
        events_out.append(held_back)
    events_out = events_out[:TIMELINE_OUT]
    notes = list(board.notes)
    if machine.skipped:
        notes.append(f"the CPUs slept with no timer pending for {machine.skipped * 1000:.1f} ms in all, so QEMU's clock stood still; that time "
                     "passed for the board until a stimulus woke the chip, but the firmware's own clocks did not see it")
    if probe.get("clock") == "ccount":
        notes.append("time is read from the CPU cycle counter (this QEMU does not run the RTC timer): before the application sets its "
                     "CPU clock, times can be off by a few milliseconds")
    return {
        "mcu": mcu_ref, "firmware": firmware, "device": "esp32", "vcc": board.vcc, "duration": end, "simulated_to": simulated_to,
        "aborted": aborted, "assertions": judged, "hazards": hazards, "timeline": events_out, "passed": passed,
        "switches": sorted(board.switches), "leds": sorted(board.leds), "notes": notes,
        "pins": {f"GPIO{g}": short_name(n) for g, n in sorted(board.pins.items())},
        "resets": [{"t": t, "cause": cause} for t, cause in run.resets],
        "interrupts": [{"t": t, "gpio": f"GPIO{g}", "type": eq.INT_TYPES.get(kind, str(kind))} for t, g, kind in run.interrupts[:INTERRUPT_LOG]],
        "interrupt_count": len(run.interrupts),
        "adc": _adc_log(adc), "adc_count": len(adc.conversions),
        "strap": {"value": f"{strap:#04x}", "levels": {f"GPIO{g}": level for g, level in levels.items()}, "download_mode": run.download_mode},
        "uart": run.uart_text[-UART_TAIL:], "uart_bytes": uart_bytes,
        "not_emulated": unimplemented,
        "flash": {"size": image_info["size"], "parts": image_info["parts"]},
        "qemu": {"path": found.path, "version": found.version, "source": found.source, "clock": probe.get("clock")},
    }


def _adc_log(adc: AdcState) -> list[dict[str, Any]]:
    """The conversions worth listing: each channel's first, then those whose reading changed (the board's voltage did)."""
    out: list[dict[str, Any]] = []
    last: dict[tuple[int, int], int] = {}
    for c in adc.conversions:
        key = (c.unit, c.channel)
        if last.get(key) == c.reading:
            continue
        last[key] = c.reading
        out.append({"t": c.t, "gpio": f"GPIO{c.gpio}", "adc": f"ADC{c.unit} channel {c.channel}",
                    "volts": None if c.volts is None else round(c.volts, 4), "atten_db": ATTEN_DB[c.atten], "bits": c.bits, "reading": c.reading,
                    "calibrated_mv": calibrated_mv(c.unit, c.atten, min(4095, c.reading << (12 - c.bits)))})
        if len(out) >= ADC_LOG:
            break
    return out


def _duty_step(a: tuple[Any, ...], b: tuple[Any, ...]) -> bool:
    """Two views of the board differ only in the duty of PWM pads (and so in LED brightness)."""
    if a[2:] != b[2:] or len(a[0]) != len(b[0]):
        return False
    return all(x == y or (x[0] == y[0] and x[1].startswith("pwm ") and y[1].startswith("pwm ")) for x, y in zip(a[0], b[0]))


def _power_on_hazards(run: Esp32Run, levels: dict[int, int], undefined: list[int], t: float) -> None:
    """What the board does to the chip as it starts: the supply, EN, and the strapping pins' levels."""
    board = run.board
    vcc = board.vcc
    add = run.hazards.setdefault
    if not VDD_MIN <= vcc <= VDD_MAX:
        add(("supply", 0), {"severity": "error", "rule": "supply_voltage", "pin": "", "net": short_name(board.supply_net or ""), "t": t,
                            "message": f"the ESP32 is supplied with {vcc:g} V; it needs 3.0-3.6 V"})
    if board.en_net is not None and run.last_volts.get(board.en_net) is None:
        add(("en", 0), {"severity": "error", "rule": "enable_floating", "pin": "EN", "net": short_name(board.en_net), "t": t,
                        "message": "EN floats: the chip may stay off or reset at random (the simulation ran as if it were enabled)",
                        "fix": "Pull EN up to the supply with 10 kΩ and add about 1 µF to ground."})

    def net_of(gpio: int) -> str:
        return short_name(board.pins[gpio]) if gpio in board.pins else "not connected"

    for gpio in undefined:
        add(("strap", gpio), {"severity": "warning", "rule": "strap_undefined", "pin": f"GPIO{gpio}", "net": net_of(gpio), "t": t,
                              "message": f"GPIO{gpio} is a strapping pin and sits between the logic levels at reset: the boot mode is unpredictable "
                                         f"(simulated with its internal pull-{eq.RESET_PULLS.get(gpio, 'down')})"})
    if levels[0] == 0:
        add(("strap", 0), {"severity": "warning", "rule": "download_mode", "pin": "GPIO0", "net": net_of(0), "t": t,
                           "message": "GPIO0 is low at reset: the chip starts the serial bootloader (download mode) instead of the firmware"
                                      + (", and with GPIO2 high it does not even do that properly" if levels[2] else "")})
    if levels[12] == 1:
        add(("strap", 12), {"severity": "error", "rule": "flash_voltage", "pin": "GPIO12", "net": net_of(12), "t": t,
                            "message": "GPIO12 (MTDI) is high at reset: the flash supply becomes 1.8 V and a 3.3 V flash (most ESP32 modules) "
                                       "does not work; QEMU does not model that and boots anyway, so this run says nothing about the real board"})
    if levels[15] == 0:
        add(("strap", 15), {"severity": "info", "rule": "boot_log_silenced", "pin": "GPIO15", "net": net_of(15), "t": t,
                            "message": "GPIO15 (MTDO) is low at reset: the ROM's boot messages on UART0 are silenced"})


def _resolve_reset_causes(run: Esp32Run) -> None:
    """Causes QEMU's RTC_CNTL did not report, from the ROM's boot banner: its rst: line after each reset."""
    lines = [ROM_RESETS.get(name, "unknown") for name in re.findall(r"rst:0x[0-9a-fA-F]+ \((\w+)\)", run.uart_text)][1:]
    run.resets = [(t, lines[i] if cause == "unknown" and i < len(lines) else cause) for i, (t, cause) in enumerate(run.resets)]


def _hazards(run: Esp32Run, unimplemented: dict[str, dict[str, int]]) -> list[dict[str, Any]]:
    board = run.board
    hazards = list(run.hazards.values())
    for gpio, t in sorted(run.floating_reads.items()):
        net = short_name(board.pins[gpio]) if gpio in board.pins else "not connected"
        hazards.append({"severity": "warning", "rule": "floating_input", "pin": f"GPIO{gpio}", "net": net, "t": t,
                        "message": f"the firmware reads GPIO{gpio} while it floats (net {net}: no pull-up, pull-down or driver reaches it): the value is arbitrary",
                        "fix": f"Enable the internal pull-up (gpio_set_pull_mode / INPUT_PULLUP) or add an external pull resistor on GPIO{gpio}."})
    for gpio, t in sorted(run.undefined.items()):
        net = short_name(board.pins[gpio]) if gpio in board.pins else "not connected"
        hazards.append({"severity": "warning", "rule": "undefined_level", "pin": f"GPIO{gpio}", "net": net, "t": t,
                        "message": f"GPIO{gpio} (net {net}) sits between the logic levels when the firmware reads it (a divider or a weak pull against a "
                                   "switch): it reads unpredictably",
                        "fix": "Use a stronger pull-up/pull-down or remove the competing path."})
    for gpio, t in sorted(run.adc_floating.items()):
        net = short_name(board.pins[gpio]) if gpio in board.pins else "not connected"
        hazards.append({"severity": "warning", "rule": "adc_floating", "pin": f"GPIO{gpio}", "net": net, "t": t,
                        "message": f"the firmware converts GPIO{gpio} with the ADC while it floats (net {net}: nothing sets its voltage): the reading is "
                                   "arbitrary (simulated as 0 V)",
                        "fix": f"Connect what GPIO{gpio} should measure, or give the net a defined level (a divider, a pull resistor)."})
    for gpio, t in sorted(run.adc_filtered.items()):
        net = short_name(board.pins[gpio])
        hazards.append({"severity": "info", "rule": "adc_pwm_average", "pin": f"GPIO{gpio}", "net": net, "t": t,
                        "message": f"the ADC reads GPIO{gpio} (net {net}), which a PWM output reaches through an RC filter: the simulation reads the "
                                   "wave's average voltage (the filter's ripple and settling time are not simulated)"})
    if run.resets:
        causes = ", ".join(f"{cause} at {t * 1000:.1f} ms" for t, cause in run.resets[:6]) + (" …" if len(run.resets) > 6 else "")
        hazards.append({"severity": "info", "rule": "resets", "pin": "", "net": "", "t": run.resets[0][0],
                        "message": f"the chip was reset {len(run.resets)} time(s): {causes}"})
    if run.boot_errors:
        hazards.append({"severity": "warning", "rule": "boot_errors", "pin": "", "net": "", "t": 0.0,
                        "message": "the bootloader reported: " + "; ".join(run.boot_errors[:4])})
    if unimplemented:
        listed = ", ".join(f"{name} ({', '.join(f'{v} {k}' for k, v in counts.items() if v)})" for name, counts in sorted(unimplemented.items()))
        reads = any(c.get("reads") or c.get("accesses") for c in unimplemented.values())
        hazards.append({"severity": "warning" if reads else "info", "rule": "not_emulated", "pin": "", "net": "", "t": 0.0,
                        "message": f"the firmware used hardware the simulation does not emulate: {listed}. It does nothing (reads return 0 or what "
                                   "the firmware wrote), so behaviour that depends on it is not verified"})
    if board.unmodelled:
        hazards.append({"severity": "info", "rule": "unmodelled_parts", "pin": "", "net": "", "t": 0.0,
                        "message": "not simulated, treated as open circuits: " + ", ".join(board.unmodelled) + " (they touch nets the chip drives or reads)"})
    order = {"error": 0, "warning": 1, "info": 2}
    hazards.sort(key=lambda h: (order[h["severity"]], h["t"]))
    return hazards
