"""ATtiny25/45/85 peripherals beyond the CPU core, as mixins of ``Avr``: Timer/Counter1 with its PLL clock, the watchdog, EEPROM, the USI
in three-wire mode and the analog comparator. Behaviour follows the ATtiny25/45/85 datasheet (Atmel 2586Q); what the datasheet allows and
is not modelled (two-wire USI, dead-time generators, forced output compares, Timer0-clocked USI) is refused, never approximated.

A mixin keeps its own state in ``_init_<name>`` (called at power-on and at every reset), registers I/O addresses in ``IO_READ`` / ``IO_WRITE``
and schedules work through ``self.events[<name>]`` (the cycle of its next event). See avr.py for the base class.
"""

from __future__ import annotations

from typing import Any

INF = 1 << 62

# ---- Timer/Counter1 --------------------------------------------------------------------------
TCNT1, OCR1A, OCR1B, OCR1C, TCCR1, GTCCR, PLLCSR = 0x2F, 0x2E, 0x2B, 0x2D, 0x30, 0x2C, 0x27
PCK_HZ = 64_000_000
PLL_LOCK_S = 100e-6  # the datasheet: steady state within 100 µs


class Timer1Mixin:
    def _init_timer1(self) -> None:
        self.tccr1 = 0
        self.gtccr = 0           # PWM1B, COM1B1:0 (the other bits are strobes)
        self.tcnt1 = 0
        self.ocr1a = 0           # as written
        self.ocr1b = 0
        self.ocr1c = 0xFF
        self.ocr1a_eff = 0       # as latched: in PWM mode OCR1A/B take effect when the counter reaches OCR1C
        self.ocr1b_eff = 0
        self.t1_last = self.cycle
        self.t1_acc = 0          # remainder of the tick conversion (exact integer arithmetic)
        self.plle = False
        self.pcke = False
        self.lsm = False
        self.pll_lock_at = INF   # seconds
        self.events["t1"] = INF

    # -- configuration --
    def t1_pwm(self) -> bool:
        return bool(self.tccr1 & 0x40 or self.gtccr & 0x40)

    def t1_top(self) -> int:
        return self.ocr1c if (self.t1_pwm() or self.tccr1 & 0x80) else 0xFF

    def t1_div(self) -> int:
        cs = self.tccr1 & 0x0F
        return 0 if cs == 0 else 1 << (cs - 1)

    def t1_clock(self) -> int:
        """Timer1 input clock in Hz before the prescaler: the PLL's 64 MHz (32 MHz in low-speed mode) or the CPU clock."""
        return (PCK_HZ // 2 if self.lsm else PCK_HZ) if self.pcke else self.clock_hz

    def t1_tick_hz(self) -> float:
        div = self.t1_div()
        return self.t1_clock() / div if div else 0.0

    def t1_check(self, tccr1: int, gtccr: int) -> None:
        pwm = bool(tccr1 & 0x40 or gtccr & 0x40)
        for name, com, own_pwm in (("OC1A", tccr1 >> 4 & 3, tccr1 & 0x40), ("OC1B", gtccr >> 4 & 3, gtccr & 0x40)):
            if com in (2, 3) and not pwm:
                raise self.unsupported("Timer1", f"the firmware sets {name} to clear/set on compare match outside PWM mode; only toggling and PWM outputs are simulated")
            if com and pwm and not own_pwm:
                raise self.unsupported("Timer1", f"the firmware drives {name} from a compare unit that is not in PWM mode while the other one is; mixed modes are not simulated")

    # -- counting --
    def t1_sync(self) -> None:
        div = self.t1_div()
        elapsed = self.cycle - self.t1_last
        self.t1_last = self.cycle
        if not div or elapsed <= 0 or self.sleeping_power_down:
            return
        den = div * self.clock_hz
        ticks, self.t1_acc = divmod(elapsed * self.t1_clock() + self.t1_acc, den)
        if ticks > 0:
            self.t1_advance(ticks)

    def t1_events(self) -> dict[int, list[int]]:
        """Where in the counter cycle each flag is set (arrival at the position): OCF1A, OCF1B, TOV1."""
        top = self.t1_top()
        pos = {0x40: [self.ocr1a_eff] if self.ocr1a_eff <= top else [], 0x20: [self.ocr1b_eff] if self.ocr1b_eff <= top else []}
        if self.t1_pwm():
            pos[0x04] = [top]  # PWM mode: TOV1 when the counter reaches OCR1C
        elif self.tccr1 & 0x80 and top < 0xFF:
            pos[0x04] = []     # cleared by OCR1C before it can overflow
        else:
            pos[0x04] = [0]    # FF → 00
        return pos

    def t1_advance(self, ticks: int) -> None:
        top = self.t1_top()
        pwm = self.t1_pwm()
        if self.tcnt1 > top:  # above OCR1C (it was lowered or TCNT1 written): counts on to 0xFF and wraps
            to_wrap = 256 - self.tcnt1
            for flag, ocr in ((0x40, self.ocr1a_eff), (0x20, self.ocr1b_eff)):
                if self.tcnt1 < ocr <= 0xFF and ocr - self.tcnt1 <= ticks:
                    self.tifr |= flag
            if ticks < to_wrap:
                self.tcnt1 += ticks
                return
            ticks -= to_wrap
            self.tcnt1 = 0
            self.tifr |= 0x04
            self.t1_latch()
        period = top + 1
        p = self.tcnt1
        for flag, positions in self.t1_events().items():
            if any(((pos - p - 1) % period) < ticks for pos in positions):
                self.tifr |= flag
        if pwm and ((top - p - 1) % period) < ticks:
            self.t1_latch()  # the counter reached OCR1C: the written compare values take effect
        self.tcnt1 = (p + ticks) % period

    def t1_latch(self) -> None:
        if self.ocr1a_eff != self.ocr1a or self.ocr1b_eff != self.ocr1b:
            self.ocr1a_eff, self.ocr1b_eff = self.ocr1a, self.ocr1b
            self.pwm_changed()

    def t1_plan(self) -> None:
        """Cycle of the next event that must be handled: an enabled flag, or the latch of a pending PWM compare value."""
        self.events["t1"] = INF
        div = self.t1_div()
        if not div:
            return
        top = self.t1_top()
        if self.tcnt1 > top:
            return  # the counter is above OCR1C: the next sync resolves it
        period = top + 1
        p = self.tcnt1
        best = None
        for flag, positions in self.t1_events().items():
            if self.timsk & flag:
                for pos in positions:
                    ticks = (pos - p - 1) % period + 1
                    best = ticks if best is None else min(best, ticks)
        if self.t1_pwm() and (self.ocr1a_eff != self.ocr1a or self.ocr1b_eff != self.ocr1b):
            ticks = (top - p - 1) % period + 1  # the counter reaches OCR1C: the written compare values take effect
            best = ticks if best is None else min(best, ticks)
        if best is not None:
            need = best * div * self.clock_hz - self.t1_acc
            self.events["t1"] = self.t1_last + max(1, -(-need // self.t1_clock()))

    # -- the output compare pins --
    def pwm1_pin(self, bit: int) -> dict[str, float] | None:
        """Waveform on PB1 (OC1A), PB0 (/OC1A), PB4 (OC1B), PB3 (/OC1B) while Timer1 drives it: ``{"duty", "hz"}``."""
        if bit not in (0, 1, 3, 4) or not self.pin_driven(bit):
            return None
        div = self.t1_div()
        if not div:
            return None
        channel_b = bit in (3, 4)
        com = (self.gtccr if channel_b else self.tccr1) >> 4 & 3
        if not com:
            return None
        complementary = bit in (0, 3)
        top = self.t1_top()
        tick = self.t1_tick_hz()
        if not self.t1_pwm():  # toggle on compare match: a square wave at half the counter-cycle rate; OC1x only
            return None if complementary or com != 1 else {"duty": 0.5, "hz": tick / (2 * (top + 1))}
        ocr = self.ocr1b_eff if channel_b else self.ocr1a_eff
        if com == 3:  # set on compare match, cleared at 0: high from the match to the top
            duty = 1.0 if ocr == 0 else 0.0 if ocr >= top else (top + 1 - ocr) / (top + 1)
        else:         # cleared on compare match, set at 0: high until the match
            duty = 0.0 if ocr == 0 else 1.0 if ocr >= top else ocr / (top + 1)
        if complementary:
            if com != 1:
                return None  # /OC1x is connected only for COM1x = 01
            duty = 1.0 - duty
        return {"duty": duty, "hz": tick / (top + 1)}

    # -- registers --
    def t1_read(self, a: int) -> int:
        if a == TCNT1:
            self.t1_sync()
            return self.tcnt1
        if a == TCCR1:
            return self.tccr1
        if a == GTCCR:
            return self.gtccr & 0xFC & 0x70  # the strobes read as zero
        if a == OCR1A:
            return self.ocr1a
        if a == OCR1B:
            return self.ocr1b
        if a == OCR1C:
            return self.ocr1c
        return self.pll_read()

    def t1_write(self, a: int, v: int) -> None:
        self.t1_sync()
        if a == TCCR1:
            self.t1_check(v, self.gtccr)
            self.tccr1 = v
            if not self.t1_pwm():
                self.ocr1a_eff, self.ocr1b_eff = self.ocr1a, self.ocr1b
        elif a == GTCCR:
            if v & 0x80:
                raise self.unsupported("Timer1", "the firmware sets TSM (timer synchronisation mode); it is not simulated")
            if v & 0x0C:
                raise self.unsupported("Timer1", "the firmware forces an output compare (FOC1A/FOC1B); it is not simulated")
            self.t1_check(self.tccr1, v & 0x70)
            self.gtccr = v & 0x70
            if v & 0x02:
                self.t1_acc = 0       # PSR1: reset the Timer1 prescaler
            if v & 0x01:
                self.t0_psc = 0       # PSR0: reset the Timer0 prescaler
            if not self.t1_pwm():
                self.ocr1a_eff, self.ocr1b_eff = self.ocr1a, self.ocr1b
        elif a == TCNT1:
            self.tcnt1 = v
        elif a == OCR1A:
            self.ocr1a = v
            if not self.t1_pwm() or not self.t1_div():
                self.ocr1a_eff = v
        elif a == OCR1B:
            self.ocr1b = v
            if not self.t1_pwm() or not self.t1_div():
                self.ocr1b_eff = v
        elif a == OCR1C:
            self.ocr1c = v
        else:
            self.pll_write(v)
        self.t1_plan()
        self.pwm_changed()
        self.replan()

    # -- PLL (the asynchronous clock for Timer1) --
    def pll_read(self) -> int:
        lock = self.plle and self.now() >= self.pll_lock_at
        return (self.lsm << 7) | (self.pcke << 2) | (self.plle << 1) | int(lock)

    def pll_write(self, v: int) -> None:
        was = self.plle
        self.plle = bool(v & 0x02)
        if self.plle and not was:
            self.pll_lock_at = self.now() + PLL_LOCK_S
        if not self.plle:
            self.pcke = False
            self.pll_lock_at = INF
        else:
            self.pcke = bool(v & 0x04)  # only settable while the PLL is enabled
        self.lsm = bool(v & 0x80)


# ---- the watchdog ----------------------------------------------------------------------------
WDTCR, MCUSR = 0x21, 0x34
WDT_HZ = 128_000
WDT_CYCLES = [2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576]


class WatchdogMixin:
    def _init_watchdog(self) -> None:
        self.wdtcr = 0
        self.wdce_until = -1
        self.wdt_start = self.now()
        self.events["wdt"] = INF

    def wdt_timeout(self) -> float:
        wdp = (self.wdtcr >> 2 & 8) | (self.wdtcr & 7)  # WDP3 is bit 5
        return WDT_CYCLES[min(wdp, 9)] / WDT_HZ

    def wdt_running(self) -> bool:
        return bool(self.wdtcr & 0x48)

    def wdt_plan(self) -> None:
        self.events["wdt"] = self.cycle_for(self.wdt_start + self.wdt_timeout()) if self.wdt_running() else INF

    def wdt_reset(self) -> None:
        """The WDR instruction."""
        self.wdt_start = self.now()
        self.wdt_plan()
        self.replan()

    def wdt_read(self) -> int:
        v = self.wdtcr & ~0x10
        if self.cycle <= self.wdce_until:
            v |= 0x10
        if self.mcusr & 0x08:
            v |= 0x08  # WDE is overridden by WDRF
        return v

    def wdt_write(self, v: int) -> None:
        was_running = self.wdt_running()
        old = self.wdtcr
        window = self.cycle <= self.wdce_until           # the timed sequence opened by an earlier WDCE | WDE write
        if v & 0x10 and v & 0x08:
            self.wdce_until = self.cycle + 4
        new = v & 0x6F                                    # WDIE, WDP3, WDE, WDP2:0 (WDCE and WDIF are handled apart)
        if old & 0x08 and not new & 0x08 and not window:
            new |= 0x08                                   # WDE can only be cleared inside the window
        if self.mcusr & 0x08:
            new |= 0x08                                   # WDE is overridden by WDRF
        wdif = old & 0x80 and not v & 0x80                # writing 1 clears WDIF
        self.wdtcr = new | (0x80 if wdif else 0)
        if self.wdt_running() and not was_running:
            self.wdt_start = self.now()
        self.wdt_plan()
        self.replan()

    def wdt_event(self) -> None:
        """The watchdog timed out: an interrupt, an interrupt then a reset, or a reset."""
        due = self.now()
        if self.wdtcr & 0x40:            # WDIE: interrupt mode
            self.wdtcr |= 0x80
            if self.wdtcr & 0x08:
                self.wdtcr &= ~0x40      # with WDE the interrupt is armed once: the next time-out resets
            self.wdt_start = due
            self.wdt_plan()
        elif self.wdtcr & 0x08:
            self.reset("watchdog")
            return
        self.replan()


# ---- EEPROM ----------------------------------------------------------------------------------
EECR, EEDR, EEARL, EEARH = 0x1C, 0x1D, 0x1E, 0x1F
EE_ATOMIC_S, EE_SPLIT_S = 3.4e-3, 1.8e-3


class EepromMixin:
    def _init_eeprom(self) -> None:
        """Registers at power-on and reset; a write already in progress completes (it is not part of the reset)."""
        busy = getattr(self, "ee_busy", False)
        self.eecr = 0
        self.eedr = 0
        self.eear = 0
        self.eempe_until = -1
        if not busy:
            self.ee_busy = False
            self.ee_op: tuple[int, int, int] | None = None
            self.events["ee"] = INF

    def ee_sync(self) -> None:
        if self.ee_busy and self.cycle >= self.events["ee"]:
            self.ee_finish()

    def ee_finish(self) -> None:
        mode, addr, data = self.ee_op  # type: ignore[misc]
        size = len(self.eeprom)
        a = addr % size
        self.eeprom[a] = data if mode == 0 else 0xFF if mode == 1 else (self.eeprom[a] & data)  # write-only into an unerased cell: bits can only clear
        self.eeprom_log.append((self.now(), a, self.eeprom[a]))
        self.ee_busy = False
        self.ee_op = None
        self.events["ee"] = INF
        self.replan()

    def ee_read(self, a: int) -> int:
        self.ee_sync()
        if a == EEDR:
            return self.eedr
        if a == EEARL:
            return self.eear & 0xFF
        if a == EEARH:
            return self.eear >> 8 & 0xFF
        v = (self.eecr & 0x38)  # EEPM1:0, EERIE
        if self.cycle <= self.eempe_until:
            v |= 0x04
        if self.ee_busy:
            v |= 0x02
        return v

    def ee_write(self, a: int, v: int) -> None:
        self.ee_sync()
        if a == EEDR:
            if not self.ee_busy:
                self.eedr = v
            return
        if a == EEARL:
            if not self.ee_busy:
                self.eear = (self.eear & 0xFF00) | v
            return
        if a == EEARH:
            if not self.ee_busy:
                self.eear = (self.eear & 0x00FF) | (v << 8)
            return
        self.eecr = (self.eecr & ~0x08) | (v & 0x08)
        if not self.ee_busy:
            self.eecr = (self.eecr & ~0x30) | (v & 0x30)
        if v & 0x04:
            self.eempe_until = self.cycle + 4
        if v & 0x02 and self.cycle <= self.eempe_until and not self.ee_busy:
            mode = self.eecr >> 4 & 3
            if mode == 3:
                raise self.unsupported("EEPROM", "the firmware selects the reserved EEPROM programming mode EEPM = 0b11")
            seconds = EE_ATOMIC_S if mode == 0 else EE_SPLIT_S
            self.ee_busy = True
            self.ee_op = (mode, self.eear, self.eedr)
            self.eempe_until = -1
            self.events["ee"] = self.cycle_for(self.now() + seconds)
            self.halt(2)
        if v & 0x01 and not self.ee_busy:
            self.eedr = self.eeprom[self.eear % len(self.eeprom)]
            self.halt(4)
        self.replan()

    def ee_ready_irq(self) -> bool:
        """EE_RDY: a constant interrupt request while the EEPROM is ready and EERIE is set."""
        return bool(self.eecr & 0x08) and not self.ee_busy


# ---- USI (three-wire mode) -------------------------------------------------------------------
USICR, USISR, USIDR, USIBR = 0x0D, 0x0E, 0x0F, 0x10


class UsiMixin:
    def _init_usi(self) -> None:
        self.usicr = 0
        self.usisr = 0
        self.usidr = 0
        self.usibr = 0
        self.usi_do = 0              # the output latch behind the DO pin (PB1)
        self.usi_sample_bit = 0      # DI sampled on the active edge, shifted in on the shift edge
        self.usi_tx: int | None = None
        self.usi_clksel = False      # USICLK as a clock-select bit (with an external clock source)
        self.usi_slave_reg = 0xFF
        self.usi_slave_loaded = False

    def usi_mode(self) -> int:
        return self.usicr >> 4 & 3

    def usi_drives_do(self) -> bool:
        return self.usi_mode() == 1

    def usi_di(self) -> int:
        """The bit the USI samples on DI: from the scenario's slave device when there is one, else the PB0 pin."""
        if self.usi_slave_loaded or self.usi_slave:
            if not self.usi_slave_loaded:
                self.usi_slave_reg = self.usi_slave.pop(0) if self.usi_slave else 0xFF
                self.usi_slave_loaded = True
            bit = self.usi_slave_reg >> 7 & 1
            self.usi_slave_reg = (self.usi_slave_reg << 1) & 0xFF
            return bit
        return self.pin_value(0)

    def usi_shift(self) -> None:
        if self.usi_tx is None:
            self.usi_tx = self.usidr  # the byte that goes out
        self.usidr = ((self.usidr << 1) | self.usi_di()) & 0xFF
        if self.usicr >> 2 & 3 == 0:  # software strobe: the output latch is transparent
            self.usi_do = self.usidr >> 7
            self._pins_touched = True

    def usi_count(self) -> None:
        count = (self.usisr & 0x0F) + 1
        if count > 15:
            count = 0
            self.usisr |= 0x40
            self.usibr = self.usidr
            self.usi_log.append((self.now(), self.usi_tx if self.usi_tx is not None else 0, self.usidr))
            self.usi_tx = None
            self.usi_slave_loaded = False
        self.usisr = (self.usisr & 0xF0) | count

    def usi_usck_edge(self, rising: bool) -> None:
        """An edge on USCK (PB2): any edge sets USISIF; with an external clock it shifts and counts."""
        if self.usi_mode() == 2 or self.usi_mode() == 3:
            return
        self.usisr |= 0x80
        cs1, cs0, clk = self.usicr >> 3 & 1, self.usicr >> 2 & 1, int(self.usi_clksel)
        if not cs1:
            return
        shift_edge = rising if cs0 == 0 else not rising  # mode 0 samples/shifts on the positive edge, mode 1 on the negative one
        if shift_edge:
            self.usi_shift()
        else:
            self.usi_do = self.usidr >> 7  # the latch follows on the opposite edge
        self._pins_touched = True          # DO may have changed: let the board see it
        if not clk:
            self.usi_count()  # an external clock counts both edges; with USICLK the counter is strobed by USITC instead

    def usi_read(self, a: int) -> int:
        if a == USICR:
            return self.usicr & 0xFC
        if a == USISR:
            return self.usisr
        if a == USIDR:
            return self.usidr
        return self.usibr

    def usi_write(self, a: int, v: int) -> None:
        if a == USICR:
            if v >> 4 & 3 in (2, 3):
                raise self.unsupported("USI", "the firmware selects the USI two-wire mode (I²C); only three-wire mode (SPI) is simulated")
            if v >> 2 & 3 == 1:
                raise self.unsupported("USI", "the firmware clocks the USI from a Timer0 compare match; only software strobes and an external clock are simulated")
            cs1 = v >> 3 & 1
            self.usicr = v & 0xFC
            self.usi_clksel = bool(v & 0x02) if cs1 else False
            if not cs1 and v & 0x02:        # USICLK with the software-strobe clock source: shift and count
                self.usi_shift()
                self.usi_count()
            if v & 0x01:                    # USITC: toggle the USCK port bit; the edge on the pin does the rest
                self.io[0x18] ^= 0x04
                self.pin_config_changed()
                if cs1 and self.usi_clksel:  # with an external clock and USICLK, USITC also strobes the counter
                    self.usi_count()
                    self.pin_config_changed()
                return
            self.pin_config_changed()
        elif a == USISR:
            self.usisr &= ~(v & 0xE0)  # flags clear by writing 1
            self.usisr = (self.usisr & 0xF0) | (v & 0x0F)
            self.usi_tx = None  # a new transfer starts: the next shift takes the byte to send
        elif a == USIDR:
            self.usidr = v
            self.usi_do = v >> 7
            self.pin_config_changed()
        # USIBR is read-only


# ---- the analog comparator -------------------------------------------------------------------
ACSR = 0x08


class ComparatorMixin:
    def _init_comparator(self) -> None:
        self.acsr = 0       # ACD, ACBG, ACI, ACIE, ACIS1:0 (ACO is computed)
        self.aco = 0

    def comparator_inputs(self) -> tuple[float, float] | None:
        if self.adc_input is None:
            return None
        vp = 1.1 if self.acsr & 0x40 else self.adc_input(0)
        vn = self.adc_input(1)
        if vp is None and not self.acsr & 0x40:
            self.floating_reads.setdefault(0, self.cycle)
        if vn is None:
            self.floating_reads.setdefault(1, self.cycle)
        return (0.0 if vp is None else vp), (0.0 if vn is None else vn)

    def comparator_update(self, interrupt: bool = True) -> None:
        if self.acsr & 0x80:
            self.aco = 0
            return
        values = self.comparator_inputs()
        if values is None:
            return
        new = int(values[0] > values[1])
        old = self.aco
        self.aco = new
        if interrupt and new != old:
            mode = self.acsr & 3
            if mode == 0 or (mode == 2 and not new) or (mode == 3 and new):
                self.acsr |= 0x10

    def comparator_read(self) -> int:
        if not self.acsr & 0x80:
            if self.adc_input is None:
                raise self.unsupported("comparator", "the firmware reads the analog comparator, but no board is attached to say what is on AIN0 and AIN1")
            self.comparator_update(False)
        return (self.acsr & 0xDB) | (self.aco << 5)

    def comparator_write(self, v: int) -> None:
        if v & 3 == 1:
            raise self.unsupported("comparator", "the firmware selects the reserved analog comparator interrupt mode ACIS = 0b01")
        self.acsr = (self.acsr & 0x10 & ~v) | (v & 0xCB)  # ACI clears by writing 1
        self.comparator_update(False)
