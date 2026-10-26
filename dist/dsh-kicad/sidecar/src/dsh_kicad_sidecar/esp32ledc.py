"""The ESP32's LED PWM controller (LEDC), kept by the sidecar. QEMU stores a few of its registers for a display backlight but has
no duty readback, no fades and no interrupts, so esp32qemu watches the block like the pin registers and answers every access
from here; a pad the GPIO matrix routes to a channel becomes a PWM wave for the board (a duty cycle and a frequency).

From the ESP32 Technical Reference Manual (chapter 28, LED PWM Controller, version 5.9):

- timers: a counter of DUTY_RES bits whose clock is APB_CLK or REF_TICK (high speed), SLOW_CLK (APB_CLK or the 8 MHz RC_FAST
  clock, by LEDC_APB_CLK_SEL) or REF_TICK (low speed), divided by A + B/256 (CLK_DIV_NUM: ten integer bits, eight fraction
  bits): a PWM period is div * 2**res input clocks. Timers come out of reset held in reset. A high-speed timer takes a new
  divider or resolution at once (glitch-free, at its next overflow), a low-speed one only on its PARA_UP;
- channels: the output goes high when the counter reaches HPOINT and low at HPOINT + DUTY[24:4]; DUTY[3:0] dithers, so on
  average the duty is DUTY / 16 / 2**res. DUTY_START (high speed) or PARA_UP (low speed) latches HPOINT, DUTY and the fade:
  every DUTY_CYCLE periods DUTY_SCALE is added (DUTY_INC) or subtracted, DUTY_NUM times, then DUTY_CHNG_END is raised (a plain
  duty change is a fade of one step of 0). With SIG_OUT_EN off the channel outputs IDLE_LV.

A latched change starts at the store here; the chip starts it at the end of the period (at most one period later).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

LEDC_BASE, LEDC_SIZE = 0x3FF59000, 0x200
LEDC_INT_SOURCE = 43   # ETS_LEDC_INTR_SOURCE in the interrupt matrix
# GPIO matrix output signals of the channels (ESP-IDF's gpio_sig_map.h): channel index = group * 8 + channel
SIGNALS = {**{71 + c: c for c in range(8)}, **{79 + c: 8 + c for c in range(8)}}
GROUPS = ("high-speed", "low-speed")
REF_TICK_HZ, RC_FAST_HZ = 1e6, 8e6
TIMERS, INT_RAW, INT_ST, INT_ENA, INT_CLR, CONF, DATE = 0x140, 0x180, 0x184, 0x188, 0x18C, 0x190, 0x1FC
TIMER_RST, TIMER_PAUSE, TIMER_TICK_SEL, LS_TIMER_PARA_UP = 1 << 24, 1 << 23, 1 << 25, 1 << 26
LS_CHANNEL_PARA_UP, DUTY_START = 1 << 4, 1 << 31
DUTY_CHNG_END = 8      # INT_RAW bit of channel 0's DUTY_CHNG_END; bits 0-7 are the timers' overflows
MAX_SAMPLES = 200      # a fade is followed on the board at most this many steps per stretch of time


class LedcUnsupported(Exception):
    def __init__(self, what: str, detail: str):
        super().__init__(detail)
        self.what, self.detail = what, detail


def channel_name(index: int) -> str:
    return f"LEDC {GROUPS[index // 8]} channel {index % 8}"


@dataclass
class Change:
    """A latched duty: DUTY (21.4 fixed point) at ``start``, then ``num`` steps of ``scale`` up or down, one every ``cycle``
    periods of ``period`` seconds (None: the timer was not running, the duty stays)."""
    start: float
    duty: int
    up: bool
    num: int
    cycle: int
    scale: int
    period: float | None
    flagged: bool = False  # DUTY_CHNG_END raised

    @property
    def end(self) -> float:
        return math.inf if self.period is None else self.start + self.num * self.cycle * self.period

    def steps(self, t: float) -> int:
        if self.period is None or not self.num:
            return 0
        return min(self.num, max(0, math.floor((t - self.start) / (self.cycle * self.period) + 1e-9)))

    def duty_at(self, t: float) -> int:
        n = self.steps(t)
        whole = (self.duty >> 4) + (n * self.scale if self.up else -n * self.scale)
        return max(0, min(whole, (1 << 20) - 1)) << 4 | (self.duty & 0xF)


class LedcState:
    """The LEDC registers as the firmware wrote them, and what they make of each channel over time."""

    def __init__(self) -> None:
        self.apb_hz = 80e6  # the machine updates it from the clock configuration
        self.reset()

    def reset(self) -> None:
        self.regs: dict[int, int] = {TIMERS + 8 * i: TIMER_RST for i in range(8)}
        self.timers = [(0, 0)] * 8                  # (DUTY_RES, CLK_DIV_NUM) in effect: a low-speed timer's latch on PARA_UP
        self.started = [0.0] * 8                    # when each counter last left reset (or resumed), for its value
        self.paused_count = [0] * 8
        self.hpoints = [0] * 16                     # HPOINT in effect per channel
        self.changes: dict[int, Change] = {}        # the duty in effect per channel (none: 0)
        self.int_raw = 0

    # ---- registers ----
    @staticmethod
    def _channel(off: int) -> tuple[int, int]:
        """(channel index, offset in the channel's five registers) of a channel register."""
        group, rel = (0, off) if off < 0xA0 else (1, off - 0xA0)
        c, field = divmod(rel, 0x14)
        return group * 8 + c, field

    @staticmethod
    def _base(index: int) -> int:
        return (0 if index < 8 else 0xA0) + 0x14 * (index % 8)

    def timer_of(self, index: int) -> int:
        """The timer a channel counts with (0-3 high speed, 4-7 low speed)."""
        return (index // 8) * 4 + (self.regs.get(self._base(index), 0) & 3)

    def read(self, reg: int, t: float) -> int:
        off = reg - LEDC_BASE
        if off < TIMERS:
            index, field = self._channel(off)
            if field == 0x10:
                return self.duty(index, t)       # DUTY_R: the duty now, fades included
            return self.regs.get(off, 0)
        if off < INT_RAW:
            timer, field = divmod(off - TIMERS, 8)
            return self.count(timer, t) if field == 4 else self.regs.get(off, 0)
        if off == INT_RAW:
            return self.int_raw
        if off == INT_ST:
            return self.int_raw & self.regs.get(INT_ENA, 0)
        if off == INT_CLR:
            return 0
        if off == DATE:
            return self.regs.get(off, 0x16031700)
        return self.regs.get(off, 0)

    def write(self, addr: int, value: int, width: int, t: float) -> set[int]:
        """Apply a store at ``t``; the channels whose output may have changed. LedcUnsupported for what is not simulated."""
        reg = addr & ~3
        shift = (addr & 3) * 8
        mask = ((1 << (8 * width)) - 1) << shift
        bits = (value << shift) & mask
        off = reg - LEDC_BASE
        merged = (self.regs.get(off, 0) & ~mask) | bits
        if off < TIMERS:
            index, field = self._channel(off)
            if field == 0x10:
                return set()                     # DUTY_R is read-only
            self.regs[off] = merged
            if field == 0:                       # CONF0: TIMER_SEL, SIG_OUT_EN and IDLE_LV count at once
                if index >= 8 and merged & LS_CHANNEL_PARA_UP:
                    self.regs[off] = merged & ~LS_CHANNEL_PARA_UP
                    self._latch(index, t)
                return {index}
            if field == 0xC and index < 8 and merged & DUTY_START:
                self._latch(index, t)
                return {index}
            return set()
        if off < INT_RAW:
            timer, field = divmod(off - TIMERS, 8)
            if field == 4:
                return set()                     # the counter is read-only
            old = self.regs.get(off, 0)
            self.regs[off] = merged & ~LS_TIMER_PARA_UP
            if old & (TIMER_RST | TIMER_PAUSE) and not merged & (TIMER_RST | TIMER_PAUSE):
                self.started[timer] = t          # the counter runs again (from 0 after a reset)
                if old & TIMER_RST:
                    self.paused_count[timer] = 0
            elif merged & TIMER_PAUSE and not old & TIMER_PAUSE:
                self.paused_count[timer] = self.count(timer, t, old)
            if timer < 4 or merged & LS_TIMER_PARA_UP:
                self.timers[timer] = (merged & 0x1F, merged >> 5 & 0x3FFFF)
            return {i for i in range(16) if self.timer_of(i) == timer}
        if off == INT_ENA:
            self.regs[off] = merged
            if merged & 0xFF:
                raise LedcUnsupported("ledc_timer_interrupt", "the firmware enabled a LEDC timer-overflow interrupt, which fires every "
                                                              "PWM period: not simulated")
            return set()
        if off == INT_CLR:
            self.int_raw &= ~bits
            return set()
        if off in (INT_RAW, INT_ST):
            return set()
        self.regs[off] = merged
        return set(range(8, 16)) if off == CONF else set()  # LEDC_APB_CLK_SEL: the low-speed timers' clock

    def _latch(self, index: int, t: float) -> None:
        """DUTY_START or PARA_UP: the channel takes HPOINT and DUTY, and with DUTY_START the fade (DUTY_START clears itself)."""
        base = self._base(index)
        conf1 = self.regs.get(base + 0xC, 0)
        self.hpoints[index] = self.regs.get(base + 4, 0) & 0xFFFFF
        duty = self.regs.get(base + 8, 0) & 0x1FFFFFF
        period = self.period(self.timer_of(index))
        if conf1 & DUTY_START:
            self.regs[base + 0xC] = conf1 & ~DUTY_START
            self.changes[index] = Change(t, duty, bool(conf1 >> 30 & 1), conf1 >> 20 & 0x3FF, max(1, conf1 >> 10 & 0x3FF), conf1 & 0x3FF, period)
        else:
            self.changes[index] = Change(t, duty, True, 0, 1, 0, period, flagged=True)

    # ---- time ----
    def clock_hz(self, timer: int) -> float:
        tick = self.regs.get(TIMERS + 8 * timer, 0) & TIMER_TICK_SEL
        if timer < 4:
            return self.apb_hz if tick else REF_TICK_HZ
        return (self.apb_hz if self.regs.get(CONF, 0) & 1 else RC_FAST_HZ) if tick else REF_TICK_HZ

    def period(self, timer: int) -> float | None:
        """Seconds per PWM period of a timer, None when it does not count (held in reset, paused, no divider)."""
        if self.regs.get(TIMERS + 8 * timer, 0) & (TIMER_RST | TIMER_PAUSE):
            return None
        res, div = self.timers[timer]
        if not div or not res:
            return None
        return (div / 256) * (1 << res) / self.clock_hz(timer)

    def count(self, timer: int, t: float, conf: int | None = None) -> int:
        """The timer's counter at ``t`` (LEDC_xSTIMERx_VALUE)."""
        conf = self.regs.get(TIMERS + 8 * timer, 0) if conf is None else conf
        if conf & TIMER_RST:
            return 0
        if conf & TIMER_PAUSE:
            return self.paused_count[timer]
        res, div = self.timers[timer]
        if not div or not res:
            return 0
        ticks = (t - self.started[timer]) * self.clock_hz(timer) / (div / 256)
        return (int(ticks) + self.paused_count[timer]) % (1 << res)

    def duty(self, index: int, t: float) -> int:
        change = self.changes.get(index)
        return change.duty_at(t) if change else 0

    def wave(self, index: int, t: float) -> tuple[str, float, float]:
        """What a channel puts out at ``t``: ("level", 0|1, 0), ("pwm", duty 0-1, Hz), or ("unknown", 0, 0) when its timer does
        not count (its level is whichever it had then, which this model does not keep)."""
        conf0 = self.regs.get(self._base(index), 0)
        if not conf0 >> 2 & 1:
            return ("level", conf0 >> 3 & 1, 0.0)   # SIG_OUT_EN off: IDLE_LV
        timer = self.timer_of(index)
        period = self.period(timer)
        if period is None:
            return ("unknown", 0.0, 0.0)
        top = 1 << self.timers[timer][0]
        duty = self.duty(index, t)
        hpoint = self.hpoints[index]
        if duty == 0 or hpoint >= top:
            return ("level", 0, 0.0)                 # never set high (or set and cleared at the same count)
        if hpoint + (duty >> 4) >= top:
            return ("level", 1, 0.0)                 # the low point is beyond the counter: high for good
        return ("pwm", duty / 16 / top, 1 / period)

    def why_unknown(self, index: int) -> str:
        timer = self.timer_of(index)
        conf = self.regs.get(TIMERS + 8 * timer, 0)
        state = "held in reset" if conf & TIMER_RST else "paused" if conf & TIMER_PAUSE else "not configured (no divider or resolution)"
        return f"its timer ({GROUPS[timer // 4]} timer {timer % 4}) is {state}, so the pad keeps whatever level it had"

    # ---- events ----
    def advance(self, t: float) -> set[int]:
        """Raise DUTY_CHNG_END for the changes that ended by ``t``; the channels whose fade ended."""
        ended = set()
        for index, change in self.changes.items():
            if not change.flagged and change.end <= t + 1e-12:
                change.flagged = True
                self.int_raw |= 1 << (DUTY_CHNG_END + index)
                ended.add(index)
        return ended

    def next_event(self) -> float | None:
        """When the next change whose end interrupt is enabled ends (the machine stops there to raise it)."""
        enabled = self.regs.get(INT_ENA, 0)
        ends = [c.end for i, c in self.changes.items() if not c.flagged and enabled >> (DUTY_CHNG_END + i) & 1 and c.end < math.inf]
        return min(ends) if ends else None

    def interrupt(self) -> bool:
        """LEDC's interrupt line: a raised event whose interrupt is enabled."""
        return bool(self.int_raw & self.regs.get(INT_ENA, 0))

    def change_points(self, index: int, t0: float, t1: float) -> list[float]:
        """The moments in (t0, t1] at which a fade on the channel changes the duty (at most MAX_SAMPLES of them, evenly spread)."""
        change = self.changes.get(index)
        if change is None or change.period is None or not change.num or not change.scale:
            return []
        step = change.cycle * change.period
        first = max(1, math.floor((t0 - change.start) / step + 1e-9) + 1)
        last = min(change.num, math.floor((t1 - change.start) / step + 1e-9))
        if last < first:
            return []
        stride = max(1, math.ceil((last - first + 1) / MAX_SAMPLES))
        points = [change.start + k * step for k in range(first, last + 1, stride)]
        if points[-1] < change.start + last * step:
            points.append(change.start + last * step)
        return points
