"""The ESP32's SAR ADCs, kept by the sidecar. QEMU leaves the SENS block they live in unimplemented (it reads 0), so esp32qemu
watches the block and answers every access from here. A one-shot conversion through the RTC controller (what ESP-IDF's
adc_oneshot driver, Arduino's analogRead and MicroPython's ADC do) reads the board's voltage on the channel's pad.

The transfer function is ESP-IDF's own characterization of an ESP32 whose ADC reference is the nominal 1100 mV, which the
simulated chip carries in eFuse (ADC_VREF): the line fitting of components/esp_adc/esp32/adc_cali_line_fitting.c per unit and
attenuation, and at 12 dB from reading 2880 up its lookup table of the nonlinear top of the range. A firmware that calibrates
with ESP-IDF (adc_cali_raw_to_voltage, analogReadMilliVolts, MicroPython's read_uv) gets the board's voltage back to within a
step of the reading, and raw readings are those of a typical chip. The spread between chips, noise and the arbiter that gives
ADC2 to WiFi are not simulated.

Registers (ESP-IDF's sens_reg.h and adc_ll.h):
- SENS_SAR_MEAS_START1/2: SARx_EN_PAD selects the channel; MEASx_START_SAR going 0 -> 1 starts a conversion, whose
  MEASx_DONE_SAR and MEASx_DATA_SAR are there at once (the chip takes some microseconds);
- SENS_SAR_ATTEN1/2: two bits per channel (0, 2.5, 6 and 12 dB; all 12 dB from reset); SENS_SAR_READ_CTRL / READ_CTRL2:
  SARx_SAMPLE_BIT (9-12 bits) and SARx_DATA_INV (ESP-IDF sets it: the converter's own output is inverted);
- SENS_SAR_SLAVE_ADDR1.MEAS_STATUS reads 0 (the converter is idle); the rest of the ADC's setup (power, amplifier, clock
  divider, the controller selection) keeps what is written;
- the other parts of the block (the touch pads, the temperature sensor, the ULP coprocessor's timer, the DAC's cosine
  generator) keep what is written too, and their accesses are counted: they are not simulated. A firmware that keeps reading
  one register, waiting for it to change, stops the run.
"""

from __future__ import annotations

import bisect
from dataclasses import dataclass
from typing import Callable

SENS_BASE, SENS_SIZE = 0x3FF48800, 0x100
READ_CTRL, MEAS_START1, READ_CTRL2, MEAS_START2 = 0x00, 0x54, 0x90, 0x94
START_FORCE, ATTEN1, ATTEN2, SLAVE_ADDR1 = 0x2C, 0x34, 0x38, 0x3C
# The ADCs' registers: the controls above, the status words, the waits and power controls of the converter and its amplifier
# (MEAS_WAIT1/2, MEAS_CTRL, MEAS_CTRL2), TOUCH_CTRL1 (ESP-IDF sets its hall-sensor force bits when it takes the ADC over),
# the unused word and the date
ADC_REGISTERS = frozenset({READ_CTRL, 0x04, 0x08, 0x0C, 0x10, 0x14, START_FORCE, ATTEN1, ATTEN2, SLAVE_ADDR1, MEAS_START1, 0x58,
                           READ_CTRL2, MEAS_START2, 0xA0, 0xF8, 0xFC})
PARTS = ((frozenset({0x18, 0x1C, 0x20, 0x24, 0x28, 0x30}), "the ULP coprocessor"),
         (frozenset({0x40, 0x44, 0x48, 0x4C, 0x50}), "the temperature sensor and the RTC I2C"),
         (frozenset(range(0x5C, 0x90, 4)), "the touch pads"),
         (frozenset({0x98, 0x9C}), "the DAC's cosine generator"))
RESET_VALUES = {READ_CTRL: 3 << 16, READ_CTRL2: 3 << 16, START_FORCE: 0xF, ATTEN1: 0xFFFFFFFF, ATTEN2: 0xFFFFFFFF}
START_SAR, RESULT_BITS = 1 << 17, 0x1FFFF   # MEASx_START_SAR; MEASx_DONE_SAR (bit 16) and MEASx_DATA_SAR are read-only
MEAS_STATUS = 0xFF << 22                    # SENS_SAR_SLAVE_ADDR1: the RTC controller's ADC state machine (0: idle)
CHANNELS = {1: (36, 37, 38, 39, 32, 33, 34, 35), 2: (4, 0, 2, 15, 13, 12, 14, 27, 25, 26)}  # ESP-IDF's adc_channel.h
ATTEN_DB = (0, 2.5, 6, 12)
HALL_CHANNELS = (0, 3)    # ADC1 channels the hall sensor's plates are switched to while it is powered
POLL_LIMIT = 1000         # reads of one register giving the same value, with no store to the block in between...
POLL_WINDOW_S = 0.01      # ...within this much simulated time: the firmware spins on it, waiting for it to change
VREF_MV = 1100            # the simulated chip's ADC_VREF (eFuse; the nominal value)

# ESP-IDF's line fitting from a Vref, and its lookup table (components/esp_adc/esp32/adc_cali_line_fitting.c, v5.4)
VREF_ATTEN_SCALE = {1: (57431, 76236, 105481, 196602), 2: (57236, 76175, 105678, 197170)}
VREF_ATTEN_OFFSET = {1: (75, 78, 107, 142), 2: (63, 66, 89, 128)}
LUT_VREF_LOW, LUT_VREF_HIGH, LUT_LOW_THRESH, LUT_STEP = 1000, 1200, 2880, 64
LUT_LOW = {1: (2240, 2297, 2352, 2405, 2457, 2512, 2564, 2616, 2664, 2709, 2754, 2795, 2832, 2868, 2903, 2937, 2969, 3000, 3030, 3060),
           2: (2238, 2293, 2347, 2399, 2451, 2507, 2561, 2613, 2662, 2710, 2754, 2792, 2831, 2869, 2904, 2937, 2968, 2999, 3029, 3059)}
LUT_HIGH = {1: (2667, 2706, 2745, 2780, 2813, 2844, 2873, 2901, 2928, 2956, 2982, 3006, 3032, 3059, 3084, 3110, 3135, 3160, 3184, 3209),
            2: (2657, 2698, 2738, 2774, 2807, 2838, 2867, 2894, 2921, 2946, 2971, 2996, 3020, 3043, 3067, 3092, 3116, 3139, 3162, 3185)}


class AdcUnsupported(Exception):
    def __init__(self, what: str, detail: str):
        super().__init__(detail)
        self.what, self.detail = what, detail


def calibrated_mv(unit: int, atten: int, raw12: int, vref: int = VREF_MV) -> int:
    """What ESP-IDF's cali_raw_to_voltage (line fitting from a Vref, lookup table enabled) makes of a 12-bit reading, in mV."""
    coeff_a = vref * VREF_ATTEN_SCALE[unit][atten] // 4096
    coeff_b = VREF_ATTEN_OFFSET[unit][atten]

    def linear(raw: int) -> int:
        return (coeff_a * raw + 32768) // 65536 + coeff_b

    if atten != 3 or raw12 < LUT_LOW_THRESH:
        return linear(raw12)
    i = (raw12 - LUT_LOW_THRESH) // LUT_STEP
    x2dist, x1dist = LUT_VREF_HIGH - vref, vref - LUT_VREF_LOW
    y2dist = (i + 1) * LUT_STEP + LUT_LOW_THRESH - raw12
    y1dist = raw12 - (i * LUT_STEP + LUT_LOW_THRESH)
    low, high = LUT_LOW[unit], LUT_HIGH[unit]
    lut = low[i] * x2dist * y2dist + high[i] * x1dist * y2dist + low[i + 1] * x2dist * y1dist + high[i + 1] * x1dist * y1dist
    lut = (lut + (LUT_VREF_HIGH - LUT_VREF_LOW) * LUT_STEP // 2) // ((LUT_VREF_HIGH - LUT_VREF_LOW) * LUT_STEP)
    if raw12 > LUT_LOW_THRESH + LUT_STEP:
        return lut
    x, y1 = raw12 - LUT_LOW_THRESH, linear(raw12)  # the transition from the line to the table
    return (y1 * LUT_STEP + lut * x - y1 * x + LUT_STEP // 2) // LUT_STEP


def _curve_mv(unit: int, atten: int, raw12: int, vref: int = VREF_MV) -> float:
    """The same curve without ESP-IDF's integer rounding (which makes it dip by a millivolt in places): strictly increasing."""
    coeff_a = vref * VREF_ATTEN_SCALE[unit][atten] // 4096
    linear = coeff_a * raw12 / 65536 + VREF_ATTEN_OFFSET[unit][atten]
    if atten != 3 or raw12 < LUT_LOW_THRESH:
        return linear
    i = min((raw12 - LUT_LOW_THRESH) // LUT_STEP, len(LUT_LOW[unit]) - 2)
    x = (raw12 - LUT_LOW_THRESH - i * LUT_STEP) / LUT_STEP
    at_vref = (vref - LUT_VREF_LOW) / (LUT_VREF_HIGH - LUT_VREF_LOW)
    low, high = LUT_LOW[unit], LUT_HIGH[unit]
    lut = (low[i] + (high[i] - low[i]) * at_vref) * (1 - x) + (low[i + 1] + (high[i + 1] - low[i + 1]) * at_vref) * x
    if raw12 > LUT_LOW_THRESH + LUT_STEP:
        return lut
    return linear + (lut - linear) * (raw12 - LUT_LOW_THRESH) / LUT_STEP


_CURVES: dict[tuple[int, int], list[float]] = {}


def raw12_for(unit: int, atten: int, volts: float) -> int:
    """The 12-bit reading of a typical chip for ``volts`` on the pad: the one the calibration curve puts nearest (0 below its range,
    4095 above)."""
    curve = _CURVES.get((unit, atten))
    if curve is None:
        curve = _CURVES[(unit, atten)] = [_curve_mv(unit, atten, r) for r in range(4096)]
    mv = volts * 1000
    i = bisect.bisect_left(curve, mv)
    if i == 0:
        return 0
    if i >= len(curve):
        return len(curve) - 1
    return i if curve[i] - mv < mv - curve[i - 1] else i - 1


def part_of(off: int) -> str | None:
    """The part of the SENS block a register outside the ADCs belongs to (None: an ADC register)."""
    if off in ADC_REGISTERS:
        return None
    return next((name for offsets, name in PARTS if off in offsets), "reserved registers")


@dataclass
class Conversion:
    t: float
    unit: int
    channel: int
    gpio: int
    volts: float | None   # the board's voltage on the pad (None: it floats)
    atten: int
    bits: int
    reading: int          # the converter's result (what SARx_DATA_INV = 1, ESP-IDF's setting, gives the firmware)


class AdcState:
    """The SENS block as the firmware wrote it, the conversions it ran, and what it did with the parts that are not simulated."""

    def __init__(self) -> None:
        self.conversions: list[Conversion] = []
        self.other: dict[str, dict[str, int]] = {}  # part → {"reads", "writes"}
        self.reset()

    def reset(self) -> None:
        self.regs: dict[int, int] = dict(RESET_VALUES)
        self.done = {1: False, 2: False}
        self.data = {1: 0, 2: 0}
        self._polled: tuple[int, int] | None = None
        self._polls, self._poll_since = 0, 0.0

    def _count(self, off: int, kind: str) -> None:
        part = part_of(off)
        if part:
            entry = self.other.setdefault(part, {"reads": 0, "writes": 0})
            entry[kind] += 1

    def read(self, reg: int, t: float = 0.0) -> int:
        off = reg - SENS_BASE
        value = self.regs.get(off, 0)
        if off in (MEAS_START1, MEAS_START2):
            unit = 1 if off == MEAS_START1 else 2
            value |= int(self.done[unit]) << 16 | self.data[unit]
        elif off == SLAVE_ADDR1:
            value &= ~MEAS_STATUS
        self._count(off, "reads")
        if self._polled == (off, value) and t - self._poll_since <= POLL_WINDOW_S:
            self._polls += 1
            if self._polls >= POLL_LIMIT:
                part = part_of(off)
                raise AdcUnsupported("sens_polling", f"the firmware keeps reading SENS register {off:#04x} and waits for it to change: " +
                                     (f"{part} {'are' if part.endswith('s') else 'is'} not simulated, so it never does" if part else
                                      "only one-shot ADC conversions the RTC controller starts (MEASx_START_SAR) are simulated, and none is running"))
        else:
            self._polled, self._polls, self._poll_since = (off, value), 1, t
        return value

    def write(self, addr: int, value: int, width: int, t: float, volts: Callable[[int], float | None], hall: bool = False) -> None:
        """Apply a store at ``t``; ``volts(gpio)`` is the board's voltage on a pad, ``hall`` whether the hall sensor is powered."""
        reg = addr & ~3
        shift = (addr & 3) * 8
        mask = ((1 << (8 * width)) - 1) << shift
        off = reg - SENS_BASE
        old = self.regs.get(off, 0)
        merged = (old & ~mask) | ((value << shift) & mask)
        self._polled = None
        self._count(off, "writes")
        if off in (MEAS_START1, MEAS_START2):
            unit = 1 if off == MEAS_START1 else 2
            merged &= ~RESULT_BITS
            self.regs[off] = merged
            if merged & START_SAR and not old & START_SAR:
                self._convert(unit, merged, t, volts, hall)
            elif not merged & START_SAR:
                self.done[unit] = False
            return
        self.regs[off] = merged

    def _convert(self, unit: int, start: int, t: float, volts: Callable[[int], float | None], hall: bool) -> None:
        pads = start >> 19 & 0xFFF
        channel = next((c for c in range(len(CHANNELS[unit])) if pads >> c & 1), None)
        if channel is None:  # no pad: the converter reads an internal input (the RF power detector, a test node)
            self.other.setdefault("the ADCs' internal inputs", {"reads": 0, "writes": 0})["reads"] += 1
            self.data[unit], self.done[unit] = 0, True
            return
        if unit == 1 and hall and channel in HALL_CHANNELS:
            raise AdcUnsupported("hall_sensor", "the firmware reads the hall sensor (ADC1 channel 0 or 3 while RTC_IO_HALL_SENS powers it), "
                                                "which is not simulated")
        gpio = CHANNELS[unit][channel]
        atten = self.regs.get(ATTEN1 if unit == 1 else ATTEN2, 0) >> (2 * channel) & 3
        ctrl = self.regs.get(READ_CTRL if unit == 1 else READ_CTRL2, 0)
        bits = 9 + (ctrl >> 16 & 3)
        inverted = ctrl >> (28 if unit == 1 else 29) & 1
        v = volts(gpio)
        reading = (0 if v is None else raw12_for(unit, atten, v)) >> (12 - bits)
        self.data[unit] = reading if inverted else (1 << bits) - 1 - reading
        self.done[unit] = True
        self.conversions.append(Conversion(t, unit, channel, gpio, v, atten, bits, reading))
