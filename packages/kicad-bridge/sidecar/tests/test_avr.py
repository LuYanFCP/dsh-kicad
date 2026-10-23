"""The ATtiny85 simulator, checked against programs compiled by avr-gcc (the .hex files are committed; see fixtures/avr/src/build.sh)."""
import json
import os

import pytest

from dsh_kicad_sidecar.avr import Avr, AvrError, Unsupported, load_firmware, parse_ihex

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
    with pytest.raises(AvrError, match="beyond the ATtiny85"):
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


@pytest.mark.parametrize("name, what, text", [("uses_adc", "ADC", "the ADC is not simulated"), ("uses_pwm", "Timer0", "PWM mode")])
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
