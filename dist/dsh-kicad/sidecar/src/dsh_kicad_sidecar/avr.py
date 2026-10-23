"""An ATtiny25/45/85 simulator: the AVR instruction set, GPIO, the external, pin-change and peripheral interrupts, Timer0 and Timer1 (their
counting modes, compare outputs and PWM as duty cycle and frequency, the PLL clock), the ADC (single-ended and differential, the bandgap and the
temperature sensor), the analog comparator, EEPROM, the watchdog, resets, the USI in three-wire mode, and sleep. Behaviour follows the datasheet
(Atmel 2586Q). It is not a general AVR emulator: what it does not model (two-wire USI, dead-time generators, Timer0-clocked USI, forced output
compares, brown-out) it refuses (``Unsupported``), because a wrong verdict is worse than none.

Pure Python, no dependencies. The board around the chip (what is wired to the pins) is not here: the owner sets ``input_levels``, ``adc_input``
and gets ``on_pin_change`` calls (see mcusim.py). Peripherals beyond Timer0 and the ADC live in avrperiph.py as mixins.
"""

from __future__ import annotations

import math
import struct
from typing import Any, Callable

from .avrperiph import INF, ComparatorMixin, EepromMixin, Timer1Mixin, UsiMixin, WatchdogMixin

__all__ = ["Avr", "AvrError", "Unsupported", "IllegalInstruction", "DEVICES", "load_firmware", "load_image", "parse_ihex"]

# status register bits
C, Z, N, V, S, H, T, I = (1 << i for i in range(8))

# per device: flash bytes, SRAM bytes, EEPROM bytes (datasheet: ATtiny25/45/85)
DEVICES = {
    "attiny25": {"flash": 2048, "sram": 128, "eeprom": 128},
    "attiny45": {"flash": 4096, "sram": 256, "eeprom": 256},
    "attiny85": {"flash": 8192, "sram": 512, "eeprom": 512},
}
FLASH_BYTES = 8192  # the largest: parse_ihex / load_firmware default
SRAM_START = 0x60
IO_BASE = 0x20  # data space address of I/O address 0
RESET_DELAY_S = 0.064  # the default fuses (SUT = 10): 14 CK + 64 ms before a reset releases the CPU
RESET_CAUSES = {"external": 0x02, "watchdog": 0x08, "brownout": 0x04}

# I/O addresses (iotn85.h)
ADCSRB, ADCL, ADCH, ADCSRA, ADMUX, ACSR = 0x03, 0x04, 0x05, 0x06, 0x07, 0x08
USICR, USISR, USIDR, USIBR = 0x0D, 0x0E, 0x0F, 0x10
DIDR0, PCMSK, PINB, DDRB, PORTB = 0x14, 0x15, 0x16, 0x17, 0x18
EECR, EEDR, EEARL, EEARH = 0x1C, 0x1D, 0x1E, 0x1F
PRR, WDTCR, DWDR, CLKPR, PLLCSR = 0x20, 0x21, 0x22, 0x26, 0x27
OCR0B, OCR0A, TCCR0A, OCR1B, GTCCR, OCR1C, OCR1A, TCNT1, TCCR1 = 0x28, 0x29, 0x2A, 0x2B, 0x2C, 0x2D, 0x2E, 0x2F, 0x30
OSCCAL, TCNT0, TCCR0B, MCUSR, MCUCR, SPMCSR, TIFR, TIMSK, GIFR, GIMSK = 0x31, 0x32, 0x33, 0x34, 0x35, 0x37, 0x38, 0x39, 0x3A, 0x3B
SPL, SPH, SREG = 0x3D, 0x3E, 0x3F

ADC_PRESCALERS = {0: 2, 1: 2, 2: 4, 3: 8, 4: 16, 5: 32, 6: 64, 7: 128}
ADC_PINS = {0: 5, 1: 2, 2: 4, 3: 3}  # single-ended channel → PORTB bit
# differential channels: MUX[3:0] → (positive pin bit, negative pin bit, gain); ADC0 = PB5, ADC1 = PB2, ADC2 = PB4, ADC3 = PB3
ADC_DIFF = {0b0100: (4, 4, 1), 0b0101: (4, 4, 20), 0b0110: (4, 3, 1), 0b0111: (4, 3, 20),
            0b1000: (5, 5, 1), 0b1001: (5, 5, 20), 0b1010: (5, 2, 1), 0b1011: (5, 2, 20)}
TEMPERATURE_LSB = ((-40.0, 230.0), (25.0, 300.0), (85.0, 370.0))  # datasheet Table 17-2, against the 1.1 V reference
PRESCALERS = {1: 1, 2: 8, 3: 64, 4: 256, 5: 1024}

UNSUPPORTED_WHY = {
    "ADC": "this ADC feature is not simulated", "USI": "this USI feature is not simulated", "EEPROM": "this EEPROM feature is not simulated",
    "Timer1": "this Timer1 feature is not simulated", "debugWIRE": "debugWIRE is not simulated",
    "SPM": "self-programming is not simulated", "comparator": "this analog comparator feature is not simulated",
}


class AvrError(RuntimeError):
    """The simulated chip cannot go on."""


class Unsupported(AvrError):
    """The firmware uses something that is not simulated."""

    def __init__(self, what: str, detail: str, pc: int, cycle: int):
        super().__init__(f"{detail} (word address 0x{pc:04X}, cycle {cycle})")
        self.what, self.detail, self.pc, self.cycle = what, detail, pc, cycle


class IllegalInstruction(AvrError):
    pass


# ---- firmware files --------------------------------------------------------------------------
def parse_ihex(text: str, flash_bytes: int = FLASH_BYTES) -> bytes:
    """Intel HEX → flash image (gaps are 0xFF)."""
    image = bytearray(b"\xff" * flash_bytes)
    base = 0
    top = 0
    for number, line in enumerate(text.splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        if not line.startswith(":"):
            raise AvrError(f"line {number}: not an Intel HEX record")
        try:
            raw = bytes.fromhex(line[1:])
        except ValueError as exc:
            raise AvrError(f"line {number}: bad hex digits") from exc
        if len(raw) < 5 or raw[0] != len(raw) - 5 or sum(raw) & 0xFF:
            raise AvrError(f"line {number}: bad length or checksum")
        length, address, kind = raw[0], (raw[1] << 8) | raw[2], raw[3]
        data = raw[4:4 + length]
        if kind == 0:
            start = base + address
            if start + length > flash_bytes:
                raise AvrError(f"line {number}: data beyond the device's {flash_bytes} bytes of flash (0x{start + length:X})")
            image[start:start + length] = data
            top = max(top, start + length)
        elif kind == 1:
            break
        elif kind == 2:
            base = ((data[0] << 8) | data[1]) << 4
        elif kind == 4:
            base = ((data[0] << 8) | data[1]) << 16
    if not top:
        raise AvrError("the HEX file holds no program data")
    return bytes(image)


def _elf_image(data: bytes, flash_bytes: int, eeprom_bytes: int) -> tuple[bytes, bytes | None]:
    if data[:4] != b"\x7fELF" or data[4] != 1 or data[5] != 1:
        raise AvrError("not a 32-bit little-endian ELF file")
    machine = struct.unpack_from("<H", data, 18)[0]
    if machine != 83:
        raise AvrError(f"the ELF file is for machine {machine}, not AVR (83)")
    phoff, phentsize, phnum = struct.unpack_from("<I", data, 28)[0], struct.unpack_from("<H", data, 42)[0], struct.unpack_from("<H", data, 44)[0]
    image = bytearray(b"\xff" * flash_bytes)
    eeprom = bytearray(b"\xff" * eeprom_bytes)
    top = 0
    has_eeprom = False
    for i in range(phnum):
        p_type, p_offset, _, p_paddr, p_filesz, _, _, _ = struct.unpack_from("<8I", data, phoff + i * phentsize)
        if p_type != 1 or not p_filesz:
            continue
        if p_paddr >= 0x810000:  # the EEPROM image (avr-gcc puts .eeprom at 0x810000)
            start = p_paddr - 0x810000
            if start + p_filesz > eeprom_bytes:
                raise AvrError(f"EEPROM data beyond the device's {eeprom_bytes} bytes (0x{start + p_filesz:X})")
            eeprom[start:start + p_filesz] = data[p_offset:p_offset + p_filesz]
            has_eeprom = True
            continue
        if p_paddr >= 0x800000:  # fuses and lock bits: not program flash
            continue
        if p_paddr + p_filesz > flash_bytes:
            raise AvrError(f"program data beyond the device's {flash_bytes} bytes of flash (0x{p_paddr + p_filesz:X})")
        image[p_paddr:p_paddr + p_filesz] = data[p_offset:p_offset + p_filesz]
        top = max(top, p_paddr + p_filesz)
    if not top:
        raise AvrError("the ELF file holds no program segment")
    return bytes(image), bytes(eeprom) if has_eeprom else None


def load_image(path: str, device: str = "attiny85") -> tuple[bytes, bytes | None]:
    """``(flash image, EEPROM image or None)`` from an Intel HEX or an ELF file, sized for ``device``."""
    spec = DEVICES[device]
    with open(path, "rb") as fh:
        data = fh.read()
    if data[:4] == b"\x7fELF":
        return _elf_image(data, spec["flash"], spec["eeprom"])
    try:
        return parse_ihex(data.decode("ascii"), spec["flash"]), None
    except UnicodeDecodeError as exc:
        raise AvrError(f"{path} is neither an Intel HEX nor an ELF file") from exc


def load_firmware(path: str, device: str = "attiny85") -> bytes:
    """A flash image from an Intel HEX or an ELF file."""
    return load_image(path, device)[0]


# ---- the chip --------------------------------------------------------------------------------
class Avr(Timer1Mixin, WatchdogMixin, EepromMixin, UsiMixin, ComparatorMixin):
    def __init__(self, flash: bytes, clock_hz: int = 1_000_000, device: str = "attiny85", eeprom: bytes | None = None,
                 usi_input: list[int] | None = None, temperature_c: float = 25.0, rstdisbl: bool = False):
        if device not in DEVICES:
            raise AvrError(f"unknown device {device!r}; known: {', '.join(DEVICES)}")
        spec = DEVICES[device]
        if len(flash) != spec["flash"]:
            raise AvrError(f"flash image must be {spec['flash']} bytes for the {device}")
        self.device = device
        self.flash = flash
        self.words = [flash[i] | (flash[i + 1] << 8) for i in range(0, len(flash), 2)]
        self.r = [0] * 32
        self.sram = bytearray(spec["sram"])
        self.sram_end = SRAM_START + spec["sram"] - 1
        self.eeprom = bytearray(eeprom if eeprom is not None else b"\xff" * spec["eeprom"])
        if len(self.eeprom) != spec["eeprom"]:
            raise AvrError(f"EEPROM image must be {spec['eeprom']} bytes for the {device}")
        self.eeprom_log: list[tuple[float, int, int]] = []   # (seconds, address, value) of every completed write
        self.usi_input = list(usi_input or [])
        self.usi_slave = list(self.usi_input)                  # what a slave on DI shifts out, byte by byte
        self.usi_log: list[tuple[float, int, int]] = []      # (seconds, byte sent, byte received) of every USI transfer
        self.resets: list[tuple[float, str]] = []            # (seconds, cause) of every reset after power-on
        self.temperature_c = temperature_c
        self.rstdisbl = rstdisbl                              # the RSTDISBL fuse: PB5 is a GPIO instead of the RESET pin
        self.cycle = 0
        self.instructions = 0
        self.clock_hz = clock_hz
        self.base_clock_hz = clock_hz
        self.time_offset = 0.0  # seconds up to the last clock change
        self.cycle_at_change = 0
        self.extra = 0          # cycles the running instruction adds (the CPU halts while the EEPROM is accessed)
        self.start_at = 0       # the CPU runs from this cycle (a reset holds it for the start-up delay)
        self.held = False       # the RESET pin is held low
        self.reset_delay_s = RESET_DELAY_S
        self.mcusr = 0x01       # power-on reset flag
        self.events: dict[str, int] = {}
        self.event_at = INF
        # board side
        self.input_levels: list[int | None] = [None] * 6  # external level of a pin that is an input: 0, 1 or None (floating)
        self.on_pin_change: Callable[[], None] | None = None
        self.floating_reads: dict[int, int] = {}  # pin → first cycle the firmware used its value while it floated
        self.adc_input: Callable[[int], float | None] | None = None  # the board: volts on a PORTB pin (None: floating)
        self.vcc_volts = 5.0
        self.adc_used: set[int] = set()  # pins the firmware sampled: an analog level there is no hazard
        self._in_pin_update = False
        self._pins_touched = False
        self._build()
        self._rh = self._read_table()
        self._wh = self._write_table()
        self._reset_io()

    def _read_table(self) -> dict[int, Callable[[int], int]]:
        table: dict[int, Callable[[int], int]] = {}
        for a in (TCNT1, TCCR1, GTCCR, OCR1A, OCR1B, OCR1C, PLLCSR):
            table[a] = self.t1_read
        for a in (EECR, EEDR, EEARL, EEARH):
            table[a] = self.ee_read
        for a in (USICR, USISR, USIDR, USIBR):
            table[a] = self.usi_read
        table[WDTCR] = lambda a: self.wdt_read()
        table[ACSR] = lambda a: self.comparator_read()
        table[MCUSR] = lambda a: self.mcusr
        return table

    def _write_table(self) -> dict[int, Callable[[int, int], None]]:
        table: dict[int, Callable[[int, int], None]] = {}
        for a in (TCNT1, TCCR1, GTCCR, OCR1A, OCR1B, OCR1C, PLLCSR):
            table[a] = self.t1_write
        for a in (EECR, EEDR, EEARL, EEARH):
            table[a] = self.ee_write
        for a in (USICR, USISR, USIDR, USIBR):
            table[a] = self.usi_write
        table[WDTCR] = lambda a, v: self.wdt_write(v)
        table[ACSR] = lambda a, v: self.comparator_write(v)
        table[MCUSR] = lambda a, v: setattr(self, "mcusr", self.mcusr & v & 0x0F)  # a flag clears by writing 0
        return table

    def _reset_io(self) -> None:
        """Power-on and every reset: the CPU and the I/O registers return to their reset values (SRAM, the register file and EEPROM stay)."""
        self.pc = 0
        self.sp = 0
        self.sreg = 0
        self.io = bytearray(0x40)
        self.sleeping = False
        self.skip_interrupt = False
        self.watch: dict[int, tuple[int, int]] = {}  # register → (floating pin mask, expiry cycle) after an IN from PINB
        self.clkpr_enable_until = -1
        elapsed = self.now()  # the clock returns to its base rate, the time already elapsed stays
        self.clock_hz = self.base_clock_hz
        self.time_offset = elapsed
        self.cycle_at_change = self.cycle
        # the ADC
        self.admux = 0
        self.adcsra = 0
        self.adcsrb = 0
        self.adc_data = 0
        self.adc_result = 0
        self.adc_first = True            # the first conversion after ADEN (or a change of reference) takes 25 ADC clocks, the others 13
        self.events["adc"] = INF
        # timer 0 (and the shared interrupt registers)
        self.t0_last = self.cycle
        self.t0_psc = 0
        self.t0_pos = 0
        self.tcnt0 = 0
        self.ocr0a = 0           # as latched (in the PWM modes it changes at TOP/BOTTOM)
        self.ocr0b = 0
        self.ocr0a_w = 0         # as written
        self.ocr0b_w = 0
        self.tccr0a = 0
        self.tccr0b = 0
        self.tifr = 0
        self.timsk = 0
        self.gifr = 0
        self.gimsk = 0
        self.mcucr = 0
        self.pcmsk = 0
        self.last_pins = 0
        self._pwm_signature: tuple[Any, ...] = (None, None, None, None)
        self.events["t0"] = INF
        self._init_timer1()
        self._init_watchdog()
        self._init_eeprom()
        self._init_usi()
        self._init_comparator()
        self.replan()

    # ---- decoding ----
    def _build(self) -> None:
        self.prog: list[Callable[[], int] | None] = [None] * len(self.words)
        self.words2 = self.words + [0]

    def _decode(self, pc: int) -> Callable[[], int]:
        op = self.words[pc]
        fn = self._decode_op(op, pc)
        self.prog[pc] = fn
        return fn

    # ---- memory ----
    def read_data(self, addr: int) -> int:
        if addr < 32:
            return self.r[addr]
        if addr < SRAM_START:
            return self.io_read(addr - IO_BASE)
        if addr <= self.sram_end:
            return self.sram[addr - SRAM_START]
        raise AvrError(f"read of data address 0x{addr:04X} outside the {self.device}'s memory (word address 0x{self.pc:04X})")

    def write_data(self, addr: int, value: int) -> None:
        if addr < 32:
            self.r[addr] = value
        elif addr < SRAM_START:
            self.io_write(addr - IO_BASE, value)
        elif addr <= self.sram_end:
            self.sram[addr - SRAM_START] = value
        else:
            raise AvrError(f"write to data address 0x{addr:04X} outside the {self.device}'s memory (word address 0x{self.pc:04X})")

    def unsupported(self, what: str, detail: str | None = None) -> Unsupported:
        return Unsupported(what, detail or UNSUPPORTED_WHY.get(what, f"{what} is not simulated"), self.pc, self.cycle)

    def halt(self, cycles: int) -> None:
        """The CPU stalls for ``cycles`` after the running instruction (EEPROM access)."""
        self.extra += cycles

    def now(self) -> float:
        """Simulated time in seconds (the clock prescaler may change mid-run)."""
        return self.time_offset + (self.cycle - self.cycle_at_change) / self.clock_hz

    def cycle_for(self, seconds: float) -> int:
        """The cycle count at which ``now()`` reaches ``seconds``, at the current clock."""
        return self.cycle_at_change + max(0, round((seconds - self.time_offset) * self.clock_hz))

    def replan(self) -> None:
        self.event_at = min(self.events.values()) if self.events else INF

    # ---- resets ----
    def reset(self, cause: str) -> None:
        """A reset: ``external`` (the RESET pin) or ``watchdog``. The chip restarts after the start-up delay."""
        at = self.now()
        self.mcusr |= RESET_CAUSES[cause]
        self.resets.append((at, cause))
        self._reset_io()
        if cause != "external":  # an external reset waits for the pin to be released
            self.start_at = self.cycle_for(at + self.reset_delay_s) + 14
        self.pin_config_changed()

    def set_reset_line(self, asserted: bool) -> None:
        """The board: the RESET pin is (not) held low. Ignored when PB5 is a GPIO (RSTDISBL)."""
        if self.rstdisbl:
            return
        if asserted and not self.held:
            self.held = True
            self.reset("external")
        elif not asserted and self.held:
            self.held = False
            self.start_at = self.cycle_for(self.now() + self.reset_delay_s) + 14

    # ---- pins ----
    def pin_driven(self, bit: int) -> bool:
        return bool(self.io[DDRB] >> bit & 1)

    def pin_pullup(self, bit: int) -> bool:
        return not (self.io[DDRB] >> bit & 1) and bool(self.io[PORTB] >> bit & 1) and not (self.mcucr & 0x40)

    def pin_out_level(self, bit: int) -> int:
        if bit == 1 and self.usi_drives_do():  # three-wire USI: DO overrides PORTB
            return self.usi_do
        pwm = self.pwm_pin(bit)
        if pwm is not None:  # a timer output overrides PORTB; as a level it is the one that holds longer
            return int(pwm["duty"] >= 0.5)
        return self.io[PORTB] >> bit & 1

    def pin_value(self, bit: int) -> int:
        """What the pin reads as: the driven level for an output, the board's level for an input (a floating one reads 0)."""
        if self.pin_driven(bit):
            return self.pin_out_level(bit)
        level = self.input_levels[bit]
        return 0 if level is None else level

    def pins_word(self) -> int:
        return sum(self.pin_value(b) << b for b in range(6))

    def pin_config_changed(self) -> None:
        """Called after a write that changes what the pins do: let the board resolve, then raise pin-change interrupts."""
        if self.on_pin_change:
            self.on_pin_change()
        self.after_pin_levels()

    def after_pin_levels(self) -> None:
        if self._in_pin_update:  # re-entered (the board answering our own on_pin_change): the outer loop re-reads the pins
            return
        self._in_pin_update = True
        try:
            for _ in range(8):  # a peripheral reacting to a pin can change another pin: settle
                new = self.pins_word()
                changed = new ^ self.last_pins
                self.last_pins = new
                self._pins_touched = False
                if changed:
                    if changed & self.pcmsk:
                        self.gifr |= 0x20
                    if changed >> 2 & 1:  # INT0 is PB2, which is also USCK
                        rising = bool(new >> 2 & 1)
                        sense = self.mcucr & 3
                        if sense == 1 or (sense == 2 and not rising) or (sense == 3 and rising):
                            self.gifr |= 0x40
                        self.usi_usck_edge(rising)
                if self.acsr & 0x08:
                    self.comparator_update()
                if not self._pins_touched:
                    break
                if self.on_pin_change:
                    self.on_pin_change()
        finally:
            self._in_pin_update = False

    def set_inputs(self, levels: list[int | None]) -> None:
        """The board's levels for the pins that are inputs (the value for an output is ignored)."""
        self.input_levels = list(levels)
        self.after_pin_levels()

    # ---- I/O registers ----
    def floating_mask(self) -> int:
        return sum(1 << b for b in range(6) if not self.pin_driven(b) and self.input_levels[b] is None and not self.io[DIDR0] >> b & 1)

    def note_pin_use(self, mask: int) -> None:
        """The firmware acted on the value of these pins: those of them that float are a hazard."""
        fm = self.floating_mask() & mask
        for bit in range(6):
            if fm >> bit & 1:
                self.floating_reads.setdefault(bit, self.cycle)

    def watch_use(self, reg: int, mask: int) -> None:
        """An instruction used ``mask`` bits of a register that was just read from PINB."""
        w = self.watch.get(reg)
        if w and self.cycle <= w[1]:
            for bit in range(6):
                if w[0] & mask & (1 << bit):
                    self.floating_reads.setdefault(bit, self.cycle)

    def io_read(self, a: int) -> int:
        if a == PINB:
            value = 0
            for bit in range(6):
                value |= self.pin_value(bit) << bit
            return value & ~self.io[DIDR0] & 0x3F  # a digital input buffer disabled by DIDR0 reads zero
        if a == SREG:
            return self.sreg
        if a == SPL:
            return self.sp & 0xFF
        if a == SPH:
            return self.sp >> 8 & 0xFF
        if a == TCNT0:
            self.t0_sync()
            return self.tcnt0
        if a == TIFR:
            self.t0_sync()
            self.t1_sync()
            return self.tifr
        if a == GIFR:
            return self.gifr
        handler = self._rh.get(a)
        if handler is not None:
            return handler(a)
        if a in (DDRB, PORTB, PCMSK, GIMSK, MCUCR, TIMSK, OCR0A, OCR0B, TCCR0A, TCCR0B, OSCCAL, DIDR0, PRR, CLKPR):
            return self.io_regs_value(a)
        if a in (ADCL, ADCH, ADCSRA, ADMUX, ADCSRB):
            if self.cycle >= self.events["adc"]:
                self.adc_finish()
            if a == ADCL:
                return self.adc_data & 0xFF
            if a == ADCH:
                return self.adc_data >> 8 & 0xFF
            return {ADCSRA: self.adcsra, ADMUX: self.admux, ADCSRB: self.adcsrb}[a]
        if a == DWDR:
            raise self.unsupported("debugWIRE", "the firmware reads DWDR; debugWIRE is not simulated")
        if a == SPMCSR:
            raise self.unsupported("SPM", "the firmware reads SPMCSR; self-programming is not simulated")
        raise self.unsupported("register", f"the firmware reads I/O address 0x{a:02X}, which is not an ATtiny25/45/85 register this simulator knows")

    def io_regs_value(self, a: int) -> int:
        return {DDRB: self.io[DDRB], PORTB: self.io[PORTB], PCMSK: self.pcmsk, GIMSK: self.gimsk, MCUCR: self.mcucr, TIMSK: self.timsk, OCR0A: self.ocr0a_w,
                OCR0B: self.ocr0b_w, TCCR0A: self.tccr0a, TCCR0B: self.tccr0b}.get(a, self.io[a])

    def io_write(self, a: int, v: int) -> None:
        if a == PORTB or a == DDRB:
            before = (self.io[PORTB], self.io[DDRB])
            self.io[a] = v & 0x3F
            if (self.io[PORTB], self.io[DDRB]) != before:
                self._pwm_signature = self._pwm_state()
                self.pin_config_changed()
        elif a == PINB:  # writing a 1 toggles the PORTB bit
            self.io[PORTB] ^= v & 0x3F
            self.pin_config_changed()
        elif a == SREG:
            self.sreg = v
        elif a == SPL:
            self.sp = (self.sp & 0xFF00) | v
        elif a == SPH:
            self.sp = (self.sp & 0x00FF) | (v << 8)
        elif a == PCMSK:
            self.pcmsk = v & 0x3F
        elif a == GIMSK:
            self.gimsk = v & 0x60
        elif a == GIFR:
            self.gifr &= ~(v & 0x60)
        elif a == MCUCR:
            before = self.mcucr
            self.mcucr = v & 0x7F
            if (before ^ self.mcucr) & 0x40:
                self.pin_config_changed()
        elif a == TIMSK:
            self.t0_sync()
            self.t1_sync()
            self.timsk = v & 0x7E
            self.t0_plan()
            self.t1_plan()
            self.replan()
        elif a == TIFR:
            self.t0_sync()
            self.t1_sync()
            self.tifr &= ~(v & 0x7E)
            self.t0_plan()
            self.t1_plan()
            self.replan()
        elif a in (TCCR0A, TCCR0B, TCNT0, OCR0A, OCR0B):
            self.t0_write(a, v)
        elif a == CLKPR:
            self.clkpr_write(v)
        elif a in (OSCCAL, DIDR0, PRR):
            self.io[a] = v
        elif a in (ADCSRA, ADMUX, ADCSRB):
            self.adc_write(a, v)
        elif a in (ADCL, ADCH):
            pass  # read-only
        elif a == DWDR:
            if v:
                raise self.unsupported("debugWIRE", "the firmware writes DWDR; debugWIRE is not simulated")
        elif a == SPMCSR:
            if v:
                raise self.unsupported("SPM", "the firmware writes SPMCSR; self-programming is not simulated")
        else:
            handler = self._wh.get(a)
            if handler is None:
                raise self.unsupported("register", f"the firmware writes I/O address 0x{a:02X}, which is not an ATtiny25/45/85 register this simulator knows")
            handler(a, v)

    def clkpr_write(self, v: int) -> None:
        if v & 0x80:  # CLKPCE: the next write within 4 cycles sets the prescaler
            self.clkpr_enable_until = self.cycle + 4
            return
        if self.cycle <= self.clkpr_enable_until:
            self.t0_sync()
            self.t1_sync()
            self.time_offset = self.now()
            self.cycle_at_change = self.cycle
            self.clock_hz = self.base_clock_hz >> (v & 0x0F) if (v & 0x0F) <= 8 else self.base_clock_hz
            self.clkpr_enable_until = -1
            self.t0_plan()
            self.t1_plan()
            self.wdt_plan()
            self.replan()

    # ---- ADC ----
    def adc_write(self, a: int, v: int) -> None:
        if self.cycle >= self.events["adc"]:
            self.adc_finish()
        if a == ADMUX:
            if (v ^ self.admux) & 0xD0:  # REFS changed: the next conversion takes 25 ADC clocks
                self.adc_first = True
            self.admux = v
        elif a == ADCSRB:
            if v & 0x40:
                raise self.unsupported("ADC", "the firmware sets ACME, which multiplexes the ADC inputs into the analog comparator; it is not simulated")
            self.adcsrb = v
        else:  # ADCSRA
            busy = self.adcsra & 0x40
            keep_flag = self.adcsra & 0x10 & ~v  # writing 1 to ADIF clears it
            self.adcsra = (v & 0xAF) | keep_flag | busy  # ADSC is hardware-cleared; ADIF is write-1-to-clear
            if not v & 0x80:  # ADEN off: the converter stops, and the next start is a first conversion again
                self.adcsra &= ~0x40
                self.events["adc"] = INF
                self.adc_first = True
                self.replan()
            elif v & 0x40 and not busy:
                self.adc_start()

    def adc_pin_volts(self, bit: int) -> float:
        if self.adc_input is None:
            raise self.unsupported("ADC", "the firmware starts an ADC conversion, but no board is attached to say what is on the pin")
        if bit == 5 and not self.rstdisbl:
            raise self.unsupported("ADC", "the firmware converts ADC0 (PB5), but PB5 is the RESET pin unless the RSTDISBL fuse is programmed")
        self.adc_used.add(bit)
        volts = self.adc_input(bit)
        if volts is None:
            self.floating_reads.setdefault(bit, self.cycle)
            return 0.0
        return volts

    def adc_start(self) -> None:
        mux = self.admux & 0x0F
        refs = ((self.admux >> 6) & 3) | ((self.admux >> 4 & 1) << 2)
        if self.adcsra & 0x20 and self.adcsrb & 7:
            raise self.unsupported("ADC", "the firmware auto-triggers the ADC from a source other than free running; only free running (ADTS = 0) is simulated")
        diff = ADC_DIFF.get(mux)
        single = ADC_PINS.get(mux)
        if single is None and diff is None and mux not in (0b1100, 0b1101, 0b1111):
            raise self.unsupported("ADC", f"the firmware selects the reserved ADC input 0b{mux:04b}")
        if refs == 0:
            vref = self.vcc_volts
        elif refs == 1:
            aref = self.adc_input(0) if self.adc_input else None
            if aref is None:
                self.floating_reads.setdefault(0, self.cycle)
                raise self.unsupported("ADC", "the firmware uses AREF (PB0) as the ADC reference, but PB0 floats")
            vref = aref
        elif refs == 2:
            vref = 1.1
        elif refs in (6, 7):
            vref = 2.56
            if self.vcc_volts < 3.0:
                raise self.unsupported("ADC", f"the firmware selects the 2.56 V reference with a {self.vcc_volts:g} V supply: the reference needs the supply above it")
        else:
            raise self.unsupported("ADC", f"the firmware selects the reserved ADC reference setting REFS = 0b{refs:03b}")
        if vref <= 0:
            raise self.unsupported("ADC", "the ADC reference voltage is 0 V")
        if diff is not None:
            pos, neg, gain = diff
            vp, vn = self.adc_pin_volts(pos), self.adc_pin_volts(neg)
            if self.adcsrb & 0x80:  # bipolar: two's complement, 512 counts per Vref
                result = max(-512, min(511, math.floor((vp - vn) * gain * 512 / vref))) & 0x3FF
            else:                   # unipolar: negative differences saturate at zero; IPR swaps the inputs
                if self.adcsrb & 0x20:
                    vp, vn = vn, vp
                result = max(0, min(1023, math.floor((vp - vn) * gain * 1024 / vref)))
        else:
            if single is not None:
                volts = self.adc_pin_volts(single)
            elif mux == 0b1101:
                volts = 0.0
            elif mux == 0b1100:
                volts = 1.1  # the bandgap reference
            else:  # 0b1111: the temperature sensor
                volts = self.temperature_lsb() / 1024 * 1.1
            result = max(0, min(1023, int(volts / vref * 1024)))
        self.adc_result = result
        clocks = 25 if self.adc_first else 13
        self.adc_first = False
        self.adcsra |= 0x40
        self.events["adc"] = self.cycle + clocks * ADC_PRESCALERS[self.adcsra & 7]
        self.replan()

    def temperature_lsb(self) -> float:
        """The sensor's reading against the 1.1 V reference (datasheet Table 17-2, interpolated and extended linearly)."""
        t = self.temperature_c
        (t0, l0), (t1, l1), (t2, l2) = TEMPERATURE_LSB
        a, b = ((t0, l0), (t1, l1)) if t < t1 else ((t1, l1), (t2, l2))
        return a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0])

    def adc_finish(self) -> None:
        """The running conversion is done: the result registers, ADIF, and the next conversion in free-running mode."""
        done = self.events["adc"]
        result = self.adc_result
        self.adc_data = (((result >> 2) << 8) | ((result & 3) << 6)) if self.admux & 0x20 else result  # ADLAR: ADCH holds the top 8 bits
        self.adcsra = (self.adcsra & ~0x40) | 0x10
        self.events["adc"] = INF
        if self.adcsra & 0x20:  # ADATE with ADTS = 0: free running, the next conversion starts at once
            at = self.cycle
            self.cycle = max(self.cycle, done)
            self.adc_start()
            self.cycle = at
        self.replan()

    # ---- timer 0 ----
    def t0_divisor(self) -> int:
        return PRESCALERS.get(self.tccr0b & 7, 0)

    def t0_mode(self) -> int:
        """WGM02:0: 0 normal, 1 phase-correct PWM, 2 CTC, 3 fast PWM, 7 fast PWM with TOP = OCR0A."""
        return (self.tccr0a & 3) | ((self.tccr0b >> 3 & 1) << 2)

    def t0_buffered(self) -> bool:
        """In the PWM modes OCR0x are double buffered: a write takes effect at TOP / BOTTOM."""
        return self.t0_mode() in (1, 3, 7) and self.t0_divisor() != 0

    def t0_check(self, tccr0a: int, tccr0b: int) -> None:
        mode = (tccr0a & 3) | ((tccr0b >> 3 & 1) << 2)
        if mode not in (0, 1, 2, 3, 7):
            raise self.unsupported("Timer0", f"the firmware selects Timer0 waveform mode {mode} (phase-correct PWM with TOP = OCR0A); "
                                             "normal, CTC, phase-correct PWM, fast PWM and fast PWM with TOP = OCR0A are simulated")
        if (tccr0b & 7) in (6, 7):
            raise self.unsupported("Timer0", "the firmware clocks Timer0 from the T0 pin; an external clock is not simulated")
        for name, com in (("OC0A", tccr0a >> 6 & 3), ("OC0B", tccr0a >> 4 & 3)):
            if com == 1 and not (mode in (0, 2) or (mode == 7 and name == "OC0A")):
                raise self.unsupported("Timer0", f"the firmware sets COM0{name[-1]} = 1 (toggle) in a mode where it is reserved")
            if com in (2, 3) and mode not in (1, 3, 7):
                raise self.unsupported("Timer0", f"the firmware sets {name} to clear/set on compare match outside PWM mode; only toggling and PWM outputs are simulated")

    def t0_write(self, a: int, v: int) -> None:
        self.t0_sync()
        if a == TCCR0A:
            self.t0_check(v, self.tccr0b)
            self.tccr0a = v
        elif a == TCCR0B:
            self.t0_check(self.tccr0a, v)
            self.tccr0b = v & 0xCF
            if self.t0_mode() == 1 and self.t0_pos == 0:
                self.t0_pos = self.tcnt0
        elif a == TCNT0:
            self.tcnt0 = v
            self.t0_pos = v
        elif a == OCR0A:
            self.ocr0a_w = v
        elif a == OCR0B:
            self.ocr0b_w = v
        if not self.t0_buffered():
            self.ocr0a, self.ocr0b = self.ocr0a_w, self.ocr0b_w
        self.t0_plan()
        self.pwm_changed()
        self.replan()

    def t0_latch(self) -> None:
        if (self.ocr0a, self.ocr0b) != (self.ocr0a_w, self.ocr0b_w):
            self.ocr0a, self.ocr0b = self.ocr0a_w, self.ocr0b_w
            self.pwm_changed()

    # -- the output compare pins: a toggle or a PWM waveform, as a duty cycle and a frequency --
    def pwm0_pin(self, bit: int) -> dict[str, float] | None:
        """``{"duty", "hz"}`` for PB0 (OC0A) / PB1 (OC0B) while Timer0 drives it, else None."""
        if bit not in (0, 1) or not self.pin_driven(bit):
            return None
        com = (self.tccr0a >> (6 if bit == 0 else 4)) & 3
        div = self.t0_divisor()
        if not com or not div:
            return None
        mode = self.t0_mode()
        ocr = self.ocr0a if bit == 0 else self.ocr0b
        clk = self.clock_hz / div  # timer ticks per second
        if com == 1:  # toggle on compare match
            period = 512 if mode == 0 else 2 * (self.ocr0a + 1)
            return {"duty": 0.5, "hz": clk / period}
        top = self.ocr0a if mode == 7 else 0xFF
        if mode == 1:
            duty, hz = (min(ocr, top) / top if top else 0.0), clk / (2 * top)
        else:  # fast PWM: high for OCR + 1 of TOP + 1 ticks (always high at OCR >= TOP)
            duty, hz = (1.0 if ocr >= top else (ocr + 1) / (top + 1)), clk / (top + 1)
        return {"duty": duty if com == 2 else 1.0 - duty, "hz": hz}

    def pwm_pin(self, bit: int) -> dict[str, float] | None:
        """The waveform a timer drives on a pin (Timer0 on PB0/PB1, Timer1 on PB0/PB1/PB3/PB4), or None."""
        a, b = self.pwm0_pin(bit), self.pwm1_pin(bit)
        if a is not None and b is not None:
            raise self.unsupported("Timer1", f"Timer0 and Timer1 both drive PB{bit}; two compare outputs on one pin are not simulated")
        return a if a is not None else b

    def _pwm_state(self) -> tuple[Any, ...]:
        return tuple(self.pwm_pin(bit) for bit in (0, 1, 3, 4))

    def pwm_changed(self) -> None:
        signature = self._pwm_state()
        if signature != self._pwm_signature:
            self._pwm_signature = signature
            pwm_bits = sum(1 << bit for bit, wave in zip((0, 1, 3, 4), signature) if wave)
            if pwm_bits & self.pcmsk and self.gimsk & 0x20:
                raise self.unsupported("Timer0", "the firmware enables a pin-change interrupt on a timer PWM output pin, whose edges are not simulated")
            self.pin_config_changed()

    def t0_sync(self) -> None:
        """Advance Timer 0 to the current cycle."""
        div = self.t0_divisor()
        elapsed = self.cycle - self.t0_last
        self.t0_last = self.cycle
        if not div or elapsed <= 0 or self.sleeping_power_down:
            return
        total = self.t0_psc + elapsed
        ticks, self.t0_psc = divmod(total, div)
        if ticks <= 0:
            return
        mode = self.t0_mode()
        if mode == 1:
            self.t0_sync_phase_correct(ticks)
            return
        reset_at_top = mode in (2, 7)
        while ticks > 0:
            # ticks until the counter reaches a value that matters (a compare value or the top), in one jump when possible
            t = self.tcnt0
            tov_value = self.ocr0a if mode == 7 else 0xFF
            targets = [self.ocr0a, self.ocr0b, tov_value]
            gap = min((x - t) & 0xFF for x in targets)  # 0: the counter sits on a value whose leaving sets a flag
            if gap > 0:
                step = min(ticks, gap)
                self.tcnt0 = (t + step) & 0xFF
                ticks -= step
                continue
            # one tick from t: events happen on leaving the matching value
            if t == self.ocr0a:
                self.tifr |= 0x10
            if t == self.ocr0b:
                self.tifr |= 0x08
            if t == tov_value:
                self.tifr |= 0x02
            self.tcnt0 = 0 if (reset_at_top and t == self.ocr0a) else (t + 1) & 0xFF
            if mode in (3, 7) and t == tov_value:
                self.t0_latch()  # fast PWM: OCR0x take effect when the counter restarts
            ticks -= 1

    def t0_positions(self) -> dict[int, list[int]]:
        """Phase-correct counting runs 0..255..1 (510 ticks): where, in that cycle, each flag is set."""
        def both(ocr: int) -> list[int]:
            return sorted({(ocr + 1) % 510, (511 - ocr) % 510})  # the tick that leaves the matching value, going up and going down
        return {0x10: both(self.ocr0a), 0x08: both(self.ocr0b), 0x02: [0]}

    def t0_sync_phase_correct(self, ticks: int) -> None:
        p = self.t0_pos
        for flag, positions in self.t0_positions().items():
            if any(((pos - p - 1) % 510) < ticks for pos in positions):
                self.tifr |= flag
        if ((255 - p - 1) % 510) < ticks:
            self.t0_latch()  # phase-correct: OCR0x take effect at TOP
        self.t0_pos = (p + ticks) % 510
        self.tcnt0 = self.t0_pos if self.t0_pos <= 255 else 510 - self.t0_pos

    @property
    def sleeping_power_down(self) -> bool:
        return self.sleeping and ((self.mcucr >> 3) & 3) == 2

    def t0_plan(self) -> None:
        """Cycle of the next Timer 0 event that must be handled: an enabled flag, or the latch of a pending PWM compare value."""
        div = self.t0_divisor()
        self.events["t0"] = INF
        pending_latch = self.t0_buffered() and (self.ocr0a, self.ocr0b) != (self.ocr0a_w, self.ocr0b_w)
        if not div or not (self.timsk & 0x1A or pending_latch):
            return
        mode = self.t0_mode()
        best = None
        if mode == 1:
            for flag, positions in self.t0_positions().items():
                if self.timsk & flag:
                    for pos in positions:
                        ticks = (pos - self.t0_pos - 1) % 510 + 1
                        best = ticks if best is None else min(best, ticks)
            if pending_latch:
                ticks = (255 - self.t0_pos - 1) % 510 + 1
                best = ticks if best is None else min(best, ticks)
        else:
            reset_at_top = mode in (2, 7)
            tov_value = self.ocr0a if mode == 7 else 0xFF
            for enabled, target in ((0x10, self.ocr0a), (0x08, self.ocr0b), (0x02, tov_value)):
                if not self.timsk & enabled:
                    continue
                if reset_at_top and enabled == 0x02 and mode == 2 and self.tcnt0 <= self.ocr0a != 0xFF:
                    continue  # the counter restarts at OCR0A before it can reach 0xFF
                ticks = ((target - self.tcnt0) & 0xFF) + 1  # the flag is set on the tick that leaves the value
                best = ticks if best is None else min(best, ticks)
            if pending_latch and mode in (3, 7):
                ticks = ((tov_value - self.tcnt0) & 0xFF) + 1
                best = ticks if best is None else min(best, ticks)
        if best is not None:
            self.events["t0"] = self.t0_last + max(1, best * div - self.t0_psc)

    # ---- interrupts ----
    def pending_vector(self) -> int | None:
        timsk, tifr = self.timsk, self.tifr
        if self.gimsk & 0x40 and (self.gifr & 0x40 or ((self.mcucr & 3) == 0 and not (self.pin_value(2)))):
            return 1                      # INT0
        if self.gimsk & 0x20 and self.gifr & 0x20:
            return 2                      # PCINT0
        if timsk & tifr & 0x40:
            return 3                      # TIMER1_COMPA
        if timsk & tifr & 0x04:
            return 4                      # TIMER1_OVF
        if timsk & tifr & 0x02:
            return 5                      # TIMER0_OVF
        if self.ee_ready_irq():
            return 6                      # EE_RDY
        if self.acsr & 0x18 == 0x18:
            return 7                      # ANA_COMP
        if self.adcsra & 0x18 == 0x18:
            return 8                      # ADC
        if timsk & tifr & 0x20:
            return 9                      # TIMER1_COMPB
        if timsk & tifr & 0x10:
            return 10                     # TIMER0_COMPA
        if timsk & tifr & 0x08:
            return 11                     # TIMER0_COMPB
        if self.wdtcr & 0xC0 == 0xC0:
            return 12                     # WDT
        if self.usicr & 0x80 and self.usisr & 0x80:
            return 13                     # USI_START
        if self.usicr & 0x40 and self.usisr & 0x40:
            return 14                     # USI_OVF
        return None

    _VECTOR_FLAGS = {1: ("gifr", 0x40), 2: ("gifr", 0x20), 3: ("tifr", 0x40), 4: ("tifr", 0x04), 5: ("tifr", 0x02), 7: ("acsr", 0x10), 8: ("adcsra", 0x10),
                     9: ("tifr", 0x20), 10: ("tifr", 0x10), 11: ("tifr", 0x08), 12: ("wdtcr", 0x80), 13: ("usisr", 0x80), 14: ("usisr", 0x40)}

    def take_interrupt(self, vector: int) -> None:
        self.push_pc(self.pc)
        self.sreg &= ~I
        flag = self._VECTOR_FLAGS.get(vector)  # the hardware clears the flag when the vector is taken (EE_RDY has none)
        if flag:
            setattr(self, flag[0], getattr(self, flag[0]) & ~flag[1])
        self.pc = vector
        self.cycle += 4

    def push_pc(self, pc: int) -> None:
        self.write_data(self.sp, pc & 0xFF)
        self.sp -= 1
        self.write_data(self.sp, pc >> 8 & 0xFF)
        self.sp -= 1

    def pop_pc(self) -> int:
        self.sp += 1
        hi = self.read_data(self.sp)
        self.sp += 1
        return hi << 8 | self.read_data(self.sp)

    # ---- running ----
    def service_events(self) -> None:
        """Handle every peripheral event that is due: advance the timers, finish conversions and writes, time out the watchdog."""
        for name in [n for n, due in self.events.items() if due <= self.cycle]:
            if name == "t0":
                self.t0_sync()
                self.t0_plan()
            elif name == "t1":
                self.t1_sync()
                self.t1_plan()
            elif name == "adc":
                self.adc_finish()
            elif name == "wdt":
                self.wdt_event()
            elif name == "ee":
                self.ee_finish()
        self.replan()

    def sleep_horizon(self, until: int) -> int:
        """Where a sleeping chip's time can jump to: the next event of the clocks that still run (power-down stops all but the watchdog)."""
        if self.sleeping_power_down:
            return min(until, self.events["wdt"], self.events["ee"])
        return min(until, self.event_at)

    def run(self, until: int, budget: int | None = None) -> None:
        """Execute until the cycle counter reaches ``until`` (instruction granularity; a sleeping chip jumps to the next event)."""
        prog = self.prog
        executed = 0
        while self.cycle < until:
            if self.held:  # the RESET pin is low: time passes, nothing runs
                self.cycle = until
                break
            if self.cycle < self.start_at:
                self.cycle = min(until, self.start_at)
                continue
            if self.cycle >= self.event_at:
                self.service_events()
                continue
            if self.sreg & I and not self.skip_interrupt:
                vector = self.pending_vector()
                if vector is not None:
                    self.sleeping = False
                    self.take_interrupt(vector)
                    continue
            if self.sleeping:
                if not (self.sreg & I) and self.pending_vector() is not None:
                    self.sleeping = False
                else:
                    horizon = self.sleep_horizon(until)
                    self.cycle = horizon if horizon > self.cycle else self.cycle + 1
                    continue
            self.skip_interrupt = False
            pc = self.pc
            if pc >= len(prog):
                raise AvrError(f"the program counter ran off the end of the flash (word address 0x{pc:04X})")
            fn = prog[pc] or self._decode(pc)
            self.pc = pc + 1
            self.cycle += fn() + self.extra
            self.extra = 0
            executed += 1
            if budget is not None and executed >= budget:
                raise AvrError("instruction budget exhausted")
        self.instructions += executed

    # ---- instruction decoding ----
    def _decode_op(self, op: int, pc: int) -> Callable[[], int]:
        from .avrops import decode  # the instruction set lives in its own module

        return decode(self, op, pc)
