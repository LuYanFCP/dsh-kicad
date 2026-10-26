"""ESP32 firmware simulation. The QEMU side (esp32qemu: gdb packets, Xtensa loads and stores, the pin registers, flash images) is
tested on its own; the board side (esp32sim) is driven by a scripted machine, so scenarios, assertions and hazards are tested
without QEMU; with Espressif's QEMU installed, the test programs in tests/fixtures/esp32 run for real."""
import json
import os
import socket
import threading

import pytest

from dsh_kicad_sidecar import esp32qemu as eq
from dsh_kicad_sidecar.esp32ledc import LEDC_BASE, LedcState, LedcUnsupported
from dsh_kicad_sidecar import esp32sim, mcu
from dsh_kicad_sidecar.spice import SimulationError
from dsh_kicad_sidecar.tools import Toolbox

from conftest import needs_kicad_cli, needs_symbols

FIX = os.path.join(os.path.dirname(__file__), "fixtures", "esp32")
ESP32 = next(p for p in mcu.load_providers() if p["id"] == "esp32")
G = eq.GPIO_BASE
W1TS, W1TC, ENABLE_W1TS, ENABLE_W1TC = G + 0x08, G + 0x0C, G + 0x24, G + 0x28
IO_MUX = {gpio: eq.IO_MUX_BASE + off for gpio, off in eq.IO_MUX_OFFSET.items()}
GPIO_FUNC = (2 << 12) | (2 << 10)  # MCU_SEL GPIO, 20 mA drive
TOUCH_PAD1, TOUCH_PAD2 = eq.RTCIO_BASE + 0x98, eq.RTCIO_BASE + 0x9C  # GPIO0, GPIO2
RUE, RDE = 1 << 27, 1 << 28


# ---- Xtensa and the gdb protocol ---------------------------------------------------------------
def test_loads_and_stores_decode():
    s32i = eq.decode_mem(bytes([0x32, 0x62, 0x02]))  # s32i a3, a2, 8
    assert s32i == eq.MemInsn(load=False, width=4, signed=False, reg=3, base=2, offset=8, length=3)
    assert eq.decode_mem(bytes([0x39, 0x14])) == eq.MemInsn(load=False, width=4, signed=False, reg=3, base=4, offset=4, length=2)  # s32i.n a3, a4, 4
    assert eq.decode_mem(bytes([0x28, 0xF3])) == eq.MemInsn(load=True, width=4, signed=False, reg=2, base=3, offset=60, length=2)  # l32i.n a2, a3, 60
    l32i = eq.decode_mem(bytes([0x52, 0x2A, 0x0F]))  # l32i a5, a10, 60
    assert (l32i.load, l32i.width, l32i.reg, l32i.base, l32i.offset) == (True, 4, 5, 10, 60)
    assert eq.decode_mem(bytes([0x42, 0x03, 0x05])).width == 1  # l8ui a4, a3, 5
    l16si = eq.decode_mem(bytes([0x42, 0x93, 0x05]))
    assert l16si.signed and l16si.offset == 10
    s8i = eq.decode_mem(bytes([0x42, 0x43, 0x07]))
    assert (s8i.load, s8i.width, s8i.offset) == (False, 1, 7)
    assert eq.decode_mem(bytes([0x42, 0xE3, 0x00])).atomic  # s32c1i
    assert eq.decode_mem(bytes([0x20, 0xEA, 0x03])) is None  # rsr.ccount is no memory access
    assert eq.decode_mem(bytes([0x82, 0x73, 0x00])) is None  # LSAI r=7 (cache ops)


def test_rom_patterns():
    assert eq.is_break(bytes([0x10, 0x41, 0x00])) and eq.is_break(bytes([0x2D, 0xF1, 0x00]))  # break 1, 1; break.n 1
    assert not eq.is_break(bytes([0x7C, 0xFB, 0x30])) and not eq.is_break(bytes([0x00, 0x70, 0x00]))  # movi.n a11, -1; waiti 0
    assert eq.rsr_ccount_at(b"\x36\x41\x00\x20\xea\x03\x1d\xf0") == (3, 2)  # entry; rsr.ccount a2; retw.n
    assert eq.rsr_ccount_at(b"\x21\xea\x03") is None  # op0 1 is not RSR
    assert eq.is_waiti(bytes([0x00, 0x70, 0x00])) and eq.is_waiti(bytes([0x00, 0x73, 0x00])) and not eq.is_waiti(bytes([0x00, 0x60, 0x00]))


def test_window_registers_map_to_the_physical_file():
    words = [0] * 157
    words[eq.G_WINDOWBASE] = 3
    for i in range(64):
        words[eq.G_AR0 + i] = 1000 + i
    regs = eq.Regs(words)
    assert regs.a(0) == 1012 and regs.a(5) == 1017 and regs.a_index(15) == eq.G_AR0 + 27
    words[eq.G_WINDOWBASE] = 15
    assert regs.a(4) == 1000 and regs.a(3) == 1063  # wraps around the 64 registers


def test_stop_replies():
    assert eq._stop("T05thread:01;watch:3ff44008;") == {"signal": 5, "thread": 1, "watch": ("2", 0x3FF44008)}
    assert eq._stop("T05thread:p01.02;rwatch:3ff4403c;")["watch"] == ("3", 0x3FF4403C)
    assert eq._stop("T05thread:p01.02;rwatch:3ff4403c;")["thread"] == 2
    assert eq._stop("T05thread:02;awatch:3ff44530;")["watch"] == ("4", 0x3FF44530)
    assert eq._stop("T02thread:01;") == {"signal": 2, "thread": 1, "watch": None}
    assert eq._stop("S05")["signal"] == 5
    assert eq._stop("W00")["exited"] == "W00"
    with pytest.raises(eq.QemuError):
        eq._stop("E01")


def test_gdb_packets_acknowledgements_and_console_output():
    ours, stub = socket.socketpair()
    seen = []

    def serve():
        buf = b""
        while True:
            try:
                data = stub.recv(4096)
            except OSError:  # the test closed the socket
                return
            if not data:
                return
            buf += data
            while b"#" in buf and len(buf) >= buf.index(b"#") + 3:
                start = buf.index(b"$")
                end = buf.index(b"#")
                packet = buf[start + 1:end].decode()
                assert f"{sum(packet.encode()) & 0xFF:02x}" == buf[end + 1:end + 3].decode()
                buf = buf[end + 3:]
                seen.append(packet)
                frame = lambda p: b"$" + p + b"#" + f"{sum(p) & 0xFF:02x}".encode()
                if packet.startswith("qRcmd,"):
                    stub.sendall(b"+" + frame(b"O" + "reset\n".encode().hex().encode()) + frame(b"OK"))
                elif packet == "m40000000,4":
                    stub.sendall(b"+" + frame(b"0*!1"))  # run-length: '0' and 4 more, then '1'
                else:
                    stub.sendall(b"+" + frame(b"OK"))

    thread = threading.Thread(target=serve, daemon=True)
    thread.start()
    gdb = eq.Gdb(ours)
    gdb.ok("Z2,3ff44000,5d0")
    assert gdb.rpc("qRcmd," + b"system_reset".hex()) == "OK" and gdb.output == "reset\n"
    assert gdb.rpc("m40000000,4") == "000001"
    assert seen == ["Z2,3ff44000,5d0", "qRcmd,73797374656d5f7265736574", "m40000000,4"]
    assert eq._unescape(b"a}\x03b") == b"a#b"
    ours.close()
    stub.close()


# ---- the pin registers ---------------------------------------------------------------------------
def test_outputs_open_drain_and_the_gpio_matrix():
    g = eq.GpioState()
    assert g.pin(2).label() == "in-pulldown" and g.pin(0).label() == "in-pullup" and g.pin(5).pull_up
    assert g.pin(1).label() == "uart-tx" and g.pin(1).driven  # U0TXD idles high from reset
    assert g.write(ENABLE_W1TS, 1 << 2) == {2}
    assert g.pin(2).label() == "out-low"
    assert g.write(W1TS, 1 << 2) == {2} and g.pin(2).level == 1 and g.write(W1TS, 1 << 2) == set()
    assert g.write(G + 0x530 + 4 * 2, 0x100 | (1 << 9)) == {2}  # GPIO output, inverted
    assert g.pin(2).label() == "out-low"
    g.write(G + 0x530 + 4 * 2, 0x100)
    g.write(G + 0x88 + 4 * 2, 1 << 2)  # open drain: high lets go
    assert not g.pin(2).driven and g.pin(2).label().startswith("od-released")
    g.write(W1TC, 1 << 2)
    assert g.pin(2).driven and g.pin(2).label() == "od-low"
    g.write(G + 0x530 + 4 * 4, 71 | (1 << 9))  # GPIO4 ← LEDC high-speed channel 0 (inverted): its output enable is always on
    assert g.pin(4).driven and g.pin(4).pwm == 0 and g.pin(4).invert and not g.pin(4).unknown and g.pin(4).function == "LEDC high-speed channel 0"
    g.write(G + 0x530 + 4 * 4, 79 + 3 | (1 << 10))  # low-speed channel 3, output enable from GPIO_ENABLE, which is off
    assert g.pin(4).pwm == 11 and not g.pin(4).driven
    g.write(G + 0x530 + 4 * 4, 29)  # I2C0 SCL: the peripheral's own output enable, not simulated
    assert g.pin(4).unknown and "I2C0" in g.pin(4).function
    g.write(G + 0x30, 1 << 1)  # ENABLE1_W1TS: GPIO33
    g.write(G + 0x14, 1 << 1)  # OUT1_W1TS
    assert g.pin(33).driven and g.pin(33).level == 1
    g.write(G + 0x30, 1 << 3)
    assert not g.pin(35).driven  # input-only pads cannot drive
    g.write(G + 0x88 + 4 * 0, (2 << 7) | (1 << 15))
    assert g.pin(0).interrupt == 2


def test_pulls_and_functions_of_digital_and_rtc_pads():
    g = eq.GpioState()
    g.write(IO_MUX[5], GPIO_FUNC | eq.FUN_IE)  # GPIO5: the IO_MUX pulls are its own; this write turns the reset pull-up off
    assert g.pin(5).input and not g.pin(5).pull_up and 5 in g.configured
    g.write(IO_MUX[5], GPIO_FUNC | eq.FUN_IE | eq.FUN_WPD)
    assert g.pin(5).pull_down
    g.write(IO_MUX[0], GPIO_FUNC | eq.FUN_IE | eq.FUN_WPU)  # GPIO0 is an RTC pad: its IO_MUX pull bits do nothing
    assert g.pin(0).pull_up  # still the reset pull-up from RTC_IO
    g.write(TOUCH_PAD1, 0)
    assert not g.pin(0).pull_up and not g.pin(0).pull_down
    g.write(TOUCH_PAD1, RDE)
    assert g.pin(0).pull_down
    g.write(TOUCH_PAD1, RDE | (1 << 19))  # RTC function (touch, ADC): the digital pad is off
    assert g.pin(0).function == "rtc" and not g.pin(0).unknown and not g.pin(0).input
    g.write(eq.RTCIO_BASE + 0x10, 1 << (14 + 11))  # RTC_GPIO_ENABLE_W1TS for RTC GPIO11 = GPIO0
    assert g.pin(0).unknown and "RTC GPIO" in g.pin(0).function
    g.write(IO_MUX[12], 0)  # function 0 of GPIO12 is MTDI (JTAG): an input
    assert g.pin(12).function == "MTDI" and not g.pin(12).driven
    g.write(IO_MUX[18], 3 << 12)  # GPIO18 function 3: a peripheral straight through the IO_MUX
    assert g.pin(18).unknown


def test_reads_give_what_the_chip_holds():
    # QEMU answers these registers with 0; ESP-IDF configures pads by read-modify-write, so loads must see the chip's values
    g = eq.GpioState()
    assert g.read(TOUCH_PAD1) == RUE and g.read(TOUCH_PAD2) == RDE  # the reset pulls of GPIO0 and GPIO2
    assert g.read(G + 0x530) == 0x100  # GPIO0's output: the GPIO data register
    g.write(TOUCH_PAD1, g.read(TOUCH_PAD1) & ~(1 << 19))  # rtc_gpio_deinit keeps the pull-up
    assert g.pin(0).pull_up
    g.write(G + 0x530, g.read(G + 0x530) & ~(1 << 11))  # ESP-IDF's output-enable control: two read-modify-writes
    g.write(G + 0x530, g.read(G + 0x530) | (1 << 10))
    assert g.read(G + 0x530) == 0x500 and g.pin(0).function == "gpio" and not g.pin(0).unknown
    g.write(IO_MUX[0], (g.read(IO_MUX[0]) & ~(7 << 12)) | (2 << 12))
    g.write(IO_MUX[0], g.read(IO_MUX[0]) | eq.FUN_IE)
    assert g.read(IO_MUX[0]) == GPIO_FUNC | eq.FUN_IE  # the reset drive strength is kept
    g.write(ENABLE_W1TS, 1 << 2)
    g.write(W1TS, 1 << 2)
    assert g.read(G + 0x20) == g.read(G + 0x04) == 1 << 2 and g.read(W1TS) == g.read(ENABLE_W1TS) == 0
    g.write(G + 0x130 + 4 * 14, 0x85)  # the input matrix is not interpreted, but reads back
    assert g.read(G + 0x130 + 4 * 14) == 0x85
    g.reset("power-on")
    assert g.read(G + 0x130 + 4 * 14) == 0 and g.read(G + 0x04) == 0


def test_the_gpio_interrupt_status_and_what_each_cpu_sees():
    g = eq.GpioState()
    g.write(G + 0x88 + 4 * 0, (2 << 7) | (1 << eq.INT_ENA_PRO))     # GPIO0: falling edge, the PRO CPU's interrupt
    g.write(G + 0x88 + 4 * 4, (3 << 7) | (1 << eq.INT_ENA_APP))     # GPIO4: any edge, the APP CPU's
    g.write(G + 0x88 + 4 * 34, (1 << 7) | (1 << eq.INT_ENA_PRO_NMI))  # GPIO34: rising edge, the PRO CPU's NMI
    assert g.interrupt_lines() == {"pro": False, "pro_nmi": False, "app": False, "app_nmi": False}
    g.latch_interrupt(0)
    g.latch_interrupt(4)
    g.latch_interrupt(34)
    assert g.read(G + 0x44) == 0b10001 and g.read(G + 0x50) == 1 << 2  # STATUS, STATUS1
    assert g.read(G + 0x68) == 1 and g.read(G + 0x60) == 1 << 4 and g.read(G + 0x80) == 1 << 2  # PCPU_INT, ACPU_INT, PCPU_NMI_INT1
    assert g.interrupt_lines() == {"pro": True, "pro_nmi": True, "app": True, "app_nmi": False}
    g.write(G + 0x4C, 1)        # STATUS_W1TC: the PRO CPU's handler clears GPIO0
    g.write(G + 0x58, 1 << 2)   # STATUS1_W1TC: GPIO34
    assert g.read(G + 0x68) == 0 and g.interrupt_lines()["pro"] is False and g.interrupt_lines()["app"] is True
    g.write(G + 0x48, 1 << 5)   # STATUS_W1TS: firmware can raise one too (GPIO5 has no enable: no CPU sees it)
    assert g.read(G + 0x44) == (1 << 4) | (1 << 5) and g.read(W1TC) == 0
    g.write(G + 0x88 + 4 * 2, (4 << 7) | (1 << eq.INT_ENA_PRO))     # GPIO2: low level
    g.level_condition(2, True)
    g.write(G + 0x4C, 1 << 2)
    assert g.read(G + 0x68) == 1 << 2  # the level still holds: it latches again at once
    g.level_condition(2, False)
    g.write(G + 0x4C, 1 << 2)
    assert g.read(G + 0x68) == 0
    g.reset("system")
    assert g.status == 0 and g.read(G + 0x60) == 0


L = LEDC_BASE
HS_TIMER0, LS_TIMER0, LEDC_INT_RAW, LEDC_INT_ENA, LEDC_INT_CLR, LEDC_CONF = L + 0x140, L + 0x160, L + 0x180, L + 0x188, L + 0x18C, L + 0x190


def ch(index, field):
    """A register of LEDC channel ``index`` (0-7 high speed, 8-15 low speed): field 0 CONF0, 4 HPOINT, 8 DUTY, 0xC CONF1, 0x10 DUTY_R."""
    return L + (0 if index < 8 else 0xA0) + 0x14 * (index % 8) + field


def conf1(num=1, cycle=1, scale=0, up=True):
    """CONF1 with DUTY_START: ``num`` steps of ``scale`` every ``cycle`` periods (the defaults: a plain duty change)."""
    return 1 << 31 | int(up) << 30 | num << 20 | cycle << 10 | scale


def test_the_ledc_timers_channels_and_fades():
    led = LedcState()
    led.write(ch(0, 0), 1 << 2, 4, 0.0)  # high-speed channel 0 on timer 0, output on
    assert led.wave(0, 0.0)[0] == "unknown" and "held in reset" in led.why_unknown(0)  # timers come out of reset held in reset
    led.write(HS_TIMER0, 13 | 256 << 5 | 1 << 25, 4, 0.0)  # 13 bits, divider 1, APB_CLK
    led.write(ch(0, 8), 2048 << 4, 4, 0.0)
    assert led.wave(0, 0.1) == ("level", 0, 0.0)  # DUTY waits for DUTY_START
    led.write(ch(0, 0xC), conf1(), 4, 0.1)
    assert led.wave(0, 0.2) == ("pwm", 0.25, 80e6 / 8192) and not led.read(ch(0, 0xC), 0.2) >> 31  # DUTY_START clears itself
    led.write(ch(0, 8), 2048 << 4 | 8, 4, 0.3)
    led.write(ch(0, 0xC), conf1(), 4, 0.3)
    assert led.wave(0, 0.4)[1] == pytest.approx(2048.5 / 8192)  # DUTY[3:0] dithers: half a count more on average
    led.write(ch(0, 4), 7000, 4, 0.5)
    led.write(ch(0, 0xC), conf1(), 4, 0.5)
    assert led.wave(0, 0.6) == ("level", 1, 0.0)  # HPOINT + DUTY beyond the counter: high for good
    led.write(ch(0, 0), 1 << 3, 4, 0.7)
    assert led.wave(0, 0.7) == ("level", 1, 0.0)  # SIG_OUT_EN off: IDLE_LV
    led.write(HS_TIMER0, 10 | 256 << 5, 4, 0.8)
    assert led.period(0) == pytest.approx(1024 / 1e6)  # REF_TICK
    # a low-speed timer and channel take their settings on PARA_UP; their SLOW_CLK is RC_FAST or APB_CLK
    led.write(LS_TIMER0, 10 | 256 << 5 | 1 << 25, 4, 1.0)
    assert led.period(4) is None
    led.write(LS_TIMER0, 10 | 256 << 5 | 1 << 25 | 1 << 26, 4, 1.0)
    assert led.period(4) == pytest.approx(1024 / 8e6) and not led.read(LS_TIMER0, 1.0) >> 26 & 1
    led.write(LEDC_CONF, 1, 4, 1.0)
    assert led.period(4) == pytest.approx(1024 / 80e6)
    led.write(ch(8, 8), 512 << 4, 4, 1.0)
    led.write(ch(8, 0xC), conf1(), 4, 1.0)
    led.write(ch(8, 0), 1 << 2, 4, 1.0)
    assert led.wave(8, 1.1) == ("level", 0, 0.0)
    led.write(ch(8, 0), 1 << 2 | 1 << 4, 4, 1.1)  # PARA_UP
    assert led.wave(8, 1.2) == ("pwm", 0.5, 80e6 / 1024) and not led.read(ch(8, 0), 1.2) >> 4 & 1
    # a fade: +1 each period at 1 kHz, 500 times; its end raises DUTY_CHNG_END
    led.write(HS_TIMER0, 10 | 20000 << 5 | 1 << 25, 4, 2.0)  # 80 MHz / 78.125 / 2**10 = 1 kHz
    led.write(ch(0, 0), 1 << 2, 4, 2.0)
    led.write(ch(0, 4), 0, 4, 2.0)
    led.write(ch(0, 8), 100 << 4, 4, 2.0)
    led.advance(2.0)
    led.write(LEDC_INT_CLR, 0xFFFFFF, 4, 2.0)
    led.write(LEDC_INT_ENA, 1 << 8, 4, 2.0)
    led.write(ch(0, 0xC), conf1(num=500, scale=1), 4, 2.0)
    assert led.read(ch(0, 0x10), 2.25) >> 4 == 350 and led.wave(0, 2.25)[1] == pytest.approx(350 / 1024)  # DUTY_R follows the fade
    assert led.next_event() == pytest.approx(2.5) and not led.interrupt()
    assert led.change_points(0, 2.0, 2.002) == [pytest.approx(2.001), pytest.approx(2.002)] and len(led.change_points(0, 2.0, 2.5)) <= 201
    assert led.advance(2.49) == set() and led.advance(2.5) == {0}
    assert led.read(LEDC_INT_RAW, 2.5) == 1 << 8 and led.interrupt() and led.read(L + 0x184, 2.5) == 1 << 8 and led.next_event() is None
    assert led.read(ch(0, 0x10), 3.0) >> 4 == 600
    led.write(LEDC_INT_CLR, 1 << 8, 4, 2.6)
    assert not led.interrupt()
    with pytest.raises(LedcUnsupported):
        led.write(LEDC_INT_ENA, 1, 4, 2.7)  # a timer-overflow interrupt: every period
    led.write(HS_TIMER0, 10 | 20000 << 5 | 1 << 25 | 1 << 23, 4, 3.0)
    assert led.wave(0, 3.1)[0] == "unknown" and "paused" in led.why_unknown(0)
    led.reset()
    assert led.wave(0, 0.0) == ("level", 0, 0.0) and led.read(L + 0x1FC, 0.0) == 0x16031700


def test_reset_scopes():
    g = eq.GpioState()
    g.write(ENABLE_W1TS, 1 << 2)
    g.write(TOUCH_PAD1, 0)
    g.reset("cpu")
    assert g.pin(2).driven  # a CPU reset leaves the peripherals as they were
    g.reset("system")
    assert not g.pin(2).driven and not g.pin(0).pull_up  # RTC_IO keeps its state through a system reset
    g.reset("power-on")
    assert g.pin(0).pull_up and not g.configured


def test_strap_value_bits():
    levels = {0: 1, 2: 0, 4: 0, 5: 0, 12: 0, 15: 1}
    assert eq.strap_value(levels) == eq.STRAP_FLASH_BOOT == 0x12
    assert eq.strap_value({**levels, 0: 0}) == 0x02 and eq.strap_value({**levels, 5: 1, 12: 1}) == 0x33


# ---- flash images ------------------------------------------------------------------------------------
def image(size_code=2, body=b"\x00" * 64):
    return bytes([eq.IMAGE_MAGIC, 1, 2, (size_code << 4)]) + body


def test_a_merged_image_is_padded_to_a_size_qemu_takes(tmp_path):
    merged = tmp_path / "flash.bin"
    merged.write_bytes(b"\xff" * 0x1000 + image(size_code=1))
    out = tmp_path / "out.bin"
    info = eq.flash_image(str(merged), str(out))
    assert info["size"] == 2 << 20 and out.stat().st_size == 2 << 20  # the header says 2 MB
    merged.write_bytes(b"\xff" * 0x1000 + image(size_code=0xF))  # no size QEMU knows: 4 MB
    assert eq.flash_image(str(merged), str(out))["size"] == 4 << 20
    data = out.read_bytes()
    assert data[0x1000] == eq.IMAGE_MAGIC and set(data[0x1000 + 68:]) == {0xFF}
    app = tmp_path / "app.bin"
    app.write_bytes(image())
    with pytest.raises(eq.QemuError, match="application or bootloader image"):
        eq.flash_image(str(app), str(out))
    blank = tmp_path / "blank.bin"
    blank.write_bytes(b"\xff" * 0x2000)
    with pytest.raises(eq.QemuError, match="no bootloader image at 0x1000"):
        eq.flash_image(str(blank), str(out))
    elf = tmp_path / "app.elf"
    elf.write_bytes(b"\x7fELF")
    with pytest.raises(eq.QemuError, match="merge_bin"):
        eq.flash_image(str(elf), str(out))


def test_an_esp_idf_build_is_merged_from_its_flash_files(tmp_path):
    (tmp_path / "bootloader").mkdir()
    (tmp_path / "partition_table").mkdir()
    (tmp_path / "bootloader" / "bootloader.bin").write_bytes(image(size_code=2))
    (tmp_path / "partition_table" / "partition-table.bin").write_bytes(b"\xaa\x50" + b"\x00" * 30)
    (tmp_path / "app.bin").write_bytes(image(body=b"\x11" * 100))
    args = tmp_path / "flasher_args.json"
    args.write_text(json.dumps({"flash_files": {"0x1000": "bootloader/bootloader.bin", "0x8000": "partition_table/partition-table.bin",
                                                "0x10000": "app.bin"}, "flash_settings": {"flash_size": "2MB"}}))
    out = tmp_path / "flash.bin"
    read = []
    info = eq.flash_image(str(args), str(out), allow=lambda p: read.append(os.path.basename(p)) or p)
    data = out.read_bytes()
    assert info["size"] == 4 << 20  # the bootloader's header says 4 MB, more than flash_settings
    assert data[0x1000] == eq.IMAGE_MAGIC and data[0x8000:0x8002] == b"\xaa\x50" and data[0x10000 + 4] == 0x11
    assert sorted(read) == ["app.bin", "bootloader.bin", "partition-table.bin"] and [p["offset"] for p in info["parts"]] == [0x1000, 0x8000, 0x10000]
    plain = tmp_path / "flash_args"
    plain.write_text("--flash_mode dio --flash_freq 40m --flash_size 8MB\n0x1000 bootloader/bootloader.bin\n0x10000 app.bin\n")
    assert eq.flash_image(str(plain), str(out))["size"] == 8 << 20
    plain.write_text("0x8000 partition_table/partition-table.bin\n")
    with pytest.raises(eq.QemuError, match="no bootloader at 0x1000"):
        eq.flash_image(str(plain), str(out))


def test_locate_skips_what_cannot_run_the_esp32(tmp_path, monkeypatch):
    stock, broken, good = (str(tmp_path / n) for n in ("stock", "broken", "good"))
    for path in (stock, broken, good):
        open(path, "w").close()
    results = {stock: (None, f"{stock} has no esp32 machine: it is QEMU without Espressif's ESP32 support", []),
               broken: (None, f"{broken} does not start: the shared libraries libslirp.so.0 are missing", ["libslirp.so.0"]),
               good: ("9.2.2 (esp_develop_9.2.2_20260417)", None, [])}
    monkeypatch.setattr(eq, "_check_binary", lambda path: results[path])
    monkeypatch.setattr(eq.shutil, "which", lambda name: stock if name == "qemu-system-xtensa" else None)
    monkeypatch.setattr(eq, "_idf_tools_dirs", lambda: [broken])
    monkeypatch.setattr(eq, "_downloaded", lambda: [good])
    monkeypatch.delenv("QEMU_XTENSA", raising=False)
    found = eq.locate()
    assert found.path == good and found.source == "downloaded" and found.missing_libraries == ["libslirp.so.0"]
    assert any("no esp32 machine" in p for p in found.problems)
    missing = eq.locate(str(tmp_path / "nowhere"))
    assert "the KiCad bridge 'qemu' setting points to" in missing.problems[0]


# ---- the board side, with a scripted chip -------------------------------------------------------------
# ESP32-WROOM-32 pins: 1 GND, 2 VDD, 3 EN, 14 IO12, 24 IO2, 25 IO0, 26 IO4
def netlist(boot_pullup=True, led=True, extra=()):
    comps = [("U1", "RF_Module:ESP32-WROOM-32", "ESP32-WROOM-32"), ("R1", "Device:R", "330"), ("D1", "Device:LED", "LED"),
             ("SW1", "Switch:SW_Push", "BOOT"), ("R2", "Device:R", "10k"), ("R3", "Device:R", "10k"), ("SW2", "Switch:SW_Push", "RESET"),
             ("C1", "Device:C", "1u")]
    nets = {
        "+3V3": [("U1", "2", "VDD"), ("R3", "1")] + ([("R2", "1")] if boot_pullup else []),
        "GND": [("U1", "1", "GND"), ("SW1", "2"), ("SW2", "2"), ("C1", "2")] + ([("D1", "1", "K")] if led else []),
        "/EN": [("U1", "3", "EN"), ("R3", "2"), ("SW2", "1"), ("C1", "1")],
        "/LED": [("U1", "24", "IO2"), ("R1", "1")],
        "/LEDA": [("R1", "2")] + ([("D1", "2", "A")] if led else []),
        "/BOOT": [("U1", "25", "IO0"), ("SW1", "1")] + ([("R2", "2")] if boot_pullup else []),
        "unconnected-(U1-IO12-Pad14)": [("U1", "14", "IO12")],
    }
    for name, nodes in extra:
        nets.setdefault(name, []).extend(nodes)
        for ref, *_ in nodes:
            if ref.startswith("R") and ref not in {c[0] for c in comps}:
                comps.append((ref, "Device:R", "10k"))
    return {"components": [{"reference": r, "lib_id": lib, "value": v, "footprint": ""} for r, lib, v in comps],
            "nets": [{"name": name, "code": i + 1, "nodes": [{"ref": n[0], "pin": n[1], **({"pin_function": n[2]} if len(n) > 2 else {})} for n in nodes]}
                     for i, (name, nodes) in enumerate(nets.items())]}


def led_on_gpio2(t=0.3):
    """The firmware's set-up of GPIO2 as a push-pull output."""
    yield ("write", t, IO_MUX[2], GPIO_FUNC)
    yield ("write", t, TOUCH_PAD2, 0)
    yield ("write", t, G + 0x530 + 8, 0x100)
    yield ("write", t, ENABLE_W1TS, 1 << 2)


def button_firmware(pull=True, period=0.005):
    """The LED on GPIO2 is on while GPIO0 reads low; GPIO0 is polled every ``period`` (off the stimuli's round times)."""
    def program(end):
        yield ("uart", 0.05, "rst:0x1 (POWERON_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)\n")
        yield ("write", 0.3, IO_MUX[0], GPIO_FUNC | eq.FUN_IE)
        yield ("write", 0.3, TOUCH_PAD1, RUE if pull else 0)
        yield from led_on_gpio2()
        yield ("uart", 0.31, "app ready\n")
        lit, k = False, 0
        while True:
            t = 0.3021 + k * period
            k += 1
            word = yield ("read", t, 0)
            pressed = not word & 1
            if pressed != lit:
                lit = pressed
                yield ("write", t, W1TS if lit else W1TC, 1 << 2)
    return program


class FakeMachine:
    """Plays a firmware script against the run the way esp32qemu.Machine does: register writes, input reads, resets, UART text."""

    program = None
    instances: list = []

    def __init__(self, qemu, image, workdir, strap=eq.STRAP_FLASH_BOOT, **kw):
        self.strap, self.image = strap, image
        self.gpio = eq.GpioState()
        self.ledc = LedcState()
        self.t = 0.0
        self.skipped = 0.0
        self.uart_seen = 0
        self.reads: list = []
        FakeMachine.instances.append(self)

    def start(self, deadline):
        assert os.path.getsize(self.image) in eq.FLASH_SIZES

    def begin_at(self, t):
        self.t = t

    def run(self, handler, end, deadline, cancel=None, progress=None):
        script = type(self).program(end)
        reply = None
        while True:
            try:
                kind, t, *rest = script.send(reply)
            except StopIteration:
                return
            reply = None
            if t >= end or handler.finished:
                self.t = max(self.t, t)
                return
            self.t = max(self.t, t)
            ended = self.ledc.advance(self.t)
            if ended:
                handler.on_ledc(self.t, ended)
            if kind in ("write", "load"):
                handler.on_tick(self.t)  # as Machine does: the stimuli due by now come first
            if kind == "write" and LEDC_BASE <= rest[0] < LEDC_BASE + 0x200:
                channels = self.ledc.write(rest[0], rest[1], 4, self.t)
                if channels:
                    handler.on_ledc(self.t, channels)
            elif kind == "write":
                changed = self.gpio.write(rest[0], rest[1])
                if changed:
                    handler.on_gpio(self.t, changed)
            elif kind == "read":
                reply = handler.gpio_in(self.t, rest[0])
                self.reads.append((self.t, reply))
            elif kind == "load":  # any other register of the watched blocks, as Machine answers it
                reply = self.ledc.read(rest[0], self.t) if LEDC_BASE <= rest[0] < LEDC_BASE + 0x200 else self.gpio.read(rest[0])
                self.reads.append((self.t, reply))
            elif kind == "uart":
                self.uart_seen += len(rest[0])
                handler.on_uart(self.t, rest[0])
            elif kind == "reset":
                self.gpio.reset(rest[1])
                handler.on_reset(self.t, rest[0], rest[1])
            release = handler.reset_request()
            if release is not None:  # the board pulled EN low and let go: the chip starts over
                self.t = release
                self.gpio.reset("power-on")
                handler.on_reset(release, "external", "power-on")
                script = type(self).program(end)
                reply = None

    def close(self):
        pass

    def unimplemented(self):
        return {}


@pytest.fixture
def fake(monkeypatch, tmp_path):
    monkeypatch.setattr(eq, "locate", lambda explicit=None: eq.Qemu(path="/fake/qemu-system-xtensa", source="test", version="test"))
    monkeypatch.setattr(eq, "probe", lambda qemu, timeout=30.0: {"clock": "rtc", "rtc_hz": 150_000.0})
    monkeypatch.setattr(eq, "Machine", FakeMachine)
    FakeMachine.instances = []
    firmware = tmp_path / "flash.bin"
    firmware.write_bytes(b"\xff" * 0x1000 + image())

    def run(program, net=None, **kw):
        FakeMachine.program = staticmethod(program)
        return esp32sim.simulate_firmware(net or netlist(), "U1", ESP32, str(firmware), kw.pop("stimuli", None), kw.pop("assertions", None), **kw)
    return run


PRESS = [{"at": "1s", "press": "SW1", "name": "press"}, {"at": "1.5s", "release": "SW1", "name": "release"}]


def verdicts(result):
    return [a["passed"] for a in result["assertions"]]


def test_the_boot_button_lights_the_led(fake):
    result = fake(button_firmware(), stimuli=PRESS, assertions=[
        {"led": "D1", "is": "off", "at": "0.9s"},
        {"led": "D1", "is": "on", "after": "press", "within": "10ms", "name": "LED within 10 ms of the press"},
        {"led": "D1", "is": "on", "from": "1.01s", "to": "1.49s"},
        {"led": "D1", "is": "off", "after": "release", "within": "10ms"},
        {"pin": "GPIO2", "level": "high", "at": "1.2s"}, {"pin": "U1:IO0", "level": "low", "at": "1.2s"},
        {"net": "BOOT", "min": 3.2, "at": "0.5s"}, {"uart": "app ready", "by": "0.5s"}, {"uart": "Guru Meditation", "is": "absent"}])
    assert verdicts(result) == [True] * 9 and result["passed"] is True, result["assertions"]
    assert result["device"] == "esp32" and result["vcc"] == 3.3 and result["simulated_to"] == pytest.approx(2.0, abs=0.01)
    assert result["pins"] == {"GPIO0": "BOOT", "GPIO2": "LED"} and result["switches"] == ["SW1", "SW2"] and result["leds"] == ["D1"]
    lit = next(e for e in result["timeline"] if e["leds"].get("D1"))
    assert 1.0 < lit["t"] <= 1.006 and lit["pins"]["GPIO2"] == "out-high" and lit["switches"] == ["SW1"]
    # GPIO5 and GPIO15 pulled up, GPIO0 high through R2: SPI flash boot, the 0x13 a real ESP32 reports
    assert result["strap"] == {"value": "0x13", "levels": {"GPIO5": 1, "GPIO15": 1, "GPIO4": 0, "GPIO2": 0, "GPIO0": 1, "GPIO12": 0}, "download_mode": False}
    assert FakeMachine.instances[0].strap == 0x13
    assert not [h for h in result["hazards"] if h["severity"] != "info"], result["hazards"]
    assert "app ready" in result["uart"]


def test_a_wrong_requirement_fails_with_the_reason(fake):
    result = fake(button_firmware(), stimuli=PRESS, assertions=[
        {"led": "D1", "is": "on", "at": "0.9s", "name": "LED on before the press (wrong)"},
        {"uart": "never printed", "by": "1s"}, {"uart": "app ready", "is": "absent", "by": "1s"}])
    assert verdicts(result) == [False, False, False] and result["passed"] is False
    assert "it was off at 900 ms" in result["assertions"][0]["reason"] and "did not have 'never printed'" in result["assertions"][1]["reason"]


def test_a_button_without_any_pull_floats_and_the_run_says_so(fake):
    result = fake(button_firmware(pull=False), net=netlist(boot_pullup=False), stimuli=PRESS,
                  assertions=[{"led": "D1", "is": "off", "at": "0.9s", "name": "LED off while released"}])
    hazard = next(h for h in result["hazards"] if h["rule"] == "floating_input")
    assert hazard["pin"] == "GPIO0" and hazard["net"] == "BOOT" and "INPUT_PULLUP" in hazard["fix"]
    assert result["passed"] is False  # a floating pin reads 0 here: the LED is on although nobody pressed


def test_strapping_pins_at_power_on(fake):
    held = fake(button_firmware(), initial={"SW1": "closed"}, duration="0.5s", assertions=[{"led": "D1", "is": "off", "at": "0.2s"}])
    assert held["strap"]["levels"]["GPIO0"] == 0 and FakeMachine.instances[-1].strap == 0x03  # the "boot:0x3 (DOWNLOAD_BOOT...)" of a real chip
    assert next(h for h in held["hazards"] if h["rule"] == "download_mode")["severity"] == "warning"
    high12 = fake(button_firmware(), net=netlist(extra=[("+3V3", [("R9", "1")]), ("unconnected-(U1-IO12-Pad14)", [("R9", "2")])]), duration="0.5s")
    error = next(h for h in high12["hazards"] if h["rule"] == "flash_voltage")
    assert error["severity"] == "error" and high12["passed"] is False and high12["strap"]["value"] == "0x33"


def test_en_holds_the_chip_in_reset_until_released(fake):
    stimuli = [{"at": "1s", "press": "SW1"}, {"at": "1.1s", "release": "SW1"}, {"at": "1.2s", "press": "SW2", "name": "reset"},
               {"at": "1.3s", "release": "SW2"}]
    result = fake(button_firmware(), stimuli=stimuli, assertions=[
        {"led": "D1", "is": "on", "at": "1.05s"}, {"led": "D1", "is": "off", "at": "1.25s", "name": "dark while EN is low"},
        {"reset": "external", "after": "reset", "within": "200ms"}, {"resets": 1, "at": "2s"}])
    assert verdicts(result) == [True, True, True, True], result["assertions"]
    assert result["resets"] == [{"t": pytest.approx(1.3), "cause": "external"}]
    held = [e for e in result["timeline"] if e.get("held")]
    assert held and held[0]["t"] == pytest.approx(1.2) and held[0]["pins"]["GPIO2"] == "in-pulldown"
    # BOOT held through the EN reset would select download mode, which QEMU only samples at power-on: cannot verify from there
    holding = fake(button_firmware(), stimuli=[{"at": "1s", "press": "SW1"}, {"at": "1.2s", "press": "SW2"}, {"at": "1.3s", "release": "SW2"}])
    assert holding["aborted"]["what"] == "strap_change" and holding["aborted"]["t"] == pytest.approx(1.3) and holding["passed"] is None


def test_a_peripheral_driving_a_board_pin_stops_the_run(fake):
    def program(end):
        yield from led_on_gpio2()
        yield ("write", 0.5, G + 0x530 + 8, 87)  # GPIO2 ← RMT channel 0
        yield ("write", 1.9, W1TS, 1 << 2)
    result = fake(program, assertions=[{"led": "D1", "is": "off", "at": "0.4s"}, {"led": "D1", "is": "on", "at": "1s"}])
    assert result["aborted"]["what"] == "peripheral_output" and result["aborted"]["t"] == pytest.approx(0.5)
    assert "RMT" in result["aborted"]["reason"] and verdicts(result) == [True, None] and result["passed"] is None


def ledc_firmware(pause_at=None):
    """GPIO2 (the LED) on LEDC high-speed channel 0, timer 0 at 1 kHz, 25 %; at 1 s a hardware fade by +1 each period, 768 times
    (to 100 %), with its end interrupt enabled."""
    def program(end):
        yield from led_on_gpio2()
        yield ("write", 0.3, HS_TIMER0, 10 | 20000 << 5 | 1 << 25)
        yield ("write", 0.3, ch(0, 8), 256 << 4)
        yield ("write", 0.3, ch(0, 0xC), conf1())
        yield ("write", 0.3, ch(0, 0), 1 << 2)
        yield ("write", 0.3, G + 0x530 + 8, 71)
        yield ("write", 1.0, LEDC_INT_CLR, 0xFFFFFF)
        yield ("write", 1.0, LEDC_INT_ENA, 1 << 8)
        yield ("write", 1.0, ch(0, 0xC), conf1(num=768, scale=1))
        yield ("load", 1.9, LEDC_INT_RAW)
        if pause_at:
            yield ("write", pause_at, HS_TIMER0, 10 | 20000 << 5 | 1 << 25 | 1 << 23)
        yield ("read", 1.95, 0)
    return program


def test_an_ledc_channel_dims_the_led(fake):
    result = fake(ledc_firmware(), duration="2s", assertions=[
        {"pin": "GPIO2", "duty": 0.25, "at": "0.5s"}, {"pin": "GPIO2", "freq": 1000, "tol_pct": 1, "at": "0.5s"},
        {"led": "D1", "min": 0.2, "max": 0.3, "at": "0.5s"}, {"led": "D1", "min": 0.45, "max": 0.55, "at": "1.25s"},
        {"pin": "GPIO2", "level": "high", "at": "1.9s"}, {"led": "D1", "is": "on", "at": "1.9s"}])
    assert verdicts(result) == [True] * 6, result["assertions"]
    assert FakeMachine.instances[0].reads[0][1] == 1 << 8  # DUTY_CHNG_END_HSCH0 after the fade
    # reported: 25 %, then the fade by its first and last step, then high for good at 100 %
    assert [e["pins"]["GPIO2"] for e in result["timeline"]][1:] == ["pwm 25% at 1000 Hz"] * 2 + ["pwm 100% at 1000 Hz", "out-high"]
    assert [e["pwm"]["GPIO2"]["duty"] for e in result["timeline"] if "GPIO2" in e["pwm"]] == [0.25, 0.251, pytest.approx(1.0, abs=0.005)]
    stopped = fake(ledc_firmware(pause_at=1.92), duration="2s")
    assert stopped["aborted"]["what"] == "ledc_stopped" and "paused" in stopped["aborted"]["reason"]


def test_a_gpio_interrupt_latches_for_the_firmware_to_find(fake):
    def program(end):
        yield ("write", 0.3, IO_MUX[0], GPIO_FUNC | eq.FUN_IE)
        yield ("write", 0.3, G + 0x88, (2 << 7) | (1 << eq.INT_ENA_PRO))  # falling edge, the PRO CPU's interrupt
        yield ("load", 0.9, G + 0x68)    # PCPU_INT before the press
        yield ("load", 1.2, G + 0x68)    # after it: the handler finds GPIO0...
        yield ("write", 1.2, G + 0x4C, 1)  # ...and clears it
        yield ("load", 1.2, G + 0x68)
        yield ("load", 1.6, G + 0x68)    # the release is a rising edge: nothing
        yield ("read", 1.9, 0)
    result = fake(program, stimuli=PRESS, assertions=[{"net": "BOOT", "level": "low", "at": "1.2s"}, {"net": "BOOT", "level": "high", "at": "1.9s"}])
    assert result["aborted"] is None and verdicts(result) == [True, True]
    assert [value for _, value in FakeMachine.instances[0].reads[:4]] == [0, 1, 0, 0]
    assert result["interrupts"] == [{"t": pytest.approx(1.0), "gpio": "GPIO0", "type": "falling edge"}] and result["interrupt_count"] == 1


def test_a_crash_stops_the_run_and_the_uart_tells(fake):
    def program(end):
        yield from led_on_gpio2()
        yield ("write", 0.4, W1TS, 1 << 2)
        yield ("uart", 0.6, "Guru Meditation Error: Core  0 panic'ed (LoadProhibited). Exception was unhandled.\n")
    result = fake(program, assertions=[{"led": "D1", "is": "on", "at": "0.5s"}, {"led": "D1", "is": "on", "at": "1s"},
                                       {"uart": "Guru Meditation", "is": "absent"}])
    assert result["aborted"]["what"] == "crash" and "LoadProhibited" in result["aborted"]["reason"]
    assert verdicts(result) == [True, None, False] and result["passed"] is False


def test_an_output_fighting_the_button_is_an_overcurrent_error(fake):
    def program(end):
        yield ("write", 0.3, IO_MUX[0], GPIO_FUNC)
        yield ("write", 0.3, G + 0x530, 0x100)
        yield ("write", 0.3, W1TS, 1 << 0)
        yield ("write", 0.3, ENABLE_W1TS, 1 << 0)
        yield ("read", 1.9, 0)
    result = fake(program, stimuli=PRESS, assertions=[{"pin": "GPIO0", "level": "high", "at": "0.5s"}])
    hazard = next(h for h in result["hazards"] if h["rule"] == "overcurrent")
    assert hazard["severity"] == "error" and hazard["pin"] == "GPIO0" and hazard["t"] == pytest.approx(1.0) and "100 mA" in hazard["message"]
    assert verdicts(result) == [True] and result["passed"] is False


def test_bad_arguments_name_the_fix(fake):
    program = button_firmware()
    with pytest.raises(SimulationError, match="ATtiny only"):
        fake(program, clock_hz=1_000_000)
    with pytest.raises(SimulationError, match="eeprom and usi assertions are for the ATtiny"):
        fake(program, assertions=[{"eeprom": 0, "is": 1, "at": "1s"}])
    with pytest.raises(SimulationError, match="give exactly one of press, release, toggle, drive"):
        fake(program, stimuli=[{"at": "1s", "temperature": 85}])
    with pytest.raises(SimulationError, match="use GPIO0-GPIO39"):
        fake(program, assertions=[{"pin": "PB4", "level": "high", "at": "1s"}])
    with pytest.raises(SimulationError, match="GPIO4 is not connected"):
        fake(program, assertions=[{"pin": "GPIO4", "level": "high", "at": "1s"}])
    with pytest.raises(SimulationError, match="between 0 and 30 s"):
        fake(program, duration="40s")
    with pytest.raises(SimulationError, match="reset must be any, power-on"):
        fake(program, assertions=[{"reset": "panic", "at": "1s"}])


@needs_kicad_cli
@needs_symbols
def test_the_tool_simulates_an_esp32_schematic_and_keeps_the_scenario(tmp_path, fake):
    tb = Toolbox(roots=[str(tmp_path)])
    path = str(tmp_path / "esp.kicad_sch")
    tb.call("create_schematic", {"path": path})
    ops = [
        {"op": "add_symbol", "lib_id": "RF_Module:ESP32-WROOM-32", "x": 127, "y": 88.9, "reference": "U1", "value": "ESP32-WROOM-32"},
        {"op": "add_symbol", "lib_id": "Switch:SW_Push", "x": 50.8, "y": 76.2, "reference": "SW1", "value": "BOOT"},
        {"op": "add_symbol", "lib_id": "Device:R", "x": 76.2, "y": 38.1, "reference": "R1", "value": "330"},
        {"op": "add_symbol", "lib_id": "Device:LED", "x": 76.2, "y": 63.5, "reference": "D1", "value": "LED"},
        {"op": "add_symbol", "lib_id": "Device:R", "x": 152.4, "y": 63.5, "reference": "R2", "value": "10k"},
        {"op": "add_symbol", "lib_id": "Device:R", "x": 38.1, "y": 50.8, "reference": "R3", "value": "10k"},
        {"op": "connect_pin_to_net", "pin": "U1:2", "net": "+3V3", "kind": "power"},
        {"op": "connect_pin_to_net", "pin": "U1:1", "net": "GND", "kind": "power"},
        {"op": "connect_pin_to_net", "pin": "R2:1", "net": "+3V3", "kind": "power"},
        {"op": "connect_pin_to_net", "pin": "R2:2", "net": "EN", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "U1:3", "net": "EN", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "R3:1", "net": "+3V3", "kind": "power"},
        {"op": "connect_pin_to_net", "pin": "R3:2", "net": "BOOT", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "SW1:1", "net": "BOOT", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "SW1:2", "net": "GND", "kind": "power"},
        {"op": "connect_pin_to_net", "pin": "U1:25", "net": "BOOT", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "U1:24", "net": "LED", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "R1:1", "net": "LED", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "R1:2", "net": "LEDA", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "D1:2", "net": "LEDA", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "D1:1", "net": "GND", "kind": "power"},
    ]
    tb.call("edit_schematic", {"path": path, "operations": ops})
    FakeMachine.program = staticmethod(button_firmware())
    asserts = [{"led": "D1", "is": "off", "at": "0.9s"}, {"led": "D1", "is": "on", "after": "press", "within": "10ms"}]
    result = tb.call("simulate_firmware", {"path": path, "firmware": str(tmp_path / "flash.bin"), "stimuli": PRESS, "assertions": asserts,
                                           "save_scenario": True})
    assert result["passed"] is True and result["device"] == "esp32" and result["pins"] == {"GPIO0": "BOOT", "GPIO2": "LED"}, result
    saved = json.loads((tmp_path / "esp.fw.json").read_text())
    assert saved["firmware"] == "flash.bin" and saved["assertions"] == asserts
    again = tb.call("simulate_firmware", {"path": path})
    assert again["passed"] is True and again["scenario"]["loaded"] == ["assertions", "firmware", "stimuli"]


def test_without_qemu_the_error_says_how_to_get_it(fake, monkeypatch):
    monkeypatch.setattr(eq, "locate", lambda explicit=None: eq.Qemu(problems=["/usr/bin/qemu-system-xtensa has no esp32 machine"]))
    with pytest.raises(SimulationError, match="/kicad-install qemu-esp32") as info:
        fake(button_firmware())
    assert "no esp32 machine" in str(info.value)


# ---- with QEMU: the test programs ---------------------------------------------------------------------------
QEMU = eq.locate()
needs_qemu = pytest.mark.skipif(not QEMU.ok, reason="Espressif's QEMU (qemu-system-xtensa with the esp32 machine) is not installed")


def program(name):
    path = os.path.join(FIX, name + ".bin")
    if not os.path.exists(path):
        pytest.fail(f"{path} is missing: build it with tests/fixtures/esp32/src/build.sh")
    return path


def qemu_run(name, **kw):
    return esp32sim.simulate_firmware(kw.pop("net", None) or netlist(), "U1", ESP32, program(name), kw.pop("stimuli", None), kw.pop("assertions", None),
                                      timeout=kw.pop("timeout", 120), **kw)


@needs_qemu
def test_qemu_gives_a_clock():
    found = eq.probe(QEMU.path)
    assert found["clock"] in ("rtc", "ccount")
    if found["clock"] == "rtc":
        assert 100_000 < found["rtc_hz"] < 200_000


@needs_qemu
def test_blink_on_qemu():
    result = qemu_run("blink", duration="1.6s", assertions=[{"led": "D1", "is": "on", "after": "0s", "within": "400ms"}])
    assert result["passed"] is True, (result["assertions"], result["hazards"], result["aborted"])
    edges = [e["t"] for e in result["timeline"] if e["pins"]["GPIO2"] in ("out-high", "out-low")]
    periods = [b - a for a, b in zip(edges, edges[1:])]
    assert len(periods) >= 4 and all(p == pytest.approx(0.25, rel=0.02) for p in periods[1:]), edges


@needs_qemu
def test_button_on_qemu():
    # the program sets GPIO0 up by read-modify-writes, as ESP-IDF does, and relies on GPIO0's pull-up from reset: the button
    # works without the board's pull-up too, because every load of the pin registers gets what the chip holds, not QEMU's 0
    for pullup in (True, False):
        result = qemu_run("button", net=netlist(boot_pullup=pullup), stimuli=PRESS, assertions=[
            {"led": "D1", "is": "off", "at": "0.9s"}, {"led": "D1", "is": "on", "after": "press", "within": "20ms"},
            {"led": "D1", "is": "off", "after": "release", "within": "20ms"}])
        assert verdicts(result) == [True, True, True], (pullup, result["assertions"], result["aborted"])
        assert not [h for h in result["hazards"] if h["rule"] == "floating_input"], result["hazards"]


@needs_qemu
def test_download_mode_on_qemu():
    result = qemu_run("blink", initial={"SW1": "closed"}, duration="0.5s", assertions=[{"led": "D1", "is": "off", "from": "0s", "to": "0.5s"}])
    assert result["strap"]["download_mode"] and verdicts(result) == [True]


@needs_qemu
def test_uart_on_qemu():
    hello = qemu_run("hello", duration="0.5s", assertions=[{"uart": "hello from the test firmware", "by": "0.5s"}, {"led": "D1", "is": "on", "at": "0.5s"}])
    assert verdicts(hello) == [True, True], hello["assertions"]


@needs_qemu
def test_gpio_interrupt_on_qemu():
    # each falling edge on GPIO0 raises the GPIO interrupt through QEMU's interrupt matrix; the program's own handler counts it
    # while main() sleeps in WAITI, and the LED shows the count: on after the first press, off after the second; releases do nothing
    presses = [{"at": "1s", "press": "SW1", "name": "first"}, {"at": "1.5s", "release": "SW1"},
               {"at": "2s", "press": "SW1", "name": "second"}, {"at": "2.5s", "release": "SW1"}]
    assertions = [{"led": "D1", "is": "off", "from": "0.5s", "to": "0.99s"}, {"led": "D1", "is": "on", "after": "first", "within": "5ms"},
                  {"led": "D1", "is": "on", "from": "1.1s", "to": "1.99s"}, {"led": "D1", "is": "off", "after": "second", "within": "5ms"},
                  {"led": "D1", "is": "off", "from": "2.1s", "to": "2.4s"}]
    # GPIO35 pulled high: a watchdog stays armed far away, so idle time runs (the clock is read after QEMU counted the sleep)
    timed = qemu_run("interrupt", net=netlist(extra=[("/TIMED", [("U1", "7", "IO35"), ("R9", "2")]), ("+3V3", [("R9", "1")])]),
                     stimuli=presses, duration="3s", assertions=assertions + [{"led": "D1", "is": "off", "from": "2.5s", "to": "3s"}])
    assert verdicts(timed) == [True] * 6, (timed["assertions"], timed["aborted"])
    assert [(round(i["t"], 3), i["gpio"]) for i in timed["interrupts"]] == [(1.0, "GPIO0"), (2.0, "GPIO0")]
    assert not any("stood still" in n for n in timed["notes"])
    # nothing timed: QEMU's clock stands still while the CPU sleeps, so the time until each stimulus passes for the board; after
    # the last one nothing can wake the chip, which ends the run as a stall
    untimed = qemu_run("interrupt", stimuli=presses, duration="3s", assertions=assertions)
    assert verdicts(untimed) == [True] * 5, (untimed["assertions"], untimed["aborted"])
    assert untimed["aborted"]["what"] == "stall" and untimed["aborted"]["t"] == pytest.approx(2.5, abs=0.01)
    assert any("stood still" in n for n in untimed["notes"])


@needs_qemu
def test_ledc_pwm_and_its_fade_on_qemu():
    # the program dims the LED with a low-speed LEDC channel (25 % at 1 kHz) at about 0.17 s, 300 ms later fades it to 100 % in
    # 768 ms (+1 each period), and turns it off when the fade's end interrupt arrives
    result = qemu_run("pwm", duration="2s", assertions=[
        {"pin": "GPIO2", "duty": 0.25, "tol": 0.01, "at": "0.4s"}, {"pin": "GPIO2", "freq": 1000, "tol_pct": 1, "at": "0.4s"},
        {"led": "D1", "min": 0.2, "max": 0.3, "at": "0.4s"}, {"led": "D1", "min": 0.6, "max": 0.66, "at": "0.86s"},
        {"led": "D1", "min": 0.93, "max": 0.99, "at": "1.2s"}, {"led": "D1", "is": "off", "from": "1.3s", "to": "2s"}])
    assert verdicts(result) == [True] * 6, (result["assertions"], result["aborted"])
    # the reported timeline shows a fade by its first and last step
    pwm = [(e["t"], e["pwm"]["GPIO2"]["duty"]) for e in result["timeline"] if "GPIO2" in e["pwm"]]
    assert [d for _, d in pwm] == [0.25, 0.251, pytest.approx(1.0, abs=0.005)], pwm
    assert pwm[1][0] - pwm[0][0] == pytest.approx(0.301, abs=0.005) and pwm[2][0] - pwm[1][0] == pytest.approx(0.766, abs=0.002)
    off = next(e["t"] for e in result["timeline"] if e["t"] > pwm[2][0] and e["pins"]["GPIO2"] == "out-low")
    assert off - pwm[2][0] == pytest.approx(0.001, abs=0.003)  # the end interrupt (one period after the last step) turns it off


@needs_qemu
def test_watchdog_resets_on_qemu():
    # the program lights the LED, arms a 100 ms watchdog, never feeds it and sleeps (it runs about 170 ms after power-on in QEMU,
    # 300 ms after a watchdog reset): idle time, which QEMU passes in real time, ends at the reset as precisely as busy time does
    result = qemu_run("wdt", duration="1s", assertions=[{"reset": "watchdog", "after": "0s", "within": "500ms"}, {"resets": 2, "at": "1s"}])
    assert verdicts(result) == [True, True], (result["assertions"], result["resets"])
    armed = [e["t"] for e in result["timeline"] if e["pins"]["GPIO2"] == "out-high"]
    resets = [r["t"] for r in result["resets"]]
    assert len(resets) == 2 and all(r - a == pytest.approx(0.100, abs=0.002) for a, r in zip(armed, resets)), (armed, resets)
    assert "rst:0x7 (TG0WDT_SYS_RESET)" in result["uart"]  # the ROM's banner of the restart
