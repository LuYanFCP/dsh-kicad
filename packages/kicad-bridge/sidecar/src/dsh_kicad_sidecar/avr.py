"""A small ATtiny25/45/85 simulator: the AVR instruction set, the GPIO port, pin-change and INT0 interrupts, Timer0 (normal and CTC)
the ADC (single-ended, Vcc / 1.1 V / 2.56 V / AREF reference) and sleep. It is not a general AVR emulator. What it does not model it refuses
(``Unsupported``): a firmware that touches Timer1, the USI, EEPROM, the watchdog, differential ADC channels or a PWM mode cannot be verified
here, and a wrong verdict is worse than none.

Pure Python, no dependencies. The board around the chip (what is wired to the pins) is not here: the owner sets
``input_levels`` and gets ``on_pin_change`` calls (see mcusim.py).
"""

from __future__ import annotations

import struct
from typing import Any, Callable

__all__ = ["Avr", "AvrError", "Unsupported", "IllegalInstruction", "load_firmware", "parse_ihex"]

# status register bits
C, Z, N, V, S, H, T, I = (1 << i for i in range(8))

FLASH_BYTES = 8192
SRAM_START, SRAM_END = 0x60, 0x25F
IO_BASE = 0x20  # data space address of I/O address 0

# I/O addresses (iotn85.h)
ADCSRB, ADCL, ADCH, ADCSRA, ADMUX, ACSR = 0x03, 0x04, 0x05, 0x06, 0x07, 0x08
USICR, USISR, USIDR, USIBR = 0x0D, 0x0E, 0x0F, 0x10
DIDR0, PCMSK, PINB, DDRB, PORTB = 0x14, 0x15, 0x16, 0x17, 0x18
EECR, EEDR, EEARL, EEARH = 0x1C, 0x1D, 0x1E, 0x1F
PRR, WDTCR, DWDR, CLKPR, PLLCSR = 0x20, 0x21, 0x22, 0x26, 0x27
OCR0B, OCR0A, TCCR0A, OCR1B, GTCCR, OCR1C, OCR1A, TCNT1, TCCR1 = 0x28, 0x29, 0x2A, 0x2B, 0x2C, 0x2D, 0x2E, 0x2F, 0x30
OSCCAL, TCNT0, TCCR0B, MCUSR, MCUCR, SPMCSR, TIFR, TIMSK, GIFR, GIMSK = 0x31, 0x32, 0x33, 0x34, 0x35, 0x37, 0x38, 0x39, 0x3A, 0x3B
SPL, SPH, SREG = 0x3D, 0x3E, 0x3F

# interrupt vectors (word addresses)
V_INT0, V_PCINT0, V_TIM0_OVF, V_ADC, V_TIM0_COMPA, V_TIM0_COMPB = 1, 2, 5, 8, 10, 11
ADC_PRESCALERS = {0: 2, 1: 2, 2: 4, 3: 8, 4: 16, 5: 32, 6: 64, 7: 128}
ADC_PINS = {0: 5, 1: 2, 2: 4, 3: 3}  # single-ended channel → PORTB bit
PRESCALERS = {1: 1, 2: 8, 3: 64, 4: 256, 5: 1024}

NAMES = {ADCSRB: "ADCSRB", ADCL: "ADCL", ADCH: "ADCH", ADCSRA: "ADCSRA", ADMUX: "ADMUX", ACSR: "ACSR", USICR: "USICR", USISR: "USISR", USIDR: "USIDR",
         USIBR: "USIBR", EECR: "EECR", EEDR: "EEDR", EEARL: "EEARL", EEARH: "EEARH", WDTCR: "WDTCR", DWDR: "DWDR", PLLCSR: "PLLCSR",
         OCR1B: "OCR1B", GTCCR: "GTCCR", OCR1C: "OCR1C", OCR1A: "OCR1A", TCNT1: "TCNT1", TCCR1: "TCCR1", SPMCSR: "SPMCSR"}
UNSUPPORTED_WHY = {
    "ADC": "this ADC feature is not simulated", "USI": "the USI (I²C/SPI) is not simulated", "EEPROM": "EEPROM is not simulated",
    "Timer1": "Timer1 is not simulated", "watchdog": "the watchdog is not simulated", "debugWIRE": "debugWIRE is not simulated",
    "SPM": "self-programming is not simulated", "comparator": "the analog comparator is not simulated", "PLL": "the PLL is not simulated",
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
def parse_ihex(text: str) -> bytes:
    """Intel HEX → flash image (gaps are 0xFF)."""
    image = bytearray(b"\xff" * FLASH_BYTES)
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
            if start + length > FLASH_BYTES:
                raise AvrError(f"line {number}: data beyond the ATtiny85's {FLASH_BYTES} bytes of flash (0x{start + length:X})")
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


def _elf_image(data: bytes) -> bytes:
    if data[:4] != b"\x7fELF" or data[4] != 1 or data[5] != 1:
        raise AvrError("not a 32-bit little-endian ELF file")
    machine = struct.unpack_from("<H", data, 18)[0]
    if machine != 83:
        raise AvrError(f"the ELF file is for machine {machine}, not AVR (83)")
    phoff, phentsize, phnum = struct.unpack_from("<I", data, 28)[0], struct.unpack_from("<H", data, 42)[0], struct.unpack_from("<H", data, 44)[0]
    image = bytearray(b"\xff" * FLASH_BYTES)
    top = 0
    for i in range(phnum):
        p_type, p_offset, _, p_paddr, p_filesz, _, _, _ = struct.unpack_from("<8I", data, phoff + i * phentsize)
        if p_type != 1 or not p_filesz:
            continue
        if p_paddr >= 0x800000:  # EEPROM / fuses / lock bits: not program flash
            continue
        if p_paddr + p_filesz > FLASH_BYTES:
            raise AvrError(f"program data beyond the ATtiny85's {FLASH_BYTES} bytes of flash (0x{p_paddr + p_filesz:X})")
        image[p_paddr:p_paddr + p_filesz] = data[p_offset:p_offset + p_filesz]
        top = max(top, p_paddr + p_filesz)
    if not top:
        raise AvrError("the ELF file holds no program segment")
    return bytes(image)


def load_firmware(path: str) -> bytes:
    """A flash image from an Intel HEX or an ELF file."""
    with open(path, "rb") as fh:
        data = fh.read()
    if data[:4] == b"\x7fELF":
        return _elf_image(data)
    try:
        return parse_ihex(data.decode("ascii"))
    except UnicodeDecodeError as exc:
        raise AvrError(f"{path} is neither an Intel HEX nor an ELF file") from exc


# ---- the chip --------------------------------------------------------------------------------
class Avr:
    def __init__(self, flash: bytes, clock_hz: int = 1_000_000):
        if len(flash) != FLASH_BYTES:
            raise AvrError("flash image must be 8192 bytes")
        self.flash = flash
        self.words = [flash[i] | (flash[i + 1] << 8) for i in range(0, FLASH_BYTES, 2)]
        self.r = [0] * 32
        self.io = bytearray(0x40)
        self.sram = bytearray(SRAM_END - SRAM_START + 1)
        self.pc = 0
        self.sp = 0
        self.sreg = 0
        self.cycle = 0
        self.instructions = 0
        self.clock_hz = clock_hz
        self.base_clock_hz = clock_hz
        self.clkpr_enable_until = -1
        self.time_offset = 0.0  # seconds up to the last clock change
        self.cycle_at_change = 0
        self.sleeping = False
        self.skip_interrupt = False
        # board side
        self.input_levels: list[int | None] = [None] * 6  # external level of a pin that is an input: 0, 1 or None (floating)
        self.on_pin_change: Callable[[], None] | None = None
        self.floating_reads: dict[int, int] = {}  # pin → first cycle the firmware used its value while it floated
        self.watch: dict[int, tuple[int, int]] = {}  # register → (floating pin mask, expiry cycle) after an IN from PINB
        # ADC
        self.admux = 0
        self.adcsra = 0
        self.adcsrb = 0
        self.adc_data = 0
        self.adc_next = 1 << 62          # cycle the running conversion completes
        self.adc_result = 0
        self.adc_first = True            # the first conversion after ADEN takes 25 ADC clocks, the others 13
        self.adc_input: Callable[[int], float | None] | None = None  # the board: volts on a PORTB pin (None: floating)
        self.vcc_volts = 5.0
        self.adc_used: set[int] = set()  # pins the firmware sampled: an analog level there is no hazard
        # timer 0
        self.t0_last = 0  # cycle up to which timer 0 has been advanced
        self.t0_psc = 0   # CPU cycles into the current prescaler period
        self.t0_next = 1 << 62
        self.tcnt0 = 0
        self.ocr0a = 0
        self.ocr0b = 0
        self.tccr0a = 0
        self.tccr0b = 0
        self.tifr = 0
        self.timsk = 0
        self.gifr = 0
        self.gimsk = 0
        self.mcucr = 0
        self.pcmsk = 0
        self.last_pins = 0
        self._build()

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
        if addr <= SRAM_END:
            return self.sram[addr - SRAM_START]
        raise AvrError(f"read of data address 0x{addr:04X} outside the ATtiny85's memory (word address 0x{self.pc:04X})")

    def write_data(self, addr: int, value: int) -> None:
        if addr < 32:
            self.r[addr] = value
        elif addr < SRAM_START:
            self.io_write(addr - IO_BASE, value)
        elif addr <= SRAM_END:
            self.sram[addr - SRAM_START] = value
        else:
            raise AvrError(f"write to data address 0x{addr:04X} outside the ATtiny85's memory (word address 0x{self.pc:04X})")

    def unsupported(self, what: str, detail: str | None = None) -> Unsupported:
        return Unsupported(what, detail or UNSUPPORTED_WHY[what], self.pc, self.cycle)

    def now(self) -> float:
        """Simulated time in seconds (the clock prescaler may change mid-run)."""
        return self.time_offset + (self.cycle - self.cycle_at_change) / self.clock_hz

    def cycle_for(self, seconds: float) -> int:
        """The cycle count at which ``now()`` reaches ``seconds``, at the current clock."""
        return self.cycle_at_change + max(0, round((seconds - self.time_offset) * self.clock_hz))

    # ---- pins ----
    def pin_driven(self, bit: int) -> bool:
        return bool(self.io[DDRB] >> bit & 1)

    def pin_pullup(self, bit: int) -> bool:
        return not (self.io[DDRB] >> bit & 1) and bool(self.io[PORTB] >> bit & 1) and not (self.mcucr & 0x40)

    def pin_out_level(self, bit: int) -> int:
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
        new = self.pins_word()
        changed = new ^ self.last_pins
        self.last_pins = new
        if changed:
            if changed & self.pcmsk:
                self.gifr |= 0x20
            if changed >> 2 & 1:  # INT0 is PB2
                sense = self.mcucr & 3
                rising = bool(new >> 2 & 1)
                if sense == 1 or (sense == 2 and not rising) or (sense == 3 and rising):
                    self.gifr |= 0x40

    def set_inputs(self, levels: list[int | None]) -> None:
        """The board's levels for the pins that are inputs (the value for an output is ignored)."""
        self.input_levels = list(levels)
        self.after_pin_levels()

    # ---- I/O registers ----
    def floating_mask(self) -> int:
        return sum(1 << b for b in range(6) if not self.pin_driven(b) and self.input_levels[b] is None)

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
            return value
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
            return self.tifr
        if a == GIFR:
            return self.gifr
        if a in (DDRB, PORTB, PCMSK, GIMSK, MCUCR, TIMSK, OCR0A, OCR0B, TCCR0A, TCCR0B, OSCCAL, DIDR0, PRR, MCUSR, GTCCR, CLKPR):
            return self.io_regs_value(a)
        if a in (ADCL, ADCH, ADCSRA, ADMUX, ADCSRB):
            if self.cycle >= self.adc_next:
                self.adc_finish()
            if a == ADCL:
                return self.adc_data & 0xFF
            if a == ADCH:
                return self.adc_data >> 8 & 0xFF
            return {ADCSRA: self.adcsra, ADMUX: self.admux, ADCSRB: self.adcsrb}[a]
        if a in (ACSR, USICR, USISR, USIDR, USIBR, EECR, EEDR, EEARL, EEARH, WDTCR, DWDR, TCNT1, TCCR1, OCR1A, OCR1B, OCR1C, PLLCSR, SPMCSR):
            raise self.unsupported(self.peripheral(a), f"the firmware reads {NAMES[a]}, but {UNSUPPORTED_WHY[self.peripheral(a)]}")
        raise self.unsupported("register", f"the firmware reads I/O address 0x{a:02X}, which is not an ATtiny85 register this simulator knows")

    def io_regs_value(self, a: int) -> int:
        return {DDRB: self.io[DDRB], PORTB: self.io[PORTB], PCMSK: self.pcmsk, GIMSK: self.gimsk, MCUCR: self.mcucr, TIMSK: self.timsk, OCR0A: self.ocr0a,
                OCR0B: self.ocr0b, TCCR0A: self.tccr0a, TCCR0B: self.tccr0b}.get(a, self.io[a])

    @staticmethod
    def peripheral(a: int) -> str:
        if a in (ADCL, ADCH, ADCSRA, ADMUX, ADCSRB):
            return "ADC"
        if a in (USICR, USISR, USIDR, USIBR):
            return "USI"
        if a in (EECR, EEDR, EEARL, EEARH):
            return "EEPROM"
        if a in (WDTCR,):
            return "watchdog"
        if a == DWDR:
            return "debugWIRE"
        if a in (TCNT1, TCCR1, OCR1A, OCR1B, OCR1C):
            return "Timer1"
        if a == PLLCSR:
            return "PLL"
        if a == SPMCSR:
            return "SPM"
        return "comparator"

    def io_write(self, a: int, v: int) -> None:
        if a == PORTB or a == DDRB:
            before = (self.io[PORTB], self.io[DDRB])
            self.io[a] = v & 0x3F
            if (self.io[PORTB], self.io[DDRB]) != before:
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
            if v & 0x64:  # OCIE1A, OCIE1B, TOIE1
                raise self.unsupported("Timer1")
            self.t0_sync()
            self.timsk = v & 0x1A
            self.t0_plan()
        elif a == TIFR:
            self.t0_sync()
            self.tifr &= ~(v & 0x1A)
            self.t0_plan()
        elif a in (TCCR0A, TCCR0B, TCNT0, OCR0A, OCR0B):
            self.t0_write(a, v)
        elif a == CLKPR:
            self.clkpr_write(v)
        elif a in (OSCCAL, DIDR0, PRR, MCUSR, GTCCR):
            if a == GTCCR and v & 0x7F:
                raise self.unsupported("Timer1", "the firmware writes GTCCR (timer prescaler reset / Timer1 control); Timer1 and prescaler synchronisation are not simulated")
            self.io[a] = v
        elif a == WDTCR:
            if v & 0x48:  # WDE or WDIE
                raise self.unsupported("watchdog")
            self.io[a] = v
        elif a in (ADCSRA, ADMUX, ADCSRB):
            self.adc_write(a, v)
        elif a == ACSR:
            if v & ~0x80 & 0xFF:
                raise self.unsupported("comparator")
            self.io[a] = v
        elif a == TCCR1:
            if v:
                raise self.unsupported("Timer1")
        elif a in (TCNT1, OCR1A, OCR1B, OCR1C):
            self.io[a] = v  # harmless while TCCR1 is 0: the counter is stopped
        elif a in (USICR, USISR, USIDR, USIBR, EECR, EEDR, EEARL, EEARH, DWDR, PLLCSR, SPMCSR):
            if v:
                raise self.unsupported(self.peripheral(a), f"the firmware writes {NAMES[a]}, but {UNSUPPORTED_WHY[self.peripheral(a)]}")
        elif a in (ADCL, ADCH):
            pass  # read-only
        else:
            raise self.unsupported("register", f"the firmware writes I/O address 0x{a:02X}, which is not an ATtiny85 register this simulator knows")

    def clkpr_write(self, v: int) -> None:
        if v & 0x80:  # CLKPCE: the next write within 4 cycles sets the prescaler
            self.clkpr_enable_until = self.cycle + 4
            return
        if self.cycle <= self.clkpr_enable_until:
            self.t0_sync()
            self.time_offset = self.now()
            self.cycle_at_change = self.cycle
            self.clock_hz = self.base_clock_hz >> (v & 0x0F) if (v & 0x0F) <= 8 else self.base_clock_hz
            self.clkpr_enable_until = -1
            self.t0_plan()

    # ---- ADC ----
    def adc_write(self, a: int, v: int) -> None:
        if self.cycle >= self.adc_next:
            self.adc_finish()
        if a == ADMUX:
            self.admux = v
        elif a == ADCSRB:
            if v & 0xE0:
                raise self.unsupported("ADC", "the firmware sets ADCSRB bipolar/polarity/comparator-multiplexer bits (BIN, ACME, IPR); only plain single-ended conversions are simulated")
            self.adcsrb = v
        else:  # ADCSRA
            busy = self.adcsra & 0x40
            keep_flag = self.adcsra & 0x10 & ~v  # writing 1 to ADIF clears it
            self.adcsra = (v & 0xAF) | keep_flag | busy  # ADSC is hardware-cleared; ADIF is write-1-to-clear
            if not v & 0x80:  # ADEN off: the converter stops, and the next start is a first conversion again
                self.adcsra &= ~0x40
                self.adc_next = 1 << 62
                self.adc_first = True
            elif v & 0x40 and not busy:
                self.adc_start()

    def adc_start(self) -> None:
        mux = self.admux & 0x0F
        refs = ((self.admux >> 6) & 3) | ((self.admux >> 4 & 1) << 2)
        if self.adcsra & 0x20 and self.adcsrb & 7:
            raise self.unsupported("ADC", "the firmware auto-triggers the ADC from a source other than free running; only free running (ADTS = 0) is simulated")
        bit = ADC_PINS.get(mux)
        if bit is not None:
            if self.adc_input is None:
                raise self.unsupported("ADC", "the firmware starts an ADC conversion, but no board is attached to say what is on the pin")
            self.adc_used.add(bit)
            volts = self.adc_input(bit)
            if volts is None:
                self.floating_reads.setdefault(bit, self.cycle)
                volts = 0.0
        elif mux == 0b1101:
            volts = 0.0
        elif mux == 0b1100:
            volts = 1.1  # the bandgap reference
        elif mux == 0b1111:
            raise self.unsupported("ADC", "the firmware reads the internal temperature sensor (ADC4); it is not simulated")
        else:
            raise self.unsupported("ADC", f"the firmware selects ADC input 0b{mux:04b}, a differential channel (with gain); differential conversions are not simulated")
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
        result = max(0, min(1023, int(volts / vref * 1024)))
        self.adc_result = result
        clocks = 25 if self.adc_first else 13
        self.adc_first = False
        self.adcsra |= 0x40
        self.adc_next = self.cycle + clocks * ADC_PRESCALERS[self.adcsra & 7]

    def adc_finish(self) -> None:
        """The running conversion is done: the result registers, ADIF, and the next conversion in free-running mode."""
        done = self.adc_next
        result = self.adc_result
        self.adc_data = (((result >> 2) << 8) | ((result & 3) << 6)) if self.admux & 0x20 else result  # ADLAR: ADCH holds the top 8 bits
        self.adcsra = (self.adcsra & ~0x40) | 0x10
        self.adc_next = 1 << 62
        if self.adcsra & 0x20:  # ADATE with ADTS = 0: free running, the next conversion starts at once
            at = self.cycle
            self.cycle = max(self.cycle, done)
            self.adc_start()
            self.cycle = at

    # ---- timer 0 ----
    def t0_divisor(self) -> int:
        return PRESCALERS.get(self.tccr0b & 7, 0)

    def t0_write(self, a: int, v: int) -> None:
        self.t0_sync()
        if a == TCCR0A:
            if (v & 3) not in (0, 2):
                raise self.unsupported("Timer0", "the firmware uses a Timer0 PWM mode (analogWrite-style output); only normal and CTC mode are simulated")
            if v & 0xF0:
                raise self.unsupported("Timer0", "the firmware drives an output pin from Timer0 (COM0x); timer output pins are not simulated")
            self.tccr0a = v
        elif a == TCCR0B:
            if v & 0x08:
                raise self.unsupported("Timer0", "the firmware uses a Timer0 WGM02 mode; only normal and CTC mode are simulated")
            if (v & 7) in (6, 7):
                raise self.unsupported("Timer0", "the firmware clocks Timer0 from the T0 pin; an external clock is not simulated")
            self.tccr0b = v & 0xC7
        elif a == TCNT0:
            self.tcnt0 = v
        elif a == OCR0A:
            self.ocr0a = v
        elif a == OCR0B:
            self.ocr0b = v
        self.t0_plan()

    def t0_sync(self) -> None:
        """Advance Timer 0 to the current cycle."""
        div = self.t0_divisor()
        elapsed = self.cycle - self.t0_last
        self.t0_last = self.cycle
        if not div or elapsed <= 0 or self.sleeping_power_down:
            return
        total = self.t0_psc + elapsed
        ticks, self.t0_psc = divmod(total, div)
        ctc = (self.tccr0a & 3) == 2
        while ticks > 0:
            # ticks until the counter reaches a value that matters (a compare value or the top), in one jump when possible
            t = self.tcnt0
            targets = [self.ocr0a, self.ocr0b, 0xFF]
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
            if t == 0xFF:
                self.tifr |= 0x02
            self.tcnt0 = 0 if (ctc and t == self.ocr0a) else (t + 1) & 0xFF
            ticks -= 1

    @property
    def sleeping_power_down(self) -> bool:
        return self.sleeping and ((self.mcucr >> 3) & 3) == 2

    def t0_plan(self) -> None:
        """Cycle of the next Timer 0 event that could raise an enabled interrupt (or a very large number)."""
        div = self.t0_divisor()
        self.t0_next = 1 << 62
        if not div or not (self.timsk & 0x1A):
            return
        ctc = (self.tccr0a & 3) == 2
        best = None
        for enabled, target in ((0x10, self.ocr0a), (0x08, self.ocr0b), (0x02, 0xFF)):
            if not self.timsk & enabled:
                continue
            gap = (target - self.tcnt0) & 0xFF
            ticks_to_leave = gap + 1  # the flag is set on the tick that leaves the value
            if ctc and enabled == 0x02 and self.tcnt0 <= self.ocr0a != 0xFF:
                continue  # the counter restarts at OCR0A before it can reach 0xFF
            best = ticks_to_leave if best is None else min(best, ticks_to_leave)
        if best is not None:
            self.t0_next = self.t0_last + max(1, best * div - self.t0_psc)

    # ---- interrupts ----
    def pending_vector(self) -> int | None:
        if self.gimsk & 0x40 and (self.gifr & 0x40 or ((self.mcucr & 3) == 0 and not (self.pin_value(2)))):
            return V_INT0
        if self.gimsk & 0x20 and self.gifr & 0x20:
            return V_PCINT0
        if self.timsk & self.tifr & 0x02:
            return V_TIM0_OVF
        if self.adcsra & 0x18 == 0x18:
            return V_ADC
        if self.timsk & self.tifr & 0x10:
            return V_TIM0_COMPA
        if self.timsk & self.tifr & 0x08:
            return V_TIM0_COMPB
        return None

    def take_interrupt(self, vector: int) -> None:
        self.push_pc(self.pc)
        self.sreg &= ~I
        if vector == V_INT0:
            self.gifr &= ~0x40
        elif vector == V_PCINT0:
            self.gifr &= ~0x20
        elif vector == V_TIM0_OVF:
            self.tifr &= ~0x02
        elif vector == V_ADC:
            self.adcsra &= ~0x10
        elif vector == V_TIM0_COMPA:
            self.tifr &= ~0x10
        elif vector == V_TIM0_COMPB:
            self.tifr &= ~0x08
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
    def run(self, until: int, budget: int | None = None) -> None:
        """Execute until the cycle counter reaches ``until`` (instruction granularity; a sleeping chip jumps to the next event)."""
        prog = self.prog
        executed = 0
        while self.cycle < until:
            if self.cycle >= self.t0_next:
                self.t0_sync()
                self.t0_plan()
            if self.cycle >= self.adc_next:
                self.adc_finish()
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
                    self.cycle = min(until, self.adc_next, self.t0_next if not self.sleeping_power_down else until)
                    if self.cycle < until:
                        self.t0_sync()
                        self.t0_plan()
                    continue
            self.skip_interrupt = False
            pc = self.pc
            if pc >= len(prog):
                raise AvrError(f"the program counter ran off the end of the flash (word address 0x{pc:04X})")
            fn = prog[pc] or self._decode(pc)
            self.pc = pc + 1
            self.cycle += fn()
            executed += 1
            if budget is not None and executed >= budget:
                raise AvrError("instruction budget exhausted")
        self.instructions += executed

    # ---- instruction decoding ----
    def _decode_op(self, op: int, pc: int) -> Callable[[], int]:
        from .avrops import decode  # the instruction set lives in its own module

        return decode(self, op, pc)
