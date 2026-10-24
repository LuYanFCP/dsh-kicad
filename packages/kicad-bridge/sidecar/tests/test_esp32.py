"""ESP32 firmware simulation. The QEMU side (esp32qemu: gdb packets, Xtensa loads and stores, the pin registers, flash images) is
tested on its own; the board side (esp32sim) is driven by a scripted machine, so scenarios, assertions and hazards are tested
without QEMU; with Espressif's QEMU installed, the test programs in tests/fixtures/esp32 run for real."""
import json
import os
import socket
import threading

import pytest

from dsh_kicad_sidecar import esp32qemu as eq
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
    g.write(G + 0x530 + 4 * 4, 71)  # GPIO4 ← LEDC high-speed channel 0, its own output enable
    assert g.pin(4).unknown and "LEDC" in g.pin(4).function
    g.write(G + 0x530 + 4 * 4, 71 | (1 << 10))  # output enable from GPIO_ENABLE, which is off
    assert not g.pin(4).unknown and not g.pin(4).driven
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
        self.t = 0.0
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
            if kind == "write":
                changed = self.gpio.write(rest[0], rest[1])
                if changed:
                    handler.on_gpio(self.t, changed)
            elif kind == "read":
                reply = handler.gpio_in(self.t, rest[0])
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
        yield ("write", 0.5, G + 0x530 + 8, 71)  # GPIO2 ← LEDC
        yield ("write", 1.9, W1TS, 1 << 2)
    result = fake(program, assertions=[{"led": "D1", "is": "off", "at": "0.4s"}, {"led": "D1", "is": "on", "at": "1s"}])
    assert result["aborted"]["what"] == "peripheral_output" and result["aborted"]["t"] == pytest.approx(0.5)
    assert "LEDC" in result["aborted"]["reason"] and verdicts(result) == [True, None] and result["passed"] is None


def test_a_gpio_interrupt_that_would_fire_stops_the_run(fake):
    def program(end):
        yield ("write", 0.3, IO_MUX[0], GPIO_FUNC | eq.FUN_IE)
        yield ("write", 0.3, G + 0x88, (2 << 7) | (1 << 15))  # falling edge, PRO CPU
        yield ("read", 1.9, 0)
    result = fake(program, stimuli=PRESS, assertions=[{"net": "BOOT", "level": "high", "at": "0.5s"}, {"net": "BOOT", "level": "low", "at": "1.2s"}])
    assert result["aborted"]["what"] == "gpio_interrupt" and result["aborted"]["t"] == pytest.approx(1.0)
    assert "falling edge" in result["aborted"]["reason"] and verdicts(result) == [True, None]


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
    with pytest.raises(SimulationError, match="LEDC is not simulated"):
        fake(program, assertions=[{"pin": "GPIO2", "duty": 0.5, "at": "1s"}])
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
def test_uart_and_interrupt_on_qemu():
    hello = qemu_run("hello", duration="0.5s", assertions=[{"uart": "hello from the test firmware", "by": "0.5s"}, {"led": "D1", "is": "on", "at": "0.5s"}])
    assert verdicts(hello) == [True, True], hello["assertions"]
    armed = qemu_run("interrupt", stimuli=PRESS)
    assert armed["aborted"]["what"] == "gpio_interrupt" and armed["aborted"]["t"] == pytest.approx(1.0)


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
