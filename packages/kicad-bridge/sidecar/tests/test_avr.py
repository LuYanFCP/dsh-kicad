"""The ATtiny85 simulator, checked against programs compiled by avr-gcc (the .hex files are committed; see fixtures/avr/src/build.sh)."""
import json
import os

import pytest

from dsh_kicad_sidecar.avr import Avr, AvrError, Unsupported, load_firmware, load_image, parse_ihex

FIX = os.path.join(os.path.dirname(__file__), "fixtures", "avr")
SYMS = json.load(open(os.path.join(FIX, "symbols.json")))


def cpu(name, clock_hz=1_000_000):
    return Avr(load_firmware(os.path.join(FIX, name + ".hex")), clock_hz)


def u8(v): return v & 0xFF
def u16(v): return v & 0xFFFF
def u32(v): return v & 0xFFFFFFFF
def s_div(a, b): return abs(a) // abs(b) * (1 if (a < 0) == (b < 0) else -1)
def s_mod(a, b): return a - s_div(a, b) * b


def expected_selftest():
    out = []
    p8 = lambda v: out.append(u8(v))
    p16 = lambda v: (p8(v), p8(u16(v) >> 8))
    p32 = lambda v: (p16(u32(v) & 0xFFFF), p16(u32(v) >> 16))
    a, b, c = 200, 100, 7
    w1, w2, w3 = 40000, 30000, 123
    l1, l2, l3 = 0x12345678, 0x9ABCDEF0, 1000003
    s1, s2, i1, i2, m1, m2 = -100, 27, -3000, 77, -123456789, 1234
    for v in (a + b, a - b, b - a, a * b): p8(v)
    p16(a * b); p8(a // c); p8(a % c)
    for v in (a & b, a | b, a ^ b, ~a, a << 3, a >> 3, a << c, a >> (c - 4)): p8(v)
    for v in (w1 + w2, w1 - w2, w2 - w1, w1 * w3, w1 // w3, w1 % w3, w1 << 5, w1 >> 5): p16(v)
    for v in (l1 + l2, l1 - l2, l1 * l3, l2 // l3, l2 % l3, l1 << 7, l2 >> 9, l1 ^ l2): p32(v)
    for v in (s1 + s2, s1 * s2, s_div(s1, s2), s_mod(s1, s2), s1 >> 2): p8(v)
    for v in (i1 * i2, s_div(i1, i2), s_mod(i1, i2), i1 >> 3): p16(v)
    for v in (m1 * m2, s_div(m1, m2), s_mod(m1, m2), m1 >> 11): p32(v)
    for v in (a < b, a > b, s1 < s2, s1 > s2, w1 < w2, i1 < i2, l1 < l2, m1 < m2, a == 200, w3 != 123): p8(int(v))
    for v in (a + 1, c - 8, -a, -s1): p8(v)
    arr = sorted([9, 3, 250, 1, 77, 0, 128, 42, 5, 200])
    for v in arr: p8(v)
    p16(sum(arr))
    crc = 0xFFFF
    for byte in arr:
        crc ^= byte << 8
        for _ in range(8):
            crc = u16((crc << 1) ^ 0x1021) if crc & 0x8000 else u16(crc << 1)
    p16(crc)
    for v in (bin(a).count("1"), 8, 0): p8(v)
    for v in (11, 22, 33, 44, 55, 66, 77, 99): p8(v)
    p8(42)
    for ch in "ATtiny": p8(ord(ch))
    p8(1); p16(0x1234); p8(8)
    p16(337); p16(30)
    p8(len(out))
    return out


@pytest.mark.parametrize("opt", ["O0", "O1", "Os", "O2"])
def test_every_instruction_mix_computes_what_c_says(opt):
    """avr-gcc at four optimisation levels: arithmetic of every width, signed and unsigned, shifts, comparisons, sorting, CRC, jump tables,
    function pointers, flash reads (LPM), struct copies and soft-float, compared with the same computation in Python."""
    want = expected_selftest()
    chip = cpu(f"selftest_{opt}")
    addr = SYMS[f"selftest_{opt}"]["results"]
    for _ in range(400):
        chip.run(chip.cycle + 50_000)
        if chip.read_data(addr + len(want) - 1) == (len(want) - 1) & 0xFF:
            break
    got = [chip.read_data(addr + i) for i in range(len(want))]
    assert got == want
    assert chip.cycle > 20_000  # it really ran the long routines


def record(address, data, kind=0):
    raw = bytes([len(data), address >> 8, address & 0xFF, kind]) + bytes(data)
    return ":" + (raw + bytes([(-sum(raw)) & 0xFF])).hex().upper()


def elf(segments, machine=83):
    """A minimal 32-bit little-endian ELF with one PT_LOAD per (paddr, data)."""
    import struct

    header = b"\x7fELF" + bytes([1, 1, 1, 0]) + bytes(8) + struct.pack("<HHIIIIIHHHHHH", 2, machine, 1, 0, 52, 0, 0, 52, 32, len(segments), 40, 0, 0)
    offset = 52 + 32 * len(segments)
    phdrs, body = b"", b""
    for paddr, data in segments:
        phdrs += struct.pack("<8I", 1, offset + len(body), paddr, paddr, len(data), len(data), 5, 1)
        body += data
    return header + phdrs + body


def test_hex_loading():
    image = parse_ihex(open(os.path.join(FIX, "button_poll.hex")).read())
    assert len(image) == 8192 and image[:2] == bytes.fromhex("0ec0")  # rjmp to the reset code
    assert parse_ihex("\n".join([record(0x10, [1, 2, 3]), record(0, [], 1)]))[0x10:0x13] == bytes([1, 2, 3])
    with pytest.raises(AvrError, match="bad length or checksum"):
        parse_ihex(record(0, [1, 2]).replace("0102", "0103"))
    with pytest.raises(AvrError, match="beyond the device"):
        parse_ihex(record(0x2000, [1, 2]))
    with pytest.raises(AvrError, match="no program data"):
        parse_ihex(record(0, [], 1))
    with pytest.raises(AvrError, match="not an Intel HEX record"):
        parse_ihex("hello")


def test_elf_loading(tmp_path):
    path = tmp_path / "x.elf"
    path.write_bytes(elf([(0, bytes([0xAA, 0xBB])), (0x40, bytes([1, 2, 3])), (0x810000, bytes([9, 9]))]))  # the last is EEPROM: ignored
    image = load_firmware(str(path))
    assert image[:2] == bytes([0xAA, 0xBB]) and image[0x40:0x43] == bytes([1, 2, 3]) and image[2] == 0xFF
    path.write_bytes(elf([(0, b"\0\0")], machine=40))
    with pytest.raises(AvrError, match="machine 40, not AVR"):
        load_firmware(str(path))
    path.write_bytes(elf([(0x2000, b"\0\0")]))
    with pytest.raises(AvrError, match="beyond"):
        load_firmware(str(path))


# ---- peripherals: timing, interrupts, sleep, and what is refused -----------------------------
def watch(c):
    log = []
    c.on_pin_change = lambda: log.append((c.now() * 1000, c.io[0x18]))
    return log


def toggles(log, bit=0):
    """(ms, level) of every change of one PORTB bit."""
    out, last = [], None
    for t, port in log:
        level = port >> bit & 1
        if level != last:
            out.append((t, level))
            last = level
    return out


def test_delay_loop_timing():
    c = cpu("blink_delay")
    log = watch(c)
    c.run(c.cycle_for(0.1))
    edges = toggles(log)[1:]  # the first entry is PB0 reading low before the first toggle
    gaps = [b[0] - a[0] for a, b in zip(edges, edges[1:])]
    assert len(edges) >= 9 and all(10.0 < g < 10.02 for g in gaps)  # _delay_ms(10) plus the loop overhead


def test_timer0_ctc_period_and_interrupt_count():
    c = cpu("timer_ctc")
    log = watch(c)
    c.run(c.cycle_for(0.1))
    gaps = [b[0] - a[0] for a, b in zip(toggles(log)[1:], toggles(log)[2:])]
    assert all(7.99 < g < 8.01 for g in gaps) and c.read_data(SYMS["timer_ctc"]["ticks"]) == 12  # OCR0A = 124 at clk/64 = 8 ms


def test_timer0_overflow_interrupt():
    c = cpu("timer_ovf")
    c.run(c.cycle_for(0.1))
    assert c.read_data(SYMS["timer_ovf"]["overflows"]) == 48  # 100 ms / 2.048 ms


def test_pin_change_interrupt_wakes_an_idle_chip():
    c = cpu("pcint_sleep")
    log = watch(c)
    c.set_inputs([None, None, None, 1, None, None])
    c.run(c.cycle_for(0.01))
    assert c.sleeping and c.instructions < 60  # asleep almost at once
    c.set_inputs([None, None, None, 0, None, None])  # press
    c.run(c.cycle_for(0.02))
    assert c.read_data(SYMS["pcint_sleep"]["presses"]) == 1 and log[-1][1] & 0x10  # PB4 toggled on
    c.set_inputs([None, None, None, 1, None, None])  # release: the ISR sees the level and does nothing
    c.run(c.cycle_for(0.03))
    assert c.read_data(SYMS["pcint_sleep"]["presses"]) == 1
    c.set_inputs([None, None, None, 0, None, None])
    c.run(c.cycle_for(0.04))
    assert c.read_data(SYMS["pcint_sleep"]["presses"]) == 2 and not log[-1][1] & 0x10  # toggled back off


def test_int0_falling_edge_wakes_power_down_but_a_high_level_does_not():
    c = cpu("int0_powerdown")
    c.set_inputs([None, None, 1, None, None, None])
    c.run(c.cycle_for(0.02))
    assert c.sleeping and c.read_data(SYMS["int0_powerdown"]["wakes"]) == 0
    c.set_inputs([None, None, 0, None, None, None])
    c.run(c.cycle_for(0.03))
    assert c.read_data(SYMS["int0_powerdown"]["wakes"]) == 1 and c.io[0x18] & 0x10


@pytest.mark.parametrize("name, what, text", [("uses_acme", "ADC", "ACME"), ("uses_adc_trigger", "ADC", "free running"), ("uses_timer1_foc", "Timer1", "forces an output compare"),
                                              ("uses_usi_twowire", "USI", "two-wire mode"), ("uses_mode5", "Timer0", "waveform mode 5")])
def test_unsupported_peripherals_stop_the_run(name, what, text):
    c = cpu(name)
    with pytest.raises(Unsupported, match=text) as info:
        c.run(c.cycle_for(0.01))
    assert info.value.what == what and info.value.cycle < 100


def test_clock_prescaler_and_time():
    c = cpu("blink_delay", 8_000_000)
    assert c.cycle_for(0.001) == 8000 and c.now() == 0
    c.run(8000)
    assert c.now() == pytest.approx(0.001, abs=1e-6)


# ---- the ADC ---------------------------------------------------------------------------------
def with_adc(name, volts, vcc=5.0):
    c = cpu(name)
    c.vcc_volts = vcc
    c.adc_input = lambda bit: volts.get(bit)
    return c


@pytest.mark.parametrize("volts, counts", [(0.0, 0), (2.5, 512), (3.3, 675), (4.99, 1021), (5.0, 1023), (7.0, 1023)])
def test_adc_10_bit_reading_against_vcc(volts, counts):
    c = with_adc("adc_read10", {4: volts})  # ADC2 is PB4
    c.run(c.cycle_for(0.01))
    assert c.read_data(SYMS["adc_read10"]["reading"]) | c.read_data(SYMS["adc_read10"]["reading"] + 1) << 8 == counts  # ADC = V * 1024 / Vref, floored, at most 1023


def test_adc_reference_follows_the_supply():
    c = with_adc("adc_read10", {4: 1.65}, vcc=3.3)
    c.run(c.cycle_for(0.01))
    assert c.read_data(SYMS["adc_read10"]["reading"]) | c.read_data(SYMS["adc_read10"]["reading"] + 1) << 8 == 512


def test_adc_left_adjusted_threshold_firmware():
    levels = {3: 3.0}  # ADC3 is PB3
    c = with_adc("adc_threshold", levels)
    c.run(c.cycle_for(0.02))
    assert c.read_data(SYMS["adc_threshold"]["last"]) == 614 >> 2 and c.io[0x18] & 1  # above half of Vcc: PB0 lit
    levels[3] = 2.0
    c.run(c.cycle_for(0.04))
    assert c.read_data(SYMS["adc_threshold"]["last"]) == 409 >> 2 and not c.io[0x18] & 1


def test_adc_bandgap_channel_and_internal_reference():
    c = with_adc("adc_bandgap", {})
    c.run(c.cycle_for(0.02))
    word = lambda sym: c.read_data(SYMS["adc_bandgap"][sym]) | c.read_data(SYMS["adc_bandgap"][sym] + 1) << 8
    assert word("vs_vcc") == int(1.1 / 5 * 1024) and word("vs_internal") == 1023  # 1.1 V against Vcc, and against itself (full scale)


def test_adc_conversion_takes_13_adc_clocks_and_25_for_the_first():
    flash = bytes([0x00, 0xC0] * 4096)[:8192]  # rjmp .+0 forever is c000; use NOPs so the program counter does not matter here
    c = Avr(bytes(8192), 1_000_000)  # all zero words: nops
    c.vcc_volts = 5.0
    c.adc_input = lambda bit: 2.5
    c.io_write(0x07, 0x03)                  # ADMUX: ADC3
    c.io_write(0x06, 0x80 | 0x40 | 0x06)    # ADEN, ADSC, /64
    assert c.io_read(0x06) & 0x40
    c.cycle += 25 * 64 - 1
    assert c.io_read(0x06) & 0x40 and not c.io_read(0x06) & 0x10   # still converting
    c.cycle += 1
    assert not c.io_read(0x06) & 0x40 and c.io_read(0x06) & 0x10   # done, ADIF set
    assert c.io_read(0x04) | c.io_read(0x05) << 8 == 512
    c.io_write(0x06, 0x80 | 0x40 | 0x10 | 0x06)                    # ADIF cleared by writing 1; start another
    assert not c.io_read(0x06) & 0x10
    c.cycle += 13 * 64 - 1
    assert c.io_read(0x06) & 0x40
    c.cycle += 1
    assert not c.io_read(0x06) & 0x40


def test_adc_free_running_interrupt_wakes_the_chip_and_costs_nothing_while_asleep():
    c = with_adc("adc_irq", {3: 2.5})
    c.run(c.cycle_for(0.1))
    count = c.read_data(SYMS["adc_irq"]["count"])
    assert 115 <= count <= 125  # one conversion per 13 * 64 cycles after the first
    assert c.read_data(SYMS["adc_irq"]["reading"]) | c.read_data(SYMS["adc_irq"]["reading"] + 1) << 8 == 512
    assert c.instructions < count * 40 and c.sleeping


def test_adc_on_a_floating_pin_is_a_hazard_and_reads_zero():
    c = with_adc("adc_read10", {4: None})
    c.run(c.cycle_for(0.01))
    assert 4 in c.floating_reads and c.read_data(SYMS["adc_read10"]["reading"]) == 0


def test_adc_without_a_board_is_refused():
    c = cpu("adc_read10")
    with pytest.raises(Unsupported, match="no board is attached"):
        c.run(c.cycle_for(0.01))


# ---- Timer0 PWM ------------------------------------------------------------------------------
def test_fast_pwm_outputs_both_polarities():
    c = cpu("pwm_fast")
    c.run(c.cycle_for(0.005))
    assert c.pwm_pin(0)["duty"] == pytest.approx(1 / 256)  # OCR0A is written, but only latched when the counter restarts (16.4 ms at clk/64)
    c.run(c.cycle_for(0.02))
    a, b = c.pwm_pin(0), c.pwm_pin(1)
    assert a["duty"] == pytest.approx(65 / 256) and a["hz"] == pytest.approx(1e6 / 64 / 256)  # OCR0A + 1 of 256 ticks
    assert b["duty"] == pytest.approx(1 - 192 / 256)  # inverting
    assert c.pwm_pin(2) is None


def test_phase_correct_pwm_duty_and_frequency():
    c = cpu("pwm_pc")
    c.run(c.cycle_for(0.02))
    p = c.pwm_pin(0)
    assert p["duty"] == pytest.approx(128 / 255) and p["hz"] == pytest.approx(1e6 / 8 / 510)


def test_ctc_toggle_is_a_square_wave():
    c = cpu("pwm_ctc_toggle")
    c.run(c.cycle_for(0.005))
    p = c.pwm_pin(0)
    assert p["duty"] == 0.5 and p["hz"] == pytest.approx(1e6 / 64 / (2 * 125))


def test_a_pwm_pin_must_be_an_output_to_count():
    flash = bytes(8192)
    c = Avr(flash)
    c.io_write(0x29, 100)   # OCR0A, written while the timer is stopped: effective at once
    c.io_write(0x2A, 0x83)  # COM0A1, WGM01, WGM00
    c.io_write(0x33, 0x03)
    assert c.pwm_pin(0) is None  # DDRB bit 0 is still an input
    c.io_write(0x17, 0x01)
    assert c.pwm_pin(0)["duty"] == pytest.approx(101 / 256)


def test_ocr_writes_latch_at_the_top_in_the_pwm_modes():
    c = Avr(bytes(8192))
    c.io_write(0x17, 0x01)
    c.io_write(0x2A, 0x83)  # fast PWM, COM0A1
    c.io_write(0x33, 0x01)  # clk/1: one period is 256 cycles
    c.io_write(0x29, 100)   # OCR0A: pending until the counter restarts
    assert c.pwm_pin(0)["duty"] == pytest.approx(1 / 256)
    c.cycle += 100
    c.io_read(0x32)
    assert c.pwm_pin(0)["duty"] == pytest.approx(1 / 256)
    c.cycle += 200      # past the wrap at 256
    c.io_read(0x32)
    assert c.pwm_pin(0)["duty"] == pytest.approx(101 / 256)


def test_the_fade_raises_the_duty_with_the_overflow_interrupt():
    c = cpu("pwm_fade")
    seen = []
    for ms in (50, 150, 300, 500, 600):
        c.run(c.cycle_for(ms / 1000))
        seen.append(c.pwm_pin(0)["duty"])
    assert seen == sorted(seen) and seen[0] < 0.15 and seen[-1] == pytest.approx(253 / 256)  # up to OCR0A = 252
    assert c.read_data(SYMS["pwm_fade"]["n"]) == int(0.6 / 0.002048) & 0xFF  # one overflow per 2.048 ms at clk/8


def test_the_arduino_style_millis_overflow_runs_in_fast_pwm_mode():
    c = cpu("millis_blink")
    log = watch(c)
    c.run(c.cycle_for(0.5))
    edges = toggles(log, 2)[1:]
    gaps = [b[0] - a[0] for a, b in zip(edges, edges[1:])]
    assert len(edges) >= 4 and all(98.2 < g < 98.5 for g in gaps)  # six overflows of 16.384 ms


def test_phase_correct_timer_flags_and_counter():
    c = Avr(bytes(8192))
    c.io_write(0x2A, 0x01)  # WGM00: phase-correct, no outputs
    c.io_write(0x29, 100)   # OCR0A
    c.io_write(0x33, 0x01)  # clk/1
    c.cycle += 100
    assert c.io_read(0x32) == 100 and not c.io_read(0x38) & 0x10   # counting up, no match flag yet: it is set on leaving the match
    c.cycle += 1
    assert c.io_read(0x38) & 0x10
    c.io_write(0x38, 0x10)
    c.cycle += 255 - 100 + 5                                       # over the top: counting down
    assert c.io_read(0x32) == 510 - (101 + 160)  # past the top, counting down
    c.cycle += 300
    assert c.io_read(0x38) & 0x02                                  # TOV0 at BOTTOM


# ---- the rest of the ATtiny85 ----------------------------------------------------------------
def chip(name, clock_hz=1_000_000, **kw):
    return Avr(load_firmware(os.path.join(FIX, name + ".hex")), clock_hz, **kw)


def word(c, name, symbol):
    addr = SYMS[name][symbol]
    return c.read_data(addr) | c.read_data(addr + 1) << 8


def test_an_unfed_watchdog_resets_the_chip_every_16_ms_plus_the_startup_delay():
    c = cpu("wdt_reset")
    c.run(c.cycle_for(0.4))
    times = [t * 1000 for t, cause in c.resets]
    assert [cause for _, cause in c.resets] == ["watchdog"] * 5
    assert times[0] == pytest.approx(16.05, abs=0.1) and all(79.9 < b - a < 80.2 for a, b in zip(times, times[1:]))  # 16 ms of watchdog + the 64 ms start-up
    assert c.read_data(SYMS["wdt_reset"]["boots"]) == 5 and c.mcusr & 0x08  # the count survives the resets; WDRF is set


def test_a_fed_watchdog_never_resets_and_an_interrupt_watchdog_wakes_power_down():
    c = cpu("wdt_fed")
    c.run(c.cycle_for(0.3))
    assert c.resets == []
    c = cpu("wdt_interrupt")
    log = watch(c)
    c.run(c.cycle_for(1.1))
    assert c.read_data(SYMS["wdt_interrupt"]["wakes"]) == 4 and c.sleeping_power_down  # one per 32768 / 128 kHz = 256 ms
    assert [round(t) for t, _ in log][1:] == [256, 512, 768, 1024] and c.instructions < 300


def test_watchdog_registers_follow_the_timed_sequence():
    c = Avr(bytes(8192))
    c.io_write(0x21, 0x08)               # WDE: enable, no sequence needed
    assert c.io_read(0x21) & 0x08
    c.io_write(0x21, 0x00)               # disabling without the sequence does nothing
    assert c.io_read(0x21) & 0x08
    c.io_write(0x21, 0x18)               # WDCE | WDE opens the window
    assert c.io_read(0x21) & 0x10
    c.cycle += 4
    c.io_write(0x21, 0x00)               # inside it: disabled
    assert not c.io_read(0x21) & 0x08
    c.io_write(0x21, 0x08)
    c.mcusr = 0x08                       # WDRF set: WDE cannot be cleared until WDRF is
    c.io_write(0x21, 0x18)
    c.io_write(0x21, 0x00)
    assert c.io_read(0x21) & 0x08
    c.io_write(0x21, 0x40)               # WDIE alone: interrupt mode; writing 1 to WDIF clears it
    c.wdtcr |= 0x80
    c.io_write(0x21, 0x40 | 0x80)
    assert not c.io_read(0x21) & 0x80


def test_eeprom_boot_counter_survives_watchdog_resets_and_writes_take_3_4_ms():
    c = cpu("eeprom_counter")
    c.run(c.cycle_for(0.5))
    assert c.eeprom[0] == 3 and c.read_data(SYMS["eeprom_counter"]["last"]) == 2 and c.io[0x18] & 1
    first = [round(t * 1000, 2) for t, a, v in c.eeprom_log]
    assert [(a, v) for _, a, v in c.eeprom_log] == [(0, 1), (0, 2), (0, 3)]
    assert 3.4 < first[0] < 3.6 and 83.5 < first[1] < 83.7  # 3.4 ms after the write started, again after each 80 ms restart


def test_eeprom_register_protocol():
    c = Avr(bytes(8192), eeprom=bytes(range(512 // 2)) * 2)
    c.io_write(0x1E, 5)
    c.io_write(0x1C, 0x01)                       # EERE: read
    assert c.io_read(0x1D) == 5 and c.extra == 4  # the CPU halts for four cycles
    c.extra = 0
    c.io_write(0x1D, 0x77)
    c.io_write(0x1C, 0x02)                       # EEPE without EEMPE: nothing happens
    assert not c.io_read(0x1C) & 0x02 and c.eeprom[5] == 5
    c.io_write(0x1C, 0x04)
    c.io_write(0x1C, 0x02)                       # EEMPE then EEPE inside four cycles: the write starts
    assert c.io_read(0x1C) & 0x02 and c.extra == 2
    c.io_write(0x1D, 0x11)                       # busy: the data register is locked
    assert c.io_read(0x1D) == 0x77
    c.cycle = c.events["ee"] - 1
    assert c.io_read(0x1C) & 0x02
    c.cycle += 1
    assert not c.io_read(0x1C) & 0x02 and c.eeprom[5] == 0x77
    c.io_write(0x1C, 0x10 | 0x04)                # EEPM = 01 (erase only), EEMPE
    c.io_write(0x1C, 0x10 | 0x02)
    c.cycle = c.events["ee"]
    assert c.io_read(0x1C) & 0x02 == 0 and c.eeprom[5] == 0xFF
    c.io_write(0x1C, 0x30 | 0x04)
    with pytest.raises(Unsupported, match="reserved EEPROM programming mode"):
        c.io_write(0x1C, 0x30 | 0x02)


def test_eeprom_contents_come_from_the_elf_eeprom_section():
    flash, eeprom = load_image(os.path.join(FIX, "eeprom_initial.elf"))
    assert eeprom[:2] == bytes([0x12, 0x34]) and eeprom[2] == 0xFF
    c = Avr(flash, 1_000_000, eeprom=eeprom)
    c.run(c.cycle_for(0.01))
    assert [c.read_data(SYMS["eeprom_initial"]["seen"] + i) for i in range(2)] == [0x12, 0x34] and c.io[0x18] & 1


def test_timer1_pwm_from_the_pll_clock():
    c = cpu("timer1_pwm")
    c.run(c.cycle_for(0.01))
    a, b = c.pwm_pin(1), c.pwm_pin(4)
    assert a["duty"] == pytest.approx(50 / 200) and a["hz"] == pytest.approx(4e6 / 200)  # PCK/16 = 4 MHz, OCR1C + 1 = 200
    assert b["duty"] == pytest.approx(100 / 200)
    assert c.io_read(0x27) & 0x07 == 0x07  # PCKE, PLLE and PLOCK


def test_timer1_complementary_outputs_and_the_pwm_extremes():
    c = cpu("timer1_complementary", 8_000_000)
    c.run(c.cycle_for(0.01))
    a, n = c.pwm_pin(1), c.pwm_pin(0)
    assert a["duty"] == pytest.approx(62 / 250) and n["duty"] == pytest.approx(1 - 62 / 250) and a["hz"] == pytest.approx(8e6 / 8 / 250)
    for ocr, duty in ((0, 0.0), (249, 1.0), (250, 1.0)):  # datasheet Table 12-2: OCR1x = 0 holds the pin low, OCR1x = OCR1C high
        c.io_write(0x2E, ocr)
        c.cycle += 8 * 250 * 2
        c.t1_sync()
        c.io_read(0x2F)
        assert c.pwm_pin(1)["duty"] == duty


def test_timer1_ctc_interrupts_and_flags():
    c = cpu("timer1_ctc")
    log = watch(c)
    c.run(c.cycle_for(0.1))
    assert c.read_data(SYMS["timer1_ctc"]["compares"]) == 13 and c.read_data(SYMS["timer1_ctc"]["overflows"]) == 0
    edges = toggles(log, 0)[1:]
    assert 3.8 < edges[0][0] < 4.0 and all(7.99 < b[0] - a[0] < 8.01 for a, b in zip(edges, edges[1:]))  # 61 ticks to the first match, then every 125


def test_timer1_normal_mode_overflow_and_toggling_output():
    c = cpu("timer1_ovf")
    c.run(c.cycle_for(0.1))
    assert c.read_data(SYMS["timer1_ovf"]["overflows"]) == 6  # 256 ticks of 64 µs
    wave = c.pwm_pin(1)
    assert wave["duty"] == 0.5 and wave["hz"] == pytest.approx(1e6 / 64 / (2 * 256))


def test_timer1_refuses_what_it_does_not_model():
    for writes in ([(0x2C, 0x80)], [(0x2C, 0x04)], [(0x30, 0x20)]):  # TSM; FOC1A; clear-on-match output outside PWM mode
        c = Avr(bytes(8192))
        with pytest.raises(Unsupported):
            for a, v in writes:
                c.io_write(a, v)
    c = Avr(bytes(8192))
    c.io_write(0x17, 0x03)
    c.io_write(0x2A, 0x83)  # Timer0 fast PWM on OC0A (PB0)
    c.io_write(0x33, 0x01)
    with pytest.raises(Unsupported, match="both drive PB0"):
        c.io_write(0x30, 0x40 | 0x10 | 0x01)  # Timer1 PWM1A with /OC1A on PB0 as well


def test_comparator_output_and_interrupt_modes():
    volts = {0: 2.0, 1: 3.0}
    c = cpu("comparator_irq")
    c.adc_input = lambda bit: volts.get(bit)
    c.run(c.cycle_for(0.01))
    assert not c.io_read(0x08) & 0x20  # ACO: AIN0 (2.0 V) is not above AIN1 (3.0 V)
    volts[0] = 4.0
    c.after_pin_levels()
    c.run(c.cycle_for(0.02))
    events = lambda: c.read_data(SYMS["comparator_irq"]["events"])
    assert events() == 1 and c.io[0x18] & 0x10 and c.io_read(0x08) & 0x20
    volts[0] = 1.0                      # a falling output does not trigger the rising-edge mode
    c.after_pin_levels()
    c.run(c.cycle_for(0.03))
    assert events() == 1
    volts[0] = 4.0
    c.after_pin_levels()
    c.run(c.cycle_for(0.04))
    assert events() == 2
    with pytest.raises(Unsupported, match="no board is attached"):
        Avr(bytes(8192)).io_read(0x08)


def test_comparator_bandgap_input():
    c = cpu("comparator_poll")
    level = {1: 0.8}
    c.adc_input = lambda bit: level.get(bit)
    c.run(c.cycle_for(0.01))
    assert c.io[0x18] >> 4 & 1 == 1    # 1.1 V (ACBG) is above AIN1 = 0.8 V
    level[1] = 1.5
    c.comparator_update()
    c.run(c.cycle_for(0.02))
    assert c.io[0x18] >> 4 & 1 == 0


def test_adc_differential_channels_bipolar():
    c = cpu("adc_diff")
    c.adc_input = lambda bit: {4: 2.55, 3: 2.50}.get(bit)  # ADC2 (PB4) - ADC3 (PB3) = +50 mV
    c.run(c.cycle_for(0.02))
    assert word(c, "adc_diff", "gain1") == int(0.05 * 512 / 5) and word(c, "adc_diff", "gain20") == int(0.05 * 20 * 512 / 5)
    c = cpu("adc_diff")
    c.adc_input = lambda bit: {4: 2.50, 3: 2.55}.get(bit)  # -50 mV: two's complement, floored like the converter
    c.run(c.cycle_for(0.02))
    assert word(c, "adc_diff", "gain1") == (-6) & 0x3FF and word(c, "adc_diff", "gain20") == (-103) & 0x3FF


def test_adc_temperature_sensor_follows_the_datasheet_table():
    for celsius, lsb in ((-40, 230), (25, 300), (85, 370)):
        c = cpu("adc_temp")
        c.temperature_c = celsius
        c.adc_input = lambda bit: None
        c.run(c.cycle_for(0.02))
        assert word(c, "adc_temp", "reading") == lsb
    c = cpu("adc_temp")
    c.temperature_c = 55
    c.adc_input = lambda bit: None
    c.run(c.cycle_for(0.02))
    assert 330 < word(c, "adc_temp", "reading") < 340  # between the 25 °C and 85 °C points


def test_adc0_is_the_reset_pin_unless_rstdisbl():
    for rstdisbl in (False, True):
        c = Avr(bytes(8192), rstdisbl=rstdisbl)
        c.adc_input = lambda bit: 1.0
        c.io_write(0x07, 0b0000)  # ADC0 (PB5)
        if rstdisbl:
            c.io_write(0x06, 0x80 | 0x40)
            assert c.io_read(0x06) & 0x40
        else:
            with pytest.raises(Unsupported, match="RESET pin unless the RSTDISBL fuse"):
                c.io_write(0x06, 0x80 | 0x40)


def test_usi_spi_master_transfers_and_pin_waveforms():
    c = chip("usi_spi_master", usi_input=[0x12, 0x34])
    log = []
    c.on_pin_change = lambda: log.append((c.now() * 1e6, c.io[0x18] >> 2 & 1, c.pin_value(1)))
    c.run(c.cycle_for(0.01))
    assert [c.read_data(SYMS["usi_spi_master"]["rx"] + i) for i in range(2)] == [0x12, 0x34]
    assert [(tx, rx) for _, tx, rx in c.usi_log] == [(0xA5, 0x12), (0x3C, 0x34)]
    assert sum(1 for (_, a, _), (_, b, _) in zip(log, log[1:]) if a != b) == 32       # 16 USCK edges per byte
    sampled, last_ck = [], 0                                                         # a slave samples DO on the rising edge (SPI mode 0)
    for _, ck, do in log:
        if ck == 1 and last_ck == 0:
            sampled.append(do)
        last_ck = ck
    byte = lambda bits: sum(bit << (7 - i) for i, bit in enumerate(bits))
    assert byte(sampled[:8]) == 0xA5 and byte(sampled[8:16]) == 0x3C


def test_usi_software_strobe_shifts_without_touching_usck():
    c = chip("usi_strobe", usi_input=[0xC3])
    c.run(c.cycle_for(0.01))
    assert c.read_data(SYMS["usi_strobe"]["rx"]) == 0xC3 and [(tx, rx) for _, tx, rx in c.usi_log] == [(0x96, 0xC3)]
    assert not c.io[0x18] & 0x04


def test_the_reset_pin_restarts_the_program_after_the_startup_delay():
    c = chip("reset_boots")
    c.run(c.cycle_for(0.01))
    assert c.read_data(SYMS["reset_boots"]["boots"]) == 1 and c.io[0x18] & 1
    c.set_reset_line(True)
    c.run(c.cycle_for(0.02))
    assert c.held and c.pc == 0 and c.mcusr & 0x02 and c.io[0x18] == 0  # EXTRF set; the pins are inputs again
    c.set_reset_line(False)
    c.run(c.cycle_for(0.05))
    assert c.read_data(SYMS["reset_boots"]["boots"]) == 1  # the 64 ms start-up delay has not passed
    c.run(c.cycle_for(0.1))
    assert c.read_data(SYMS["reset_boots"]["boots"]) == 2 and c.io[0x18] & 1
    assert [cause for _, cause in c.resets] == ["external"]
    flash = load_firmware(os.path.join(FIX, "reset_boots.hex"))
    ignoring = Avr(flash, rstdisbl=True)
    ignoring.set_reset_line(True)
    assert not ignoring.held


def test_didr0_disables_the_digital_input_buffer():
    c = chip("didr_pullup")
    c.set_inputs([None, None, None, 1, None, None])
    c.run(c.cycle_for(0.01))
    assert not c.io[0x18] >> 4 & 1  # PB3 is high, but its buffer is off: it reads 0


def test_device_sizes():
    flash = bytes(2048)
    c = Avr(flash, device="attiny25")
    assert c.sram_end == 0x60 + 127 and len(c.eeprom) == 128
    with pytest.raises(AvrError, match="flash image must be 2048 bytes for the attiny25"):
        Avr(bytes(8192), device="attiny25")
    with pytest.raises(AvrError, match="unknown device"):
        Avr(flash, device="attiny13")
    with pytest.raises(AvrError, match="outside the attiny25's memory"):
        c.read_data(0x60 + 128)
