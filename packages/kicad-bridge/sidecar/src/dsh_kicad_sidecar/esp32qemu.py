"""ESP32 firmware on Espressif's QEMU, watched through QEMU's gdb stub.

Espressif's QEMU fork (``qemu-system-xtensa -machine esp32``) runs the ESP32 ROM, the second-stage bootloader, the
application and FreeRTOS from a flash image. Its GPIO peripheral is a stub, though: writes vanish and reads return 0, and
IO_MUX and RTC_IO are not modelled at all. So the sidecar watches the chip from outside, through QEMU's gdb stub:

- access watchpoints on the GPIO, IO_MUX and RTC_IO register blocks stop the CPU before every load and store there, and
  the access is done here instead (the CPU goes on after it). A store is decoded (base register + offset, value register)
  and :class:`GpioState` mirrors the registers: output levels and enables, open drain, pulls, input enables, the GPIO
  matrix, interrupt setup. A load gets the mirrored value, so the read-modify-writes ESP-IDF configures pads with start
  from what the chip would hold, not from QEMU's 0; a load of GPIO_IN/GPIO_IN1 gets the levels the board gives the pins;
- the LED PWM controller (LEDC) is watched and kept the same way (esp32ledc.py): a pad routed to a channel is a PWM wave;
- so is the SENS block of the SAR ADCs (esp32adc.py): a one-shot conversion reads the board's voltage on the channel's pad;
- the GPIO peripheral's interrupt is kept here too (QEMU's stub has no interrupt output): edges and levels the board
  gives the pins latch GPIO_STATUS, and the interrupt matrix's GPIO sources are driven through QEMU's qtest socket
  (``set_irq_in``), so the CPU takes the interrupt the firmware mapped, as the chip would;
- a breakpoint on the reset vector catches every reset (and the second core starting), one on the image's entry point
  turns the watchpoints on once the ROM hands over (the ROM's own pin set-up is not the firmware's);
- time is QEMU's virtual clock: QEMU runs with ``-icount`` (every instruction advances it by the same amount), so busy code
  takes the same simulated time on any host; idle time (WAITI) passes in real time (``sleep=on``: with ``sleep=off`` QEMU
  also jumps the clock to its next timer while a reset is pending, which breaks the chip's restart). It is read from the
  RTC timer, or, when this QEMU does not emulate that, from the stopped CPU's cycle counter (the CPU executes one
  ``rsr.ccount`` from the ROM: QEMU only updates CCOUNT when the guest reads it). :func:`probe` finds out which, once per
  QEMU binary. QEMU counts the time the CPUs sleep only when they wake or the machine resumes, so an interruption that
  finds them asleep lets the machine run a moment before reading the clock; with no timer pending the clock stands still
  in WAITI, and the time until the next stimulus passes for the board only.

Nothing here knows the board: :class:`Machine` reports register changes and asks for input levels through a handler.
The module imports nothing from the sidecar, so ``python esp32qemu.py download`` fetches QEMU as a plain script (the
doctor's install step, like freerouting.py).
"""

from __future__ import annotations

import codecs
import glob
import hashlib
import json
import os
import platform
import re
import shutil
import socket
import subprocess
import sys
import tarfile
import tempfile
import threading
import time
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable

try:
    from .esp32adc import SENS_BASE, SENS_SIZE, AdcState, AdcUnsupported
    from .esp32ledc import LEDC_BASE, LEDC_INT_SOURCE, LEDC_SIZE, SIGNALS as LEDC_SIGNALS, LedcState, LedcUnsupported, channel_name
except ImportError:  # run as a script (python -I esp32qemu.py download: -I leaves this directory off sys.path)
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from esp32adc import SENS_BASE, SENS_SIZE, AdcState, AdcUnsupported  # type: ignore[no-redef]
    from esp32ledc import LEDC_BASE, LEDC_INT_SOURCE, LEDC_SIZE, SIGNALS as LEDC_SIGNALS, LedcState, LedcUnsupported, channel_name  # type: ignore[no-redef]

__all__ = ["QemuError", "Unsupported", "Cancelled", "TimedOut", "Qemu", "locate", "probe", "data_dir", "RELEASE", "download",
           "download_command", "flash_image", "GpioState", "Pin", "Handler", "Machine", "MemInsn", "decode_mem", "strap_value",
           "STRAP_PINS", "RESET_PULLS"]


class QemuError(RuntimeError):
    """QEMU cannot run this firmware: missing or broken, a bad flash image, an answer the simulator does not understand."""


class Unsupported(QemuError):
    """The firmware does something the simulator does not model: the run stops there and nothing after it is judged."""

    def __init__(self, what: str, detail: str, t: float | None = None):
        super().__init__(detail)
        self.what, self.detail, self.t = what, detail, t


class Cancelled(QemuError):
    pass


class TimedOut(QemuError):
    """The run used up its wall-clock time."""


# ---- where QEMU comes from --------------------------------------------------------------------
# The release /kicad-install qemu-esp32 downloads (https://github.com/espressif/qemu/releases), one archive per platform with
# its size and SHA-256 from the release's checksum file. The archive unpacks into qemu/bin/qemu-system-xtensa.
RELEASE: dict[str, Any] = {
    "version": "esp_develop_9.2.2_20260417",
    "tag": "esp-develop-9.2.2-20260417",
    "assets": {
        ("linux", "x86_64"): ("qemu-xtensa-softmmu-esp_develop_9.2.2_20260417-x86_64-linux-gnu.tar.xz", 15619396,
                              "0eecb2a34a5586c0e59110f77b9343b7b336e82fdb0e1a30e1dc1bab8a547e35"),
        ("linux", "aarch64"): ("qemu-xtensa-softmmu-esp_develop_9.2.2_20260417-aarch64-linux-gnu.tar.xz", 15111492,
                               "00de5985094c14e47d1b38464a006b8ed64fd0fa7a289c56da24f3a329f65339"),
        ("darwin", "x86_64"): ("qemu-xtensa-softmmu-esp_develop_9.2.2_20260417-x86_64-apple-darwin.tar.xz", 3870980,
                               "ae8170fe46bcdfa54a7c0d7afcdb7a066711991be680f72ff7bbc6c4ae3ad88f"),
        ("darwin", "aarch64"): ("qemu-xtensa-softmmu-esp_develop_9.2.2_20260417-aarch64-apple-darwin.tar.xz", 3867936,
                                "bb8c15810565d3df1665dc34962430885e11bc95575b228fb44698146be1e9d6"),
        ("win32", "x86_64"): ("qemu-xtensa-softmmu-esp_develop_9.2.2_20260417-x86_64-w64-mingw32.tar.xz", 35996720,
                              "3c483d77f5350a568df1faf4d8dbc82c95d6bc2b826d0d4be910485e0a68ca2a"),
    },
}
HOMEPAGE = "https://github.com/espressif/qemu"
DOCS_URL = "https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-guides/tools/qemu.html"
EXE = "qemu-system-xtensa.exe" if sys.platform == "win32" else "qemu-system-xtensa"


def data_dir() -> str:
    """Per-user directory for the downloaded QEMU (no root needed)."""
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or os.path.join(os.path.expanduser("~"), "AppData", "Local")
    elif sys.platform == "darwin":
        base = os.path.join(os.path.expanduser("~"), "Library", "Application Support")
    else:
        base = os.environ.get("XDG_DATA_HOME") or os.path.join(os.path.expanduser("~"), ".local", "share")
    return os.path.join(base, "dsh-kicad", "qemu-esp32")


def host_platform() -> tuple[str, str]:
    system = "linux" if sys.platform.startswith("linux") else sys.platform
    arch = platform.machine().lower()
    arch = {"amd64": "x86_64", "x64": "x86_64", "arm64": "aarch64"}.get(arch, arch)
    return system, arch


def release_asset() -> tuple[str, int, str] | None:
    """``(file name, size, sha256)`` of the release archive for this machine, or None when Espressif publishes none."""
    return RELEASE["assets"].get(host_platform())


def release_url(asset: str) -> str:
    return f"{HOMEPAGE}/releases/download/{RELEASE['tag']}/{asset}"


@dataclass
class Qemu:
    """A QEMU that can run the ESP32 machine (``path`` None when there is none; ``problems`` says what was found instead)."""

    path: str | None = None
    source: str | None = None
    version: str | None = None
    problems: list[str] = field(default_factory=list)
    missing_libraries: list[str] = field(default_factory=list)
    tried: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.path is not None


_CHECKS: dict[tuple[str, float], tuple[str | None, str | None, list[str]]] = {}


def _check_binary(path: str) -> tuple[str | None, str | None, list[str]]:
    """``(version, problem, missing libraries)``: problem is None when the binary runs and has the esp32 machine."""
    try:
        key = (path, os.path.getmtime(path))
    except OSError:
        return None, f"{path} does not exist", []
    if key in _CHECKS:
        return _CHECKS[key]
    try:
        proc = subprocess.run([path, "-machine", "help"], capture_output=True, text=True, timeout=30, stdin=subprocess.DEVNULL)
        text = proc.stdout + proc.stderr
    except (OSError, subprocess.TimeoutExpired) as exc:
        result: tuple[str | None, str | None, list[str]] = (None, f"{path} does not start ({exc})", [])
        _CHECKS[key] = result
        return result
    missing = sorted(set(re.findall(r"loading shared libraries: ([^:\s]+)", text)))
    if missing:
        result = (None, f"{path} does not start: the shared libraries {', '.join(missing)} are missing", missing)
    elif proc.returncode != 0:
        result = (None, f"{path} does not start (`-machine help` exited with {proc.returncode}: {text.strip()[:200]})", [])
    elif not re.search(r"^esp32\s", proc.stdout, re.M):
        result = (None, f"{path} has no esp32 machine: it is QEMU without Espressif's ESP32 support (the ESP32 needs Espressif's fork)", [])
    else:
        version = None
        try:
            ver = subprocess.run([path, "--version"], capture_output=True, text=True, timeout=30, stdin=subprocess.DEVNULL).stdout
            m = re.search(r"version\s+(\S+(?:\s+\([^)]*\))?)", ver)
            version = m.group(1) if m else ver.strip().splitlines()[0] if ver.strip() else None
        except (OSError, subprocess.TimeoutExpired):
            pass
        result = (version, None, [])
    _CHECKS[key] = result
    return result


def _idf_tools_dirs() -> list[str]:
    roots = [os.environ.get("IDF_TOOLS_PATH") or "", os.path.join(os.path.expanduser("~"), ".espressif")]
    found = []
    for root in dict.fromkeys(r for r in roots if r):
        found += glob.glob(os.path.join(root, "tools", "qemu-xtensa", "*", "qemu", "bin", EXE))
    return sorted(found, reverse=True)  # the newest version folder first


def _downloaded() -> list[str]:
    return sorted(glob.glob(os.path.join(data_dir(), "*", "qemu", "bin", EXE)), reverse=True)


def locate(explicit: str | None = None) -> Qemu:
    """Find a QEMU with the ESP32 machine: the KiCad bridge 'qemu' setting, ``$QEMU_XTENSA``, ``qemu-system-xtensa`` on PATH, the
    one ESP-IDF installs (``idf_tools.py install qemu-xtensa`` → ~/.espressif/tools/qemu-xtensa), then the one
    ``/kicad-install qemu-esp32`` downloaded. A candidate that does not run or lacks the esp32 machine is skipped with the reason."""
    result = Qemu()
    candidates: list[tuple[str, str]] = []
    for value, source in ((explicit, "setting"), (os.environ.get("QEMU_XTENSA"), "QEMU_XTENSA")):
        if not value:
            continue
        path = os.path.expanduser(value)
        if os.path.isfile(path):
            candidates.append((path, source))
        elif shutil.which(value):
            candidates.append((shutil.which(value) or value, source))
        else:
            where = "the KiCad bridge 'qemu' setting" if source == "setting" else "$QEMU_XTENSA"
            result.problems.append(f"{where} points to {value}, which does not exist")
    on_path = shutil.which("qemu-system-xtensa")
    if on_path:
        candidates.append((on_path, "PATH"))
    candidates += [(p, "ESP-IDF tools") for p in _idf_tools_dirs()]
    candidates += [(p, "downloaded") for p in _downloaded()]
    seen = set()
    for path, source in candidates:
        real = os.path.realpath(path)
        if real in seen:
            continue
        seen.add(real)
        result.tried.append(path)
        version, problem, missing = _check_binary(path)
        if problem is None:
            result.path, result.source, result.version = path, source, version
            return result
        result.problems.append(problem)
        result.missing_libraries += [m for m in missing if m not in result.missing_libraries]
    return result


# ---- downloading -------------------------------------------------------------------------------
def download(folder: str | None = None, out=sys.stdout) -> str:
    """Fetch the pinned release for this machine into ``folder`` (default :func:`data_dir`), check its size and SHA-256, and only
    then unpack it. Returns the path of qemu-system-xtensa."""
    asset = release_asset()
    if asset is None:
        raise QemuError(f"Espressif publishes no QEMU build for {'/'.join(host_platform())}; build it from source ({DOCS_URL})")
    name, size, sha256 = asset
    folder = folder or data_dir()
    target = os.path.join(folder, RELEASE["version"])
    exe = os.path.join(target, "qemu", "bin", EXE)
    if os.path.isfile(exe):
        print(f"QEMU {RELEASE['version']} is already in {target}", file=out)
        return exe
    os.makedirs(folder, exist_ok=True)
    part = os.path.join(folder, name + ".part")
    digest = hashlib.sha256()
    got, shown = 0, -1
    url = release_url(name)
    print(f"Downloading {url} ({size / 1e6:.1f} MB)", file=out, flush=True)
    request = urllib.request.Request(url, headers={"User-Agent": "dsh-kicad"})
    try:
        with urllib.request.urlopen(request, timeout=60) as response, open(part, "wb") as fh:
            while chunk := response.read(1 << 16):
                fh.write(chunk)
                digest.update(chunk)
                got += len(chunk)
                percent = got * 100 // max(1, size)
                if percent // 10 != shown:
                    shown = percent // 10
                    print(f"{min(percent, 100)}% ({got / 1e6:.1f} MB)", file=out, flush=True)
        if got != size or digest.hexdigest() != sha256:
            raise QemuError(f"the download does not match the published checksum (got {got} bytes, sha256 {digest.hexdigest()}); nothing was installed")
        staging = tempfile.mkdtemp(prefix=".unpack-", dir=folder)
        try:
            with tarfile.open(part, "r:xz") as archive:
                _safe_extract(archive, staging)
            if not os.path.isfile(os.path.join(staging, "qemu", "bin", EXE)):
                raise QemuError(f"the archive has no qemu/bin/{EXE}; nothing was installed")
            if os.path.isdir(target):
                shutil.rmtree(target)
            os.replace(staging, target)
        finally:
            if os.path.isdir(staging):
                shutil.rmtree(staging, ignore_errors=True)
    finally:
        if os.path.exists(part):
            os.unlink(part)
    print(f"QEMU {RELEASE['version']} installed: {exe} (sha256 verified)", file=out)
    return exe


def _safe_extract(archive: tarfile.TarFile, dest: str) -> None:
    if hasattr(tarfile, "data_filter"):
        archive.extractall(dest, filter="data")
        return
    root = os.path.realpath(dest)
    for member in archive.getmembers():
        path = os.path.realpath(os.path.join(dest, member.name))
        if not (path == root or path.startswith(root + os.sep)) or member.isdev():
            raise QemuError(f"refusing to unpack {member.name}")
        if (member.issym() or member.islnk()) and not os.path.realpath(os.path.join(os.path.dirname(path), member.linkname)).startswith(root + os.sep):
            raise QemuError(f"refusing to unpack the link {member.name}")
    archive.extractall(dest)


def download_command(folder: str | None = None) -> list[str]:
    """The install step the doctor offers: this file run as a script by the sidecar's own Python (``-I``: nothing from the
    working directory or the user's site-packages is imported)."""
    return [sys.executable, "-I", os.path.abspath(__file__), "download", "--dir", folder or data_dir()]


# ---- the flash image ---------------------------------------------------------------------------
FLASH_SIZES = (2 << 20, 4 << 20, 8 << 20, 16 << 20)  # the sizes QEMU's ESP32 flash accepts
HEADER_SIZES = {0: 1 << 20, 1: 2 << 20, 2: 4 << 20, 3: 8 << 20, 4: 16 << 20}  # flash size code in byte 3 of the image header
BOOTLOADER_OFFSET = 0x1000
IMAGE_MAGIC = 0xE9
MERGE_HINT = ("QEMU boots the whole flash: the bootloader at 0x1000, the partition table at 0x8000 and the application at 0x10000. "
              "Give the merged image (ESP-IDF: `esptool.py --chip esp32 merge_bin -o flash.bin @flash_args` in the build folder; "
              "Arduino: the sketch's .merged.bin) or the build's flasher_args.json")


def _parse_size(text: str | None) -> int | None:
    m = re.fullmatch(r"\s*(\d+)\s*MB\s*", text or "", re.I)
    return int(m.group(1)) << 20 if m else None


def _flash_files(path: str) -> tuple[list[tuple[int, str]], int | None]:
    """``([(offset, file)], declared size)`` from an ESP-IDF flasher_args.json or flash_args file."""
    folder = os.path.dirname(path)
    if path.endswith(".json"):
        try:
            with open(path, encoding="utf-8") as fh:
                data = json.load(fh)
            files = data["flash_files"]
        except (OSError, ValueError, KeyError, TypeError) as exc:
            raise QemuError(f"{path} is not an ESP-IDF flasher_args.json ({exc})") from exc
        size = _parse_size((data.get("flash_settings") or {}).get("flash_size"))
        return [(int(str(k), 0), os.path.join(folder, v)) for k, v in files.items()], size
    entries: list[tuple[int, str]] = []
    size = None
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            words = line.split()
            if not words:
                continue
            if words[0].startswith("--"):
                if "--flash_size" in words:
                    size = _parse_size(words[words.index("--flash_size") + 1]) if words.index("--flash_size") + 1 < len(words) else None
                continue
            if len(words) == 2 and re.fullmatch(r"0x[0-9a-fA-F]+", words[0]):
                entries.append((int(words[0], 16), os.path.join(folder, words[1])))
            else:
                raise QemuError(f"{path}: cannot read the line {line.strip()!r} (expected `0x1000 bootloader/bootloader.bin`)")
    return entries, size


def flash_image(path: str, out_path: str, allow: Callable[[str], str] | None = None) -> dict[str, Any]:
    """Write the image QEMU boots from to ``out_path``: a merged flash image padded with 0xFF to a size QEMU accepts, or the
    files of an ESP-IDF build (flasher_args.json / flash_args) placed at their offsets. ``allow`` vets every file read (the
    sidecar's roots). Returns ``{"size", "parts"}``."""
    allow = allow or (lambda p: p)
    lower = path.lower()
    if lower.endswith((".elf", ".hex")):
        raise QemuError(f"{os.path.basename(path)} is not a flash image. {MERGE_HINT}")
    if lower.endswith(".json") or os.path.basename(lower) == "flash_args":
        entries, declared = _flash_files(path)
        if not any(off == BOOTLOADER_OFFSET for off, _ in entries):
            raise QemuError(f"{path} lists no bootloader at 0x1000. {MERGE_HINT}")
        blobs = []
        for off, file in sorted(entries):
            with open(allow(file), "rb") as fh:
                blobs.append((off, fh.read(), file))
        end = max(off + len(data) for off, data, _ in blobs)
        for (a, da, fa), (b, _, fb) in zip(blobs, blobs[1:]):
            if a + len(da) > b:
                raise QemuError(f"{os.path.basename(fa)} at {a:#x} overlaps {os.path.basename(fb)} at {b:#x}")
        image = bytearray(b"\xff" * end)
        for off, data, _ in blobs:
            image[off:off + len(data)] = data
        parts = [{"offset": off, "file": file, "size": len(data)} for off, data, file in blobs]
    else:
        with open(allow(path), "rb") as fh:
            image = bytearray(fh.read())
        declared = None
        if image[:1] == bytes([IMAGE_MAGIC]):
            raise QemuError(f"{os.path.basename(path)} is an application or bootloader image (it starts with the 0xE9 image header), "
                            f"not the whole flash. {MERGE_HINT}")
        if len(image) <= BOOTLOADER_OFFSET or image[BOOTLOADER_OFFSET] != IMAGE_MAGIC:
            raise QemuError(f"{os.path.basename(path)} has no bootloader image at 0x1000 (the byte there must be 0xE9). {MERGE_HINT}")
        parts = [{"offset": 0, "file": path, "size": len(image)}]
    if len(image) > FLASH_SIZES[-1]:
        raise QemuError(f"the flash image is {len(image)} bytes; QEMU's ESP32 flash holds at most 16 MB")
    if len(image) > BOOTLOADER_OFFSET + 3 and image[BOOTLOADER_OFFSET] == IMAGE_MAGIC:
        declared = max(declared or 0, HEADER_SIZES.get(image[BOOTLOADER_OFFSET + 3] >> 4, 0))
    need = max(len(image), declared or (4 << 20))
    size = next(s for s in FLASH_SIZES if s >= min(need, FLASH_SIZES[-1]))
    image += b"\xff" * (size - len(image))
    with open(out_path, "wb") as fh:
        fh.write(image)
    entry = int.from_bytes(image[BOOTLOADER_OFFSET + 4:BOOTLOADER_OFFSET + 8], "little")
    return {"size": size, "parts": parts, "entry": entry}


# eFuses of an ESP32 ECO3 (CHIP_VER_REV1 and REV2 burnt), from Espressif's QEMU documentation: the application then sees the
# revision of the ROM QEMU runs (rev. 3). Byte 17 is ADC_VREF (BLK0 word 4, bits 8-12; sign and magnitude in 7 mV steps): 0x10
# is -0, a chip measured at the nominal 1100 mV, which ESP-IDF's ADC calibration then uses (esp32adc.py converts with it)
EFUSE_ECO3 = bytes.fromhex("000000000000000000000000008000000010000000001000000000000000" + "00" * 94)


# ---- Xtensa ------------------------------------------------------------------------------------
@dataclass(frozen=True)
class MemInsn:
    load: bool
    width: int        # bytes accessed
    signed: bool
    reg: int          # the value register (store) or the destination (load), a0-a15
    base: int         # the address register
    offset: int
    length: int       # instruction bytes
    atomic: bool = False


# LSAI (op0 = 2) loads and stores by their r field: (load, width, signed); the 8-bit offset counts in units of the width
_LSAI = {0x0: (True, 1, False), 0x1: (True, 2, False), 0x2: (True, 4, False), 0x4: (False, 1, False), 0x5: (False, 2, False),
         0x6: (False, 4, False), 0x9: (True, 2, True), 0xB: (True, 4, False), 0xE: (False, 4, False), 0xF: (False, 4, False)}


def decode_mem(code: bytes) -> MemInsn | None:
    """The load or store at the start of ``code`` (little-endian Xtensa with the code density option), or None."""
    if not code:
        return None
    op0, t = code[0] & 0x0F, code[0] >> 4
    if op0 in (0x8, 0x9) and len(code) >= 2:  # L32I.N / S32I.N: imm4 * 4
        return MemInsn(load=op0 == 0x8, width=4, signed=False, reg=t, base=code[1] & 0x0F, offset=(code[1] >> 4) * 4, length=2)
    if op0 == 0x2 and len(code) >= 3:
        r = code[1] >> 4
        if r not in _LSAI:
            return None
        load, width, signed = _LSAI[r]
        return MemInsn(load=load, width=width, signed=signed, reg=t, base=code[1] & 0x0F, offset=code[2] * width, length=3, atomic=r == 0xE)
    return None


def rsr_ccount_at(data: bytes) -> tuple[int, int] | None:
    """``(byte offset, register)`` of the first ``rsr.ccount aN`` in ``data`` (RSR: op0 0, op1 3, op2 0, sr 234)."""
    i = data.find(b"\xea\x03", 1)
    while i >= 0:
        if data[i - 1] & 0x0F == 0:
            return i - 1, data[i - 1] >> 4
        i = data.find(b"\xea\x03", i + 1)
    return None


def is_waiti(code: bytes) -> bool:
    """The three bytes are a WAITI (the CPU sleeps until an interrupt)."""
    return len(code) == 3 and code[0] == 0x00 and code[1] >> 4 == 0x7 and code[2] == 0x00


def is_break(code: bytes) -> bool:
    """The instruction starting the bytes is BREAK (op0 0, r 4, op1 and op2 0) or BREAK.N (op0 0xD, t 2, r 0xF)."""
    return (len(code) >= 3 and code[0] & 0x0F == 0 and code[1] >> 4 == 4 and code[2] == 0) or \
        (len(code) >= 2 and code[0] == 0x2D and code[1] >> 4 == 0xF)


# QEMU's gdb register numbers for the ESP32 core ('g' sends 157 32-bit registers): pc, the 64 physical address registers,
# lbeg, lend, lcount, sar, windowbase, windowstart, configid0/1, ps, ..., vecbase 142, ..., prid 146
G_PC, G_AR0, G_LBEG, G_LEND, G_LCOUNT, G_WINDOWBASE, G_WINDOWSTART, G_PS, G_PRID = 0, 1, 65, 66, 67, 69, 70, 73, 146
PS_EXCM = 1 << 4
PRID_PRO_CPU = 0xCDCD
NAREG = 64


class Regs:
    def __init__(self, words: list[int]):
        self.w = words

    @property
    def pc(self) -> int:
        return self.w[G_PC]

    def a_index(self, i: int) -> int:
        """gdb register number of window register a``i`` (a0-a15 are physical registers WINDOWBASE * 4 on)."""
        return G_AR0 + ((self.w[G_WINDOWBASE] * 4 + i) % NAREG)

    def a(self, i: int) -> int:
        return self.w[self.a_index(i)]


# ---- the chip's pins ---------------------------------------------------------------------------
GPIO_BASE, IO_MUX_BASE, RTCIO_BASE = 0x3FF44000, 0x3FF49000, 0x3FF48400
GPIO_IN, GPIO_IN1, RTC_GPIO_IN = GPIO_BASE + 0x3C, GPIO_BASE + 0x40, RTCIO_BASE + 0x24
GPIO_STRAP = GPIO_BASE + 0x38
# GPIO registers that read as 0: the write-1-to-set / write-1-to-clear ones and a reserved word
GPIO_READ_ZERO = frozenset({0x08, 0x0C, 0x14, 0x18, 0x24, 0x28, 0x30, 0x34, 0x48, 0x4C, 0x54, 0x58, 0x5C})
# GPIO_PINn.int_ena bits (ESP-IDF's gpio_ll): the APP CPU's interrupt and NMI, the PRO CPU's, the SDIO extension's
INT_ENA_APP, INT_ENA_APP_NMI, INT_ENA_PRO, INT_ENA_PRO_NMI, INT_ENA_SDIO = 13, 14, 15, 16, 17
# The interrupt status as ACPU_INT, ACPU_NMI_INT, PCPU_INT, PCPU_NMI_INT and CPUSDIO_INT show it (GPIO0-31; 0x14 on: GPIO32-39)
GPIO_INT_VIEWS = {0x60: INT_ENA_APP, 0x64: INT_ENA_APP_NMI, 0x68: INT_ENA_PRO, 0x6C: INT_ENA_PRO_NMI, 0x70: INT_ENA_SDIO}
GPIO_INT_SOURCE, GPIO_NMI_SOURCE = 22, 23  # the GPIO peripheral's interrupt sources in the interrupt matrix
INTMATRIX_QOM = "/machine/soc/intmatrix"  # the interrupt matrix in QEMU's object tree; its GPIO inputs are the sources
# QEMU's stubs of the blocks the simulator keeps whole (QEMU names the SENS block "esp32.rtcio" too): while the image runs, an
# access in their log is one QEMU ran itself past a crossed watchpoint hit (see Machine._resolve_crossing), already put right.
# What SENS does beyond the ADCs is counted by esp32adc.AdcState.
KEPT_STUBS = frozenset({"esp32.gpio", "esp32.iomux", "esp32.rtcio"})
INTMATRIX_MAP = {"pro": 0x3FF00104, "app": 0x3FF00218}  # DPORT_PRO/APP_MAC_INTR_MAP_REG: one word per source, the CPU interrupt
EXTERNAL_INTS = frozenset(set(range(32)) - {6, 7, 11, 15, 16, 29})  # CPU interrupts the matrix can drive (the rest are the CPU's own)
RTCIO_READ_ZERO = frozenset({0x04, 0x08, 0x10, 0x14, 0x18, 0x1C, 0x20})
RTC_CNTL_TIME_UPDATE, RTC_CNTL_TIME0, RTC_CNTL_RESET_STATE = 0x3FF4800C, 0x3FF48010, 0x3FF48034
RTC_CNTL_CLK_CONF, DPORT_CPU_PER_CONF, APB_CTRL_SYSCLK_CONF = 0x3FF48070, 0x3FF0003C, 0x3FF66000
RESET_VECTOR = 0x40000400
ROM_START, ROM_END = 0x40000000, 0x40060000
XTHAL_GET_CCOUNT = 0x4000C050  # the ROM's xthal_get_ccount (esp32.rom.ld): it reads CCOUNT
XTAL_HZ = 40_000_000
RTC_SLOW_HZ = 150_000
GPIOS = 40
VALID_GPIOS = frozenset(set(range(0, 40)) - {20, 24, 28, 29, 30, 31})

# IO_MUX register offset of each pad
IO_MUX_OFFSET = {36: 0x04, 37: 0x08, 38: 0x0C, 39: 0x10, 34: 0x14, 35: 0x18, 32: 0x1C, 33: 0x20, 25: 0x24, 26: 0x28, 27: 0x2C,
                 14: 0x30, 12: 0x34, 13: 0x38, 15: 0x3C, 2: 0x40, 0: 0x44, 4: 0x48, 16: 0x4C, 17: 0x50, 9: 0x54, 10: 0x58, 11: 0x5C,
                 6: 0x60, 7: 0x64, 8: 0x68, 5: 0x6C, 18: 0x70, 19: 0x74, 20: 0x78, 21: 0x7C, 22: 0x80, 3: 0x84, 1: 0x88, 23: 0x8C, 24: 0x90}
PAD_OF_IO_MUX = {v: k for k, v in IO_MUX_OFFSET.items()}
FUN_WPD, FUN_WPU, FUN_IE = 1 << 7, 1 << 8, 1 << 9
PIN_FUNC_GPIO = 2
# Function 0 of the pads where it is not the GPIO matrix
IO_MUX_F0 = {1: "U0TXD", 3: "U0RXD", 6: "flash", 7: "flash", 8: "flash", 9: "flash", 10: "flash", 11: "flash",
             12: "MTDI", 13: "MTCK", 14: "MTMS", 15: "MTDO"}
DRIVE_OHMS = (130.0, 65.0, 33.0, 17.0)  # FUN_DRV 0-3 (about 5, 10, 20, 40 mA): the 3.3 V pad as a resistance
# The pads with RTC functions keep their pull resistors in RTC_IO (the IO_MUX pull bits do nothing there):
# GPIO → (RTC_IO register offset, pull-up bit, pull-down bit, RTC mux bit)
RTC_PADS = {4: (0x94, 27, 28, 19), 0: (0x98, 27, 28, 19), 2: (0x9C, 27, 28, 19), 15: (0xA0, 27, 28, 19), 13: (0xA4, 27, 28, 19),
            12: (0xA8, 27, 28, 19), 14: (0xAC, 27, 28, 19), 27: (0xB0, 27, 28, 19), 25: (0x84, 27, 28, 17), 26: (0x88, 27, 28, 17),
            33: (0x8C, 27, 28, 18), 32: (0x8C, 22, 23, 17)}
RTC_GPIO_OF = {36: 0, 37: 1, 38: 2, 39: 3, 34: 4, 35: 5, 25: 6, 26: 7, 33: 8, 32: 9, 4: 10, 0: 11, 2: 12, 15: 13, 13: 14, 12: 15, 14: 16, 27: 17}
PAD_DAC_XPD = {25: (0x84, 18), 26: (0x88, 18)}
# Internal pulls at reset (ESP32 datasheet, IO_MUX table): the strapping pins' pulls decide the boot mode.
RESET_PULLS = {0: "up", 1: "up", 2: "down", 3: "up", 4: "down", 5: "up", 6: "up", 7: "up", 8: "up", 9: "up", 10: "up", 11: "up",
               12: "down", 15: "up"}
RESET_IE = frozenset(set(range(0, 24)) - {20} | {27})
# The strapping pins in GPIO_STRAP order: bit 0 GPIO5, 1 MTDO (GPIO15), 2 GPIO4, 3 GPIO2, 4 GPIO0, 5 MTDI (GPIO12)
STRAP_PINS = (5, 15, 4, 2, 0, 12)
STRAP_FLASH_BOOT = 0x12
# Peripheral output signals of the GPIO matrix the reports name
SIGNALS = {14: "U0TXD", 17: "U1TXD", 29: "I2C0 SCL", 30: "I2C0 SDA", 95: "I2C1 SCL", 96: "I2C1 SDA",
           **{71 + i: f"LEDC high-speed channel {i}" for i in range(8)}, **{79 + i: f"LEDC low-speed channel {i}" for i in range(8)},
           **{87 + i: f"RMT channel {i}" for i in range(8)}, 198: "U2TXD"}
INT_TYPES = {1: "rising edge", 2: "falling edge", 3: "any edge", 4: "low level", 5: "high level"}


def strap_value(levels: dict[int, int]) -> int:
    """GPIO_STRAP from the levels of the strapping pins at reset."""
    return sum((levels.get(gpio, 0) & 1) << bit for bit, gpio in enumerate(STRAP_PINS))


@dataclass
class Pin:
    gpio: int
    function: str            # gpio, U0TXD, U0RXD, MTDI.., flash, rtc, or the peripheral driving it
    driven: bool             # the pad drives its net (a push-pull output, or open drain pulling low)
    level: int               # the driven level
    unknown: bool            # a peripheral drives the pad: its level is not simulated
    pull_up: bool
    pull_down: bool
    input: bool              # GPIO_IN reads the pad
    open_drain: bool
    drive_ohms: float
    interrupt: int           # GPIO_PINn.int_type (INT_TYPES; 0 none): what latches the pin's interrupt status
    pwm: int | None = None   # the LEDC channel (group * 8 + channel) the GPIO matrix routes to the pad: its wave is the level
    invert: bool = False     # the GPIO matrix inverts that output (OUT_INV_SEL)

    def label(self) -> str:
        if self.unknown:
            return f"peripheral ({self.function})"
        if self.function == "rtc":
            return "rtc"
        if self.driven:
            return ("od-low" if self.open_drain else "out-low") if not self.level else ("uart-tx" if self.function == "U0TXD" else "out-high")
        if self.open_drain and self.function == "gpio" and self.level:
            return "od-released" + ("-pullup" if self.pull_up else "")
        return "in-pullup" if self.pull_up else "in-pulldown" if self.pull_down else "in"


class GpioState:
    """The GPIO, IO_MUX and RTC_IO registers as the firmware wrote them, and what they make of each pad."""

    def __init__(self) -> None:
        self.rtcio: dict[int, int] = {}
        self.reset("power-on")

    def reset(self, scope: str = "power-on") -> None:
        """``power-on`` and ``rtc`` reset everything; ``system`` the digital peripherals (RTC_IO keeps its state); ``cpu`` nothing."""
        if scope == "cpu":
            return
        self.out = self.out1 = self.enable = self.enable1 = 0
        self.pin_reg = [0] * GPIOS
        self.out_sel = [0x100] * GPIOS
        self.iomux = {}
        for gpio in IO_MUX_OFFSET:
            value = 2 << 10  # FUN_DRV 2
            if gpio in RESET_IE:
                value |= FUN_IE
            if gpio not in RTC_PADS:
                value |= {"up": FUN_WPU, "down": FUN_WPD}.get(RESET_PULLS.get(gpio, ""), 0)
            self.iomux[gpio] = value
        if scope in ("power-on", "rtc") or not self.rtcio:
            self.rtcio = {}
            for gpio, (off, up, down, _) in RTC_PADS.items():
                pull = RESET_PULLS.get(gpio)
                self.rtcio[off] = self.rtcio.get(off, 0) | (1 << up if pull == "up" else 1 << down if pull == "down" else 0)
        self.other: dict[int, int] = {}  # GPIO and IO_MUX registers this model does not interpret (the input matrix, ...), as written
        self.status = 0                  # GPIO_STATUS (GPIO0-31) and GPIO_STATUS1 (GPIO32-39): the latched interrupts
        self.level_active: set[int] = set()  # pins whose level-type interrupt condition holds now
        self.configured: set[int] = set()

    # ---- writes ----
    def write(self, addr: int, value: int, width: int = 4) -> set[int] | None:
        """Apply a store; the GPIOs whose state may have changed (None: not a register this model keeps)."""
        reg = addr & ~3
        shift = (addr & 3) * 8
        mask = ((1 << (8 * width)) - 1) << shift
        bits = (value << shift) & mask

        def merged(old: int) -> int:
            return (old & ~mask) | bits

        if GPIO_BASE <= reg < GPIO_BASE + 0x1000:
            changed = self._gpio_write(reg - GPIO_BASE, bits, merged)
            if changed is None and reg - GPIO_BASE not in GPIO_READ_ZERO:
                self.other[reg] = merged(self.other.get(reg, 0))
            return changed
        if IO_MUX_BASE <= reg < IO_MUX_BASE + 0x100:
            gpio = PAD_OF_IO_MUX.get(reg - IO_MUX_BASE)
            if gpio is None:
                self.other[reg] = merged(self.other.get(reg, 0))
                return None
            self.iomux[gpio] = merged(self.iomux[gpio])
            self.configured.add(gpio)
            return {gpio}
        if RTCIO_BASE <= reg < RTCIO_BASE + 0x100:
            off = reg - RTCIO_BASE
            if off <= 0x14:  # RTC_GPIO_OUT and RTC_GPIO_ENABLE (with their W1TS/W1TC): what drives the pads in RTC mode
                base = 0x00 if off < 0x0C else 0x0C
                old = self.rtcio.get(base, 0)
                self.rtcio[base] = merged(old) if off == base else old | bits if off in (0x04, 0x10) else old & ~bits
                return {g for g in RTC_GPIO_OF if self.rtc_mode(g)}
            self.rtcio[off] = merged(self.rtcio.get(off, 0))
            pads = {g for g, (o, *_rest) in RTC_PADS.items() if o == off} | {g for g, (o, _) in PAD_DAC_XPD.items() if o == off}
            self.configured |= pads
            return pads or None
        return None

    def _gpio_write(self, off: int, bits: int, merged: Callable[[int], int]) -> set[int] | None:
        low = range(32)
        if off == 0x04:
            changed = self.out ^ merged(self.out)
            self.out = merged(self.out)
            return {g for g in low if changed >> g & 1}
        if off in (0x08, 0x0C):
            new = self.out | bits if off == 0x08 else self.out & ~bits
            changed, self.out = self.out ^ new, new
            return {g for g in low if changed >> g & 1}
        if off == 0x10:
            new = merged(self.out1) & 0xFF
            changed, self.out1 = self.out1 ^ new, new
            return {32 + g for g in range(8) if changed >> g & 1}
        if off in (0x14, 0x18):
            new = (self.out1 | bits if off == 0x14 else self.out1 & ~bits) & 0xFF
            changed, self.out1 = self.out1 ^ new, new
            return {32 + g for g in range(8) if changed >> g & 1}
        if off in (0x44, 0x48, 0x4C):  # GPIO_STATUS, W1TS, W1TC
            low = self.status & 0xFFFFFFFF
            low = merged(low) if off == 0x44 else low | bits if off == 0x48 else low & ~bits
            self._set_status(self.status & ~0xFFFFFFFF | low & 0xFFFFFFFF)
            return set()
        if off in (0x50, 0x54, 0x58):  # GPIO_STATUS1 (GPIO32-39), W1TS, W1TC
            high = self.status >> 32
            high = merged(high) if off == 0x50 else high | bits if off == 0x54 else high & ~bits
            self._set_status(self.status & 0xFFFFFFFF | (high & 0xFF) << 32)
            return set()
        if off in (0x20, 0x24, 0x28):
            new = merged(self.enable) if off == 0x20 else self.enable | bits if off == 0x24 else self.enable & ~bits
            changed, self.enable = self.enable ^ new, new
            self.configured |= {g for g in low if changed >> g & 1}
            return {g for g in low if changed >> g & 1}
        if off in (0x2C, 0x30, 0x34):
            new = (merged(self.enable1) if off == 0x2C else self.enable1 | bits if off == 0x30 else self.enable1 & ~bits) & 0xFF
            changed, self.enable1 = self.enable1 ^ new, new
            self.configured |= {32 + g for g in range(8) if changed >> g & 1}
            return {32 + g for g in range(8) if changed >> g & 1}
        if 0x88 <= off < 0x88 + 4 * GPIOS:
            gpio = (off - 0x88) // 4
            self.pin_reg[gpio] = merged(self.pin_reg[gpio])
            self.configured.add(gpio)
            return {gpio}
        if 0x530 <= off < 0x530 + 4 * GPIOS:
            gpio = (off - 0x530) // 4
            self.out_sel[gpio] = merged(self.out_sel[gpio])
            self.configured.add(gpio)
            return {gpio}
        return None

    # ---- reads ----
    def read(self, reg: int) -> int:
        """The word the chip returns for a register of the three blocks (GPIO_IN, GPIO_STRAP and RTC_GPIO_IN are the machine's)."""
        if GPIO_BASE <= reg < GPIO_BASE + 0x1000:
            off = reg - GPIO_BASE
            if off in (0x04, 0x10):
                return self.out if off == 0x04 else self.out1
            if off in (0x20, 0x2C):
                return self.enable if off == 0x20 else self.enable1
            if 0x88 <= off < 0x88 + 4 * GPIOS:
                return self.pin_reg[(off - 0x88) // 4]
            if 0x530 <= off < 0x530 + 4 * GPIOS:
                return self.out_sel[(off - 0x530) // 4]
            if off in (0x44, 0x50):
                return self.status & 0xFFFFFFFF if off == 0x44 else self.status >> 32 & 0xFF
            if 0x60 <= off < 0x88:
                view = self.interrupt_view(GPIO_INT_VIEWS[off if off < 0x74 else off - 0x14])
                return view & 0xFFFFFFFF if off < 0x74 else view >> 32 & 0xFF
            return 0 if off in GPIO_READ_ZERO else self.other.get(reg, 0)
        if IO_MUX_BASE <= reg < IO_MUX_BASE + 0x100:
            gpio = PAD_OF_IO_MUX.get(reg - IO_MUX_BASE)
            return self.iomux[gpio] if gpio is not None else self.other.get(reg, 0)
        if RTCIO_BASE <= reg < RTCIO_BASE + 0x100:
            off = reg - RTCIO_BASE
            return 0 if off in RTCIO_READ_ZERO else self.rtcio.get(off, 0)
        return 0

    # ---- the GPIO interrupt ----
    def _set_status(self, value: int) -> None:
        """GPIO_STATUS as the firmware wrote it; a level-type interrupt whose level still holds latches again at once."""
        self.status = value | sum(1 << g for g in self.level_active)

    def latch_interrupt(self, gpio: int) -> None:
        """The board gave the pin an edge its interrupt type reacts to."""
        self.status |= 1 << gpio

    def level_condition(self, gpio: int, active: bool) -> None:
        """Whether the level a level-type interrupt waits for holds now; while it does, the status bit cannot be cleared."""
        if active:
            self.level_active.add(gpio)
            self.status |= 1 << gpio
        else:
            self.level_active.discard(gpio)

    def interrupt_view(self, enable_bit: int) -> int:
        """The interrupt status of the pins whose GPIO_PINn.int_ena has ``enable_bit`` (one CPU's interrupt or NMI)."""
        return sum(1 << g for g in range(GPIOS) if self.status >> g & 1 and self.pin_reg[g] >> enable_bit & 1)

    def interrupt_lines(self) -> dict[str, bool]:
        """What the GPIO peripheral signals to the interrupt matrix, per CPU: its interrupt and its NMI."""
        if not self.status:
            return {"pro": False, "pro_nmi": False, "app": False, "app_nmi": False}
        return {"pro": bool(self.interrupt_view(INT_ENA_PRO)), "pro_nmi": bool(self.interrupt_view(INT_ENA_PRO_NMI)),
                "app": bool(self.interrupt_view(INT_ENA_APP)), "app_nmi": bool(self.interrupt_view(INT_ENA_APP_NMI))}

    # ---- what the registers make of a pad ----
    def rtc_mode(self, gpio: int) -> bool:
        pad = RTC_PADS.get(gpio)
        return bool(pad and self.rtcio.get(pad[0], 0) >> pad[3] & 1)

    def pulls(self, gpio: int) -> tuple[bool, bool]:
        if gpio >= 34:
            return False, False
        pad = RTC_PADS.get(gpio)
        if pad:
            reg = self.rtcio.get(pad[0], 0)
            return bool(reg >> pad[1] & 1), bool(reg >> pad[2] & 1)
        io = self.iomux.get(gpio, 0)
        return bool(io & FUN_WPU), bool(io & FUN_WPD)

    def out_level(self, gpio: int) -> int:
        return self.out >> gpio & 1 if gpio < 32 else self.out1 >> (gpio - 32) & 1

    def out_enabled(self, gpio: int) -> bool:
        return bool(self.enable >> gpio & 1 if gpio < 32 else self.enable1 >> (gpio - 32) & 1)

    def rtc_drives(self, gpio: int) -> str | None:
        """What drives a pad in RTC mode (None: nothing, it is an analog input): the DAC or an RTC GPIO output."""
        xpd = PAD_DAC_XPD.get(gpio)
        if xpd and self.rtcio.get(xpd[0], 0) >> xpd[1] & 1:
            return f"DAC on GPIO{gpio}"
        n = RTC_GPIO_OF.get(gpio)
        if n is not None and self.rtcio.get(0x0C, 0) >> (14 + n) & 1:
            return f"RTC GPIO output on GPIO{gpio}"
        return None

    def pin(self, gpio: int) -> Pin:
        io = self.iomux.get(gpio, 0)
        pull_up, pull_down = self.pulls(gpio)
        pin_reg = self.pin_reg[gpio]
        common = dict(gpio=gpio, pull_up=pull_up, pull_down=pull_down, open_drain=bool(pin_reg >> 2 & 1),
                      drive_ohms=DRIVE_OHMS[io >> 10 & 3], interrupt=pin_reg >> 7 & 7)
        if self.rtc_mode(gpio):
            what = self.rtc_drives(gpio)
            return Pin(function=what or "rtc", driven=False, level=0, unknown=what is not None, input=False, **common)
        sel = io >> 12 & 7
        special = IO_MUX_F0.get(gpio)
        oe: bool | None
        level: int | None
        if sel == PIN_FUNC_GPIO or (sel == 0 and special is None):
            out_sel = self.out_sel[gpio]
            signal = out_sel & 0x1FF
            if signal == 0x100:
                function, oe, level = "gpio", self.out_enabled(gpio), self.out_level(gpio) ^ (out_sel >> 9 & 1)
            elif signal in LEDC_SIGNALS:  # the LEDC's own output enable is always on (TRM, the GPIO matrix's signal table)
                oe = (self.out_enabled(gpio) if out_sel >> 10 & 1 else True) != bool(out_sel >> 11 & 1)
                common["input"] = bool(io & FUN_IE)
                driven = oe and gpio < 34
                return Pin(function=channel_name(LEDC_SIGNALS[signal]), driven=driven, level=0, unknown=False, pwm=LEDC_SIGNALS[signal],
                           invert=bool(out_sel >> 9 & 1), **common)
            else:
                function = SIGNALS.get(signal, f"peripheral signal {signal}")
                oe = self.out_enabled(gpio) if out_sel >> 10 & 1 else None
                level = None
        elif sel == 0 and special == "U0TXD":
            function, oe, level = "U0TXD", True, 1  # the UART's idle level; the bits it sends are not simulated
        elif sel == 0:
            function, oe, level = special or "", False, 0
        else:
            function, oe, level = f"IO_MUX function {sel}", None, None
        if gpio >= 34:
            oe = False  # input-only pads
        common["input"] = bool(io & FUN_IE)
        if oe is None or (oe and level is None):
            return Pin(function=function, driven=False, level=0, unknown=True, **common)
        driven = bool(oe) and not (common["open_drain"] and level)
        return Pin(function=function, driven=driven, level=int(level or 0), unknown=False, **common)

    def reset_pin(self, gpio: int) -> Pin:
        """The pad while the chip is held in reset: no driver, the reset pulls."""
        pull = RESET_PULLS.get(gpio) if gpio < 34 else None
        return Pin(gpio=gpio, function="reset", driven=False, level=0, unknown=False, pull_up=pull == "up", pull_down=pull == "down",
                   input=False, open_drain=False, drive_ohms=DRIVE_OHMS[2], interrupt=0)


# ---- the gdb remote protocol ---------------------------------------------------------------------
class Gdb:
    """A minimal client of QEMU's gdb stub (all-stop, acknowledged packets)."""

    def __init__(self, sock: socket.socket):
        self.sock = sock
        self.buf = b""
        self.output = ""

    @classmethod
    def connect(cls, port: int, proc: subprocess.Popen, deadline: float, why: Callable[[], str]) -> "Gdb":
        while True:
            try:
                sock = socket.create_connection(("127.0.0.1", port), timeout=1.0)
                sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
                return cls(sock)
            except OSError:
                if proc.poll() is not None:
                    raise QemuError(f"QEMU exited with {proc.returncode} before the gdb connection: {why()}") from None
                if time.monotonic() > deadline:
                    raise QemuError(f"QEMU did not open its gdb port within the time limit: {why()}") from None
                time.sleep(0.05)

    def close(self) -> None:
        try:
            self.sock.close()
        except OSError:
            pass

    def send(self, data: str) -> None:
        payload = data.encode("latin-1")
        self.sock.sendall(b"$" + payload + b"#" + f"{sum(payload) & 0xFF:02x}".encode())

    def interrupt(self) -> None:
        self.sock.sendall(b"\x03")

    def recv(self, timeout: float | None) -> str:
        """The next packet (acknowledged); TimeoutError when none arrives in time."""
        deadline = None if timeout is None else time.monotonic() + timeout
        while True:
            start = self.buf.find(b"$")
            if start >= 0:
                end = self.buf.find(b"#", start + 1)
                if end >= 0 and len(self.buf) >= end + 3:
                    raw = self.buf[start + 1:end]
                    self.buf = self.buf[end + 3:]
                    self.sock.sendall(b"+")
                    return _unescape(raw).decode("latin-1")
            elif self.buf:
                self.buf = b""  # acknowledgements
            left = None if deadline is None else deadline - time.monotonic()
            if left is not None and left <= 0:
                raise TimeoutError
            self.sock.settimeout(left)
            try:
                chunk = self.sock.recv(65536)
            except socket.timeout:
                raise TimeoutError from None
            if not chunk:
                raise QemuError("QEMU closed the gdb connection")
            self.buf += chunk

    def rpc(self, data: str, timeout: float = 30.0) -> str:
        """Send a command and return its reply (console output packets of a monitor command are collected in ``self.output``)."""
        self.send(data)
        self.output = ""
        while True:
            try:
                reply = self.recv(timeout)
            except TimeoutError:
                raise QemuError(f"QEMU's gdb stub did not answer {data[:20]!r}") from None
            if reply.startswith("O") and reply != "OK" and re.fullmatch(r"O(?:[0-9a-fA-F]{2})+", reply):
                self.output += bytes.fromhex(reply[1:]).decode("latin-1")
                continue
            return reply

    def ok(self, data: str) -> None:
        reply = self.rpc(data)
        if reply != "OK":
            raise QemuError(f"QEMU's gdb stub refused {data!r}: {reply or 'not supported'}")


def _unescape(raw: bytes) -> bytes:
    if b"}" not in raw and b"*" not in raw:
        return raw
    out = bytearray()
    i = 0
    while i < len(raw):
        c = raw[i]
        if c == 0x7D and i + 1 < len(raw):  # '}' escape
            out.append(raw[i + 1] ^ 0x20)
            i += 2
        elif c == 0x2A and out and i + 1 < len(raw):  # '*' run length
            out += bytes([out[-1]]) * (raw[i + 1] - 29)
            i += 2
        else:
            out.append(c)
            i += 1
    return bytes(out)


class Qtest:
    """QEMU's qtest socket, used for one thing: the level of an interrupt source of the ESP32's interrupt matrix."""

    def __init__(self, sock: socket.socket):
        self.sock = sock
        self.buf = b""

    @classmethod
    def connect(cls, port: int, proc: subprocess.Popen, deadline: float, why: Callable[[], str]) -> "Qtest":
        while True:
            try:
                sock = socket.create_connection(("127.0.0.1", port), timeout=1.0)
                sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
                sock.settimeout(STEP_TIMEOUT_S)
                return cls(sock)
            except OSError:
                if proc.poll() is not None:
                    raise QemuError(f"QEMU exited with {proc.returncode} before the qtest connection: {why()}") from None
                if time.monotonic() > deadline:
                    raise QemuError(f"QEMU did not open its qtest port within the time limit: {why()}") from None
                time.sleep(0.05)

    def close(self) -> None:
        try:
            self.sock.close()
        except OSError:
            pass

    def command(self, line: str) -> str:
        self.sock.sendall(line.encode() + b"\n")
        while True:
            while b"\n" not in self.buf:
                try:
                    data = self.sock.recv(4096)
                except (OSError, TimeoutError) as exc:
                    raise QemuError(f"QEMU's qtest socket did not answer {line!r}: {exc}") from None
                if not data:
                    raise QemuError(f"QEMU closed its qtest socket after {line!r}")
                self.buf += data
            reply, _, self.buf = self.buf.partition(b"\n")
            if not reply.startswith(b"IRQ"):  # asynchronous notices (intercepted IRQs) are not answers
                return reply.decode("latin-1").strip()

    def set_source(self, source: int, level: int) -> None:
        reply = self.command(f"set_irq_in {INTMATRIX_QOM} unnamed-gpio-in {source} {level}")
        if reply != "OK":
            raise QemuError(f"QEMU refused to set interrupt source {source}: {reply[:80]}")


def _free_ports(n: int) -> list[int]:
    socks = [socket.socket(socket.AF_INET, socket.SOCK_STREAM) for _ in range(n)]
    try:
        for s in socks:
            s.bind(("127.0.0.1", 0))
        return [s.getsockname()[1] for s in socks]
    finally:
        for s in socks:
            s.close()


def _stop(text: str) -> dict[str, Any]:
    """A stop reply: ``{signal, thread, watch: (kind, addr) | None}`` (kind '2' write, '3' read, '4' access)."""
    if text[:1] in ("W", "X"):
        return {"signal": None, "exited": text, "thread": None, "watch": None}
    if text[:1] == "S":
        return {"signal": int(text[1:3], 16), "thread": None, "watch": None}
    if text[:1] != "T":
        raise QemuError(f"unexpected answer from QEMU's gdb stub: {text[:60]!r}")
    stop: dict[str, Any] = {"signal": int(text[1:3], 16), "thread": None, "watch": None}
    for item in text[3:].split(";"):
        key, _, value = item.partition(":")
        if key == "thread":
            stop["thread"] = int(value.rsplit(".", 1)[-1], 16)
        elif key in ("watch", "rwatch", "awatch"):
            stop["watch"] = ({"watch": "2", "rwatch": "3", "awatch": "4"}[key], int(value, 16))
    return stop


# ---- the machine ---------------------------------------------------------------------------------
ICOUNT_SHIFT = 3        # every instruction advances QEMU's virtual clock by 2**3 = 8 ns (about the pace of a 160 MHz ESP32)
# With no stop for this long (wall clock) the run is interrupted to look at the time, sooner when the end or a stimulus is due.
# Rarely: under -icount QEMU runs the two CPUs in turns, and an interruption costs the CPU it lands on the rest of its turn, so
# a boot where one CPU spins waiting for the other gets slower with every one (every 50 ms added about a second to MicroPython's)
TICK_S = 0.5
TICK_MIN_S = 0.0002      # the closest look before a due stimulus: it also bounds how late a GPIO interrupt it causes is raised
STALL_S = 2.0           # the virtual clock standing still this long (wall clock): the firmware waits for nothing that will come
FROZEN_S = 0.02         # ...this long with the CPUs asleep: QEMU has no timer pending (any timer would move the clock by then)
CREEP_S = 1e-4          # what QEMU's clock may still move between two looks while it stands still (each resume adds a little)
SETTLE_S = 0.0005       # how long the machine runs again after an interruption that found the CPU asleep (see _settle)
STEP_TIMEOUT_S = 2.0
CONNECT_TIMEOUT_S = 20.0
LOG_LIMIT = 64 << 20    # QEMU's log of unimplemented-device accesses: a firmware polling one forever stops the run
UART_LIMIT = 1 << 20    # UART output kept for the result and the assertions
# Access watchpoints (loads and stores): QEMU does not keep these registers (its GPIO is a stub, IO_MUX, RTC_IO and SENS are not
# modelled), so every access is answered from GpioState, LedcState or AdcState
WATCHES = (
    ("4", GPIO_BASE, 0x5D0),      # GPIO: outputs, output enables, GPIO_IN, pin config, the GPIO matrix
    ("4", IO_MUX_BASE, 0x94),     # IO_MUX: function, pulls, input enable, drive
    ("4", RTCIO_BASE, 0x100),     # RTC_IO: the RTC pads' pulls and RTC functions, RTC_GPIO_IN (not simulated)
    ("4", LEDC_BASE, LEDC_SIZE),  # the LED PWM controller (QEMU keeps few of its registers: no duty readback, fades, interrupts)
    ("4", SENS_BASE, SENS_SIZE),  # SENS: the SAR ADCs (and the touch pads, the temperature sensor, ...: counted, not simulated)
)
RTC_IO_HALL_SENS, XPD_HALL = 0x78, 31  # RTC_IO_HALL_SENS_REG: the hall sensor's power, which switches it to ADC1 channels 0 and 3
RESET_CAUSES = {1: "power-on", 3: "software", 4: "watchdog", 5: "deep-sleep", 7: "watchdog", 8: "watchdog", 9: "watchdog",
                11: "watchdog", 12: "software", 13: "watchdog", 14: "external", 15: "brownout", 16: "watchdog"}
RESET_SCOPES = {1: "power-on", 3: "system", 4: "system", 5: "system", 7: "system", 8: "system", 9: "system", 11: "cpu", 12: "cpu",
                13: "cpu", 14: "cpu", 15: "rtc", 16: "rtc"}


class Handler:
    """What the machine tells the board (esp32sim.Run implements it). ``finished`` ends the run at the next stop."""

    finished = False

    def on_gpio(self, t: float, gpios: set[int]) -> None: ...

    def gpio_in(self, t: float, bank: int) -> int:
        return 0

    def on_reset(self, t: float, cause: str, scope: str) -> None: ...

    def on_tick(self, t: float) -> None: ...

    def on_uart(self, t: float, text: str) -> None: ...

    def reset_request(self) -> float | None:
        """After a callback: None, or the time at which the board releases the chip from a reset it asserted (EN pulled low)."""
        return None

    def next_due(self) -> float | None:
        """The time of the next stimulus, by which the machine looks at the clock again (EN must hold the chip from that moment)."""
        return None

    def on_ledc(self, t: float, channels: set[int]) -> None:
        """The firmware changed these LEDC channels (or a fade on them ended): the pads they drive change."""

    def adc_volts(self, t: float, gpio: int) -> float | None:
        """The voltage an ADC conversion samples on the pad at ``t`` (None: it floats, the reading is arbitrary)."""
        return None


class Machine:
    """One QEMU process running a flash image, stopped at every access to the pins' registers."""

    def __init__(self, qemu: str, image: str, workdir: str, strap: int = STRAP_FLASH_BOOT, *, icount_shift: int = ICOUNT_SHIFT,
                 watchdogs: bool = True, clock: str | None = None, rtc_hz: float = RTC_SLOW_HZ, entry: int | None = None):
        self.qemu, self.image, self.workdir, self.strap = qemu, image, workdir, strap
        # Where the ROM hands over to the flash image (its second-stage bootloader): the pins are watched from there on. The ROM's
        # own pin set-up (UART and flash pads) leaves them as the reset state already says, and QEMU loses a timer when the ROM
        # is watched while it starts after a reset (the eFuse read never finishes).
        self.entry = entry
        self.watching = False
        self.shift, self.watchdogs = icount_shift, watchdogs
        self.clock_kind, self.rtc_hz = clock, rtc_hz
        self.proc: subprocess.Popen | None = None
        self.gdb: Gdb | None = None
        self.qtest: Qtest | None = None
        # interrupt sources this machine raised, with the CPU interrupts the matrix mapped them to then (pro, app)
        self._raised: dict[int, tuple[int, int]] = {}
        self.gpio = GpioState()
        self.ledc = LedcState()
        self.adc = AdcState()
        self.uart_path = os.path.join(workdir, "uart0.log")
        self.log_path = os.path.join(workdir, "qemu.log")
        self.err_path = os.path.join(workdir, "qemu.err")
        self.efuse_path = os.path.join(workdir, "efuse.bin")
        self.qtest_log_path = os.path.join(workdir, "qtest.log")
        self.uart_seen = 0
        self.uart_text = ""
        self.uart_truncated = False
        self._uart_decoder = codecs.getincrementaldecoder("utf-8")(errors="replace")
        self.t = 0.0
        self.resets: list[tuple[float, str]] = []
        self.app_cpu_started = False
        self._insns: dict[tuple[int, int], MemInsn] = {}
        self._rom_ccount: tuple[int, int] | None = None
        self._rtc_base: int | None = None
        self._offset = 0.0
        # simulated time at which each CPU's cycle counter was 0 (the PRO CPU's starts with the machine)
        self._ccount_offsets: dict[int, float] = {1: 0.0}
        self._pending_reset: str | None = None
        self.skipped = 0.0     # idle time that passed for the board while QEMU's clock stood still (see _skip_idle)
        self._log_spans: list[list[int | None]] = []  # byte ranges of QEMU's log written while the image ran (watched)
        self._asleep = False   # the last interruption found the CPU in WAITI
        self._g_thread = 1  # the CPU whose registers 'g', 'p' and 'P' address (the one that stopped, or the one selected with Hg)
        self.phys_mode: bool | None = None
        self.vcont = True

    # ---- process ----
    def argv(self, port: int, qtest_port: int) -> list[str]:
        argv = [self.qemu, "-machine", "esp32", "-accel", "tcg", "-display", "none", "-monitor", "none", "-serial", f"file:{self.uart_path}",
                "-drive", f"file={self.image},if=mtd,format=raw",
                "-drive", f"file={self.efuse_path},if=none,format=raw,id=efuse", "-global", "driver=nvram.esp32.efuse,property=drive,value=efuse",
                "-global", f"driver=esp32.gpio,property=strap_mode,value={self.strap:#04x}",
                "-icount", f"shift={self.shift},sleep=on",
                "-d", "unimp,guest_errors", "-D", self.log_path,
                "-gdb", f"tcp:127.0.0.1:{port}", "-S",
                # the interrupt matrix's inputs, for the GPIO interrupt (with TCG named: -qtest alone picks an accelerator that runs no CPU)
                "-qtest", f"tcp:127.0.0.1:{qtest_port},server=on,wait=off", "-qtest-log", self.qtest_log_path]
        if not self.watchdogs:
            argv += ["-global", "driver=timer.esp32.timg,property=wdt_disable,value=true"]
        return argv

    def stderr_tail(self) -> str:
        try:
            with open(self.err_path, encoding="utf-8", errors="replace") as fh:
                return " ".join(fh.read().split())[-600:] or "no message"
        except OSError:
            return "no message"

    def start(self, deadline: float, watch: bool = True) -> None:
        with open(self.efuse_path, "wb") as fh:
            fh.write(EFUSE_ECO3)
        for attempt in range(3):
            port, qtest_port = _free_ports(2)
            with open(self.err_path, "wb") as err:
                self.proc = subprocess.Popen(self.argv(port, qtest_port), stdin=subprocess.DEVNULL, stdout=err, stderr=subprocess.STDOUT,
                                             cwd=self.workdir)
            try:
                connect_by = min(deadline, time.monotonic() + CONNECT_TIMEOUT_S)
                self.gdb = Gdb.connect(port, self.proc, connect_by, self.stderr_tail)
                self.qtest = Qtest.connect(qtest_port, self.proc, connect_by, self.stderr_tail)
                break
            except QemuError:
                if attempt < 2 and self.proc.poll() is not None and "address already in use" in self.stderr_tail().lower():
                    continue
                raise
        gdb = self.gdb
        assert gdb is not None
        gdb.rpc("qSupported:swbreak+;hwbreak+;vContSupported+")
        _stop(gdb.rpc("?"))
        self.vcont = "s" in gdb.rpc("vCont?").split(";")[1:]
        regs = self.regs()
        if len(regs.w) <= G_PRID or regs.pc != RESET_VECTOR or regs.w[G_PS] & 0x1F != 0x1F or regs.w[G_PRID] != PRID_PRO_CPU:
            raise QemuError(f"QEMU's gdb registers are not laid out as the simulator expects (pc {regs.pc:#x}, {len(regs.w)} registers): "
                            "this QEMU build is not one it knows")
        if watch:
            self.step(1)  # past the reset vector, so that the breakpoint there only catches the next reset
            gdb.ok(f"Z0,{RESET_VECTOR:x},3")
            if self.entry is not None:
                gdb.ok(f"Z0,{self.entry:x},3")
            else:
                self._watch(True)

    def _watch(self, on: bool) -> None:
        """Insert (or remove) the watchpoints on the pins' registers."""
        if on == self.watching:
            return
        assert self.gdb is not None
        for kind, addr, length in WATCHES:
            self.gdb.ok(f"{'Z' if on else 'z'}{kind},{addr:x},{length:x}")
        self.watching = on
        try:  # QEMU's log of unimplemented devices counts while the image runs (the ROM's own start-up touches some too)
            size = os.path.getsize(self.log_path)
        except OSError:
            size = 0
        if on:
            self._log_spans.append([size, None])
        elif self._log_spans and self._log_spans[-1][1] is None:
            self._log_spans[-1][1] = size

    def begin_at(self, t: float) -> None:
        """The chip starts at simulated time ``t`` (the board held EN low until then)."""
        self.t = t
        self._ccount_offsets = {1: t}
        self._rtc_base = None

    def close(self) -> None:
        if self.qtest is not None:
            self.qtest.close()
        if self.gdb is not None:
            try:
                self.gdb.send("k")
            except OSError:
                pass
            self.gdb.close()
        if self.proc is not None and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait(timeout=5)

    # ---- registers and memory ----
    def regs(self) -> Regs:
        assert self.gdb is not None
        text = self.gdb.rpc("g")
        if not re.fullmatch(r"(?:[0-9a-fA-Fx]{8})+", text or ""):
            raise QemuError(f"QEMU's gdb stub sent no registers: {text[:40]!r}")
        return Regs([int.from_bytes(bytes.fromhex(text[k:k + 8].replace("x", "0")), "little") for k in range(0, len(text), 8)])

    def set_reg(self, index: int, value: int) -> None:
        assert self.gdb is not None
        self.gdb.ok(f"P{index:x}={(value & 0xFFFFFFFF).to_bytes(4, 'little').hex()}")

    def get_reg(self, index: int) -> int:
        assert self.gdb is not None
        text = self.gdb.rpc(f"p{index:x}")
        if not re.fullmatch(r"[0-9a-fA-F]{8}", text or ""):
            raise QemuError(f"QEMU's gdb stub cannot read register {index}: {text[:20]!r}")
        return int.from_bytes(bytes.fromhex(text), "little")

    def read(self, addr: int, length: int) -> bytes:
        assert self.gdb is not None
        text = self.gdb.rpc(f"m{addr:x},{length:x}")
        if not re.fullmatch(r"(?:[0-9a-fA-F]{2})+", text or ""):
            raise QemuError(f"QEMU cannot read {length} bytes at {addr:#x}: {text[:20]!r}")
        return bytes.fromhex(text)

    def read32(self, addr: int) -> int:
        return int.from_bytes(self.read(addr, 4), "little")

    def select(self, thread: int) -> None:
        assert self.gdb is not None
        self.gdb.ok(f"Hg{thread:x}")

    def step(self, thread: int) -> dict[str, Any]:
        """Execute one instruction on ``thread`` (the other core stays stopped)."""
        assert self.gdb is not None
        self.gdb.send(f"vCont;s:{thread:x}" if self.vcont else "s")
        try:
            stop = _stop(self.gdb.recv(STEP_TIMEOUT_S))
            self._g_thread = stop["thread"] or thread
            return stop
        except TimeoutError:
            self.gdb.interrupt()
            _stop(self.gdb.recv(STEP_TIMEOUT_S))
            raise QemuError("a single step did not finish (the CPU is waiting for an interrupt)") from None

    # ---- time ----
    def write32_device(self, addr: int, value: int, then_read: tuple[int, int] | None = None) -> bytes:
        """Store a word to a device register, in QEMU's physical-memory mode (a gdb write in virtual mode does not reach the
        device), and optionally read ``(addr, length)`` before leaving that mode."""
        assert self.gdb is not None
        if self.phys_mode is None:
            self.phys_mode = self.gdb.rpc("Qqemu.PhyMemMode:1") == "OK"
        elif self.phys_mode:
            self.gdb.ok("Qqemu.PhyMemMode:1")
        try:
            self.gdb.rpc(f"M{addr:x},4:{(value & 0xFFFFFFFF).to_bytes(4, 'little').hex()}")
            return self.read(*then_read) if then_read else b""
        finally:
            if self.phys_mode:
                self.gdb.ok("Qqemu.PhyMemMode:0")

    def read_rtc(self) -> int:
        """The RTC timer (48 bits of slow-clock ticks), latched through a physical-memory write so the device sees it."""
        data = self.write32_device(RTC_CNTL_TIME_UPDATE, 1 << 31, then_read=(RTC_CNTL_TIME0, 8))
        return int.from_bytes(data[:4], "little") | (int.from_bytes(data[4:8], "little") & 0xFFFF) << 32

    def apb_hz(self) -> float:
        """APB_CLK: 80 MHz with the PLL, else the CPU clock (XTAL or RC_FAST, divided)."""
        return 80e6 if self.read32(RTC_CNTL_CLK_CONF) >> 27 & 3 == 1 else self.cpu_hz()

    def cpu_hz(self) -> float:
        """The CPU clock as the firmware configured it (the rate of CCOUNT)."""
        source = self.read32(RTC_CNTL_CLK_CONF) >> 27 & 3
        if source == 1:  # PLL
            return {0: 80e6, 1: 160e6}.get(self.read32(DPORT_CPU_PER_CONF) & 3, 240e6)
        div = (self.read32(APB_CTRL_SYSCLK_CONF) & 0x3FF) + 1
        if source == 0:
            return XTAL_HZ / div
        if source == 2:
            return 8e6 / div
        raise Unsupported("apll_clock", "the CPU runs from the audio PLL: its clock rate is not simulated", self.t)

    def ccount(self, thread: int, regs: Regs | None = None, running: bool = False) -> int | None:
        """The CPU's cycle counter, fresh: the stopped CPU executes the ROM's ``rsr.ccount`` once, then gets its registers back.
        None when the CPU sleeps in WAITI (stepping it would let the clock jump to the next timer). ``running``: the CPU stopped
        at an instruction of its own (a watchpoint), so it is awake."""
        if self._g_thread != thread:
            self.select(thread)
            self._g_thread = thread
            regs = None
        regs = regs or self.regs()
        if not running:
            try:
                if is_waiti(self.read((regs.pc - 3) & 0xFFFFFFFF, 3)):
                    return None
            except QemuError:
                pass
        if self._rom_ccount is None:
            self._rom_ccount = self._find_rom_ccount()
        addr, reg = self._rom_ccount
        index = regs.a_index(reg)
        try:
            self.set_reg(G_PC, addr)
            self.step(thread)
            value = self.get_reg(index)
        finally:
            self.set_reg(index, regs.w[index])
            if regs.w[G_LEND] == addr + 3:  # a zero-overhead loop ending right there just counted a round
                self.set_reg(G_LCOUNT, regs.w[G_LCOUNT])
            self.set_reg(G_PC, regs.pc)
        return value

    def _find_rom_ccount(self) -> tuple[int, int]:
        hit = rsr_ccount_at(self.read(XTHAL_GET_CCOUNT, 64))
        if hit:
            return XTHAL_GET_CCOUNT + hit[0], hit[1]
        for addr in range(ROM_START, ROM_END, 0x400):
            data = self.read(addr, 0x403)
            hit = rsr_ccount_at(data)
            if hit and hit[0] + 3 <= len(data) and addr + hit[0] != RESET_VECTOR:
                return addr + hit[0], hit[1]
        raise QemuError("the ESP32 ROM in this QEMU has no rsr.ccount instruction to read the cycle counter with")

    def now(self, thread: int | None, regs: Regs | None = None, running: bool = False) -> float:
        """Simulated seconds since power-on, never earlier than the last reading. With the cycle counter, a CPU asleep in WAITI
        cannot be asked: the other core is, or the last reading stands."""
        if self.clock_kind == "rtc":
            ticks = self.read_rtc()
            if self._rtc_base is None or ticks < self._rtc_base:
                self._rtc_base, self._offset = ticks, self.t
            t = self._offset + (ticks - self._rtc_base) / self.rtc_hz
        else:
            started = (1, 2) if self.app_cpu_started else (1,)  # the APP CPU waits at the reset vector until the PRO CPU starts it
            threads = [thread] if thread in started else []
            if not running:
                threads += [n for n in started if n not in threads]
            found = None
            for n in threads:
                value = self.ccount(n, regs if n == thread else None, running=running and n == thread)
                if value is not None:
                    hz = self.cpu_hz()
                    if n not in self._ccount_offsets:
                        self._ccount_offsets[n] = self.t - value / hz
                    found = self._ccount_offsets[n] + value / hz
                    break
            if found is None:
                return self.t
            t = found
        self.t = max(self.t, t)
        return self.t

    # ---- the run ----
    def run(self, handler: Handler, end: float, deadline: float, cancel: threading.Event | None = None,
            progress: Callable[[float, float | None, str], None] | None = None) -> None:
        """Run until the simulated time reaches ``end`` (or the handler is finished)."""
        assert self.gdb is not None
        frozen_since: float | None = None  # wall time from which QEMU's clock has stood still
        last_progress = time.monotonic()
        while not handler.finished and self.t < end:
            if cancel is not None and cancel.is_set():
                raise Cancelled("the firmware simulation was cancelled")
            if time.monotonic() > deadline:
                raise TimedOut(f"reached {self.t * 1000:.1f} ms of {end * 1000:g} ms")
            due = min((d for d in (handler.next_due(), self.ledc.next_event()) if d is not None), default=end)
            due = min(due, end)
            wait = min(TICK_S, max(TICK_MIN_S, due - self.t))  # idle time passes at the wall clock's pace, busy time near it
            stop = self._resume(min(wait, FROZEN_S) if frozen_since is not None else wait)
            if stop.get("exited"):
                raise QemuError(f"QEMU stopped ({stop['exited']}): {self.stderr_tail()}")
            thread = stop["thread"] or 1
            self._g_thread = thread
            before = self.t
            if stop["watch"]:
                self._on_watch(handler, stop, thread)
            elif stop["signal"] == 5:
                self._on_break(handler, thread)
            else:
                handler.on_tick(self.now(thread))
            self._uart(handler)
            self._check_log()
            release = handler.reset_request()
            if release is not None:
                self._reset_chip(release)
            self._ledc_events(handler)
            self._sync_interrupts()
            if stop["watch"] is None and stop["signal"] != 5:
                due = min((d for d in (handler.next_due(), self.ledc.next_event()) if d is not None), default=None)
                if self.t - before > CREEP_S:
                    frozen_since = None
                elif frozen_since is None:
                    frozen_since = time.monotonic()
                elif self._asleep and due is not None and due < end and time.monotonic() - frozen_since >= FROZEN_S:
                    self._skip_idle(due)  # nothing timed inside QEMU: only the stimulus (or a fade's end) can wake the chip
                    handler.on_tick(self.t)
                    self._ledc_events(handler)
                    self._sync_interrupts()
                    frozen_since = None
                elif time.monotonic() - frozen_since >= STALL_S:
                    raise Unsupported("stall", "the firmware stopped making progress: the CPUs sleep with no timer pending and no stimulus left "
                                               "to wake them (it waits for an interrupt nothing here raises, or it entered deep sleep, which "
                                               "QEMU does not emulate)", self.t)
            if progress and time.monotonic() - last_progress > 0.5:
                last_progress = time.monotonic()
                progress(min(self.t, end), end, f"simulated {min(self.t, end) * 1000:.0f} ms of {end * 1000:.0f} ms")

    def _sync_interrupts(self) -> None:
        """Drive the interrupt matrix's GPIO sources from the GPIO interrupt status. A source goes high only once a CPU maps it
        to one of its interrupts: the matrix passes level changes on to the interrupt mapped at that moment, not levels."""
        if self.qtest is None:
            return
        lines = self.gpio.interrupt_lines()
        ledc = self.ledc.interrupt()
        for source, pro, app in ((GPIO_INT_SOURCE, lines["pro"], lines["app"]), (GPIO_NMI_SOURCE, lines["pro_nmi"], lines["app_nmi"]),
                                 (LEDC_INT_SOURCE, ledc, ledc)):
            raised = self._raised.get(source)
            if not (pro or app or raised):
                continue
            maps = (self.read32(INTMATRIX_MAP["pro"] + 4 * source) & 0x1F, self.read32(INTMATRIX_MAP["app"] + 4 * source) & 0x1F)
            want = (pro and maps[0] in EXTERNAL_INTS) or (app and maps[1] in EXTERNAL_INTS)
            if raised is not None and (not want or raised != maps):
                self._lower(source, raised, maps)
                raised = None
            if want and raised is None:
                self.qtest.set_source(source, 1)
                self._raised[source] = maps

    def _ledc_events(self, handler: Handler) -> None:
        """Fades that ended by now raise DUTY_CHNG_END, and the pads they drive take the final duty."""
        ended = self.ledc.advance(self.t)
        if ended:
            handler.on_ledc(self.t, ended)

    def _lower(self, source: int, raised: tuple[int, int], now: tuple[int, int]) -> None:
        """Lower a source on the CPU interrupts it was raised on: if the firmware mapped it elsewhere since, the old mapping is
        put back for the moment (the firmware is stopped) so the interrupt that saw it rise sees it fall."""
        assert self.qtest is not None
        self._raised.pop(source, None)
        moved = [(INTMATRIX_MAP[cpu] + 4 * source, old, new) for cpu, old, new in zip(("pro", "app"), raised, now) if old != new]
        for addr, old, _ in moved:
            self.write32_device(addr, old)
        self.qtest.set_source(source, 0)
        for addr, _, new in moved:
            self.write32_device(addr, new)

    def _resume(self, wait: float = TICK_S) -> dict[str, Any]:
        """Continue until the firmware touches a watched register or reaches the reset vector; after ``wait`` seconds of wall clock
        without either, interrupt it to look at the time."""
        assert self.gdb is not None
        self.gdb.send("vCont;c" if self.vcont else "c")
        try:
            return _stop(self.gdb.recv(wait))
        except TimeoutError:
            pass
        stop = self._resolve_crossing(self._interrupt())
        if stop.get("exited") or stop["watch"] is not None or stop["signal"] == 5:
            return stop
        stopped = stop["thread"] or 1
        self._g_thread = stopped  # QEMU addresses the stopped CPU's registers
        self._asleep = all(self._in_waiti(n) for n in ((1, 2) if self.app_cpu_started else (1,)))  # an unstarted APP CPU idles too
        if not self._asleep:
            if self._g_thread != stopped:
                self.select(stopped)
                self._g_thread = stopped
            return stop
        # QEMU counts the time the CPUs slept (with -icount sleep=on) only when they wake or the machine resumes, so the clock
        # read now could be behind by everything since they fell asleep: run a moment longer, then look
        self.gdb.send("vCont;c" if self.vcont else "c")
        time.sleep(SETTLE_S)
        return self._resolve_crossing(self._interrupt())

    def _interrupt(self) -> dict[str, Any]:
        """Stop the running machine (the answer is a stop of its own if one came first)."""
        assert self.gdb is not None
        self.gdb.interrupt()
        try:
            return _stop(self.gdb.recv(STEP_TIMEOUT_S))
        except TimeoutError:
            raise QemuError("QEMU did not stop when interrupted") from None

    def _in_waiti(self, thread: int) -> bool:
        """Whether that CPU sleeps in WAITI (its PC is just past the instruction)."""
        try:
            if self._g_thread != thread:
                self.select(thread)
                self._g_thread = thread
            return is_waiti(self.read((self.regs().pc - 3) & 0xFFFFFFFF, 3))
        except QemuError:
            return False

    def _skip_idle(self, to: float) -> None:
        """The CPUs sleep with no timer pending, so QEMU's clock stands still, and a stimulus is due at ``to``: the time until
        then passes for the board (the firmware's own clocks do not see it; it had nothing timed to see it with)."""
        gap = to - self.t
        if gap <= 0:
            return
        self._offset += gap
        self._ccount_offsets = {n: offset + gap for n, offset in self._ccount_offsets.items()}
        self.t = to
        self.skipped += gap

    def _on_watch(self, handler: Handler, stop: dict[str, Any], thread: int) -> None:
        kind, hit = stop["watch"]
        watch = next(((k, a, n) for k, a, n in WATCHES if k == kind and a <= hit < a + n), None)
        if watch is None:
            raise QemuError(f"QEMU reports a watchpoint the simulator did not set ({kind} at {hit:#x})")
        regs = self.regs()
        done = stop.get("ran")  # (the access, the registers before it): QEMU ran it itself, see _resolve_crossing
        insn, before = done if done else (self._access_at(thread, regs), regs)
        if insn.atomic:
            raise Unsupported("atomic_store", f"an atomic store (s32c1i) to a pin register at {regs.pc:#x} is not simulated", self.t)
        addr = (before.a(insn.base) + insn.offset) & 0xFFFFFFFF
        value = before.a(insn.reg) & ((1 << (8 * insn.width)) - 1)
        t = self.now(thread, regs, running=True)
        handler.on_tick(t)  # the stimuli due by now happen first: an access sees the board (and the interrupt status) as it is then
        self._ledc_events(handler)  # and so do the LEDC events (a fade that ended raised DUTY_CHNG_END before this access clears it)
        assert self.gdb is not None
        # QEMU's GPIO ignores stores and reads as 0, IO_MUX and RTC_IO are not modelled: the access is done here and the CPU goes on
        # after it without executing it (no single step, no removing and inserting the watchpoint: half the round trips)
        if insn.load:
            reg = addr & ~3
            if reg == RTC_GPIO_IN:
                raise Unsupported("rtc_gpio_input", "the firmware reads RTC_GPIO_IN (an input in RTC mode): not simulated", t)
            if reg in (GPIO_IN, GPIO_IN1):
                word = handler.gpio_in(t, 0 if reg == GPIO_IN else 1)
            elif reg == GPIO_STRAP:
                word = self.strap
            elif LEDC_BASE <= reg < LEDC_BASE + LEDC_SIZE:
                word = self.ledc.read(reg, t)
            elif SENS_BASE <= reg < SENS_BASE + SENS_SIZE:
                try:
                    word = self.adc.read(reg, t)
                except AdcUnsupported as exc:
                    raise Unsupported(exc.what, exc.detail, t) from None
            else:
                word = self.gpio.read(reg)
            loaded = (word >> ((addr & 3) * 8)) & ((1 << (8 * insn.width)) - 1)
            if insn.signed and loaded >> (8 * insn.width - 1) & 1:
                loaded -= 1 << (8 * insn.width)
            self.set_reg(regs.a_index(insn.reg), loaded)
            if not done:
                self._skip(regs, insn)
        else:
            if not done:
                self._skip(regs, insn)
            if LEDC_BASE <= addr < LEDC_BASE + LEDC_SIZE:
                if 0x140 <= (addr & ~3) - LEDC_BASE < 0x180 or (addr & ~3) - LEDC_BASE == 0x190:
                    self.ledc.apb_hz = self.apb_hz()  # a timer's clock: APB_CLK follows the CPU clock setup
                try:
                    channels = self.ledc.write(addr, value, insn.width, t)
                except LedcUnsupported as exc:
                    raise Unsupported(exc.what, exc.detail, t) from None
                if channels:
                    handler.on_ledc(t, channels)
                return
            if SENS_BASE <= addr < SENS_BASE + SENS_SIZE:
                hall = bool(self.gpio.rtcio.get(RTC_IO_HALL_SENS, 0) >> XPD_HALL & 1)
                try:
                    self.adc.write(addr, value, insn.width, t, lambda gpio: handler.adc_volts(t, gpio), hall)
                except AdcUnsupported as exc:
                    raise Unsupported(exc.what, exc.detail, t) from None
                return
            changed = self.gpio.write(addr, value, insn.width)
            if changed:
                handler.on_gpio(t, changed)

    def _access_at(self, thread: int, regs: Regs) -> MemInsn:
        """The load or store at the PC (QEMU stops before the access)."""
        key = (thread, regs.pc)
        insn = self._insns.get(key)
        if insn is None:
            code = self.read(regs.pc, 3)
            insn = decode_mem(code)
            if insn is None:
                raise QemuError(f"the instruction at {regs.pc:#x} ({code.hex()}) touched a pin register but is not a load or store the "
                                "simulator decodes")
            self._insns[key] = insn
        return insn

    def _resolve_crossing(self, stop: dict[str, Any]) -> dict[str, Any]:
        """An interruption can land as the CPU reaches a watched access and cross its watchpoint hit: QEMU then reports the
        interruption, keeps the hit pending, and would run the next watched access itself and stop just past it. So when an
        interruption finds the PC at a watched access, step that access: QEMU either stops before it (the usual watch stop) or
        runs it and stops past it, reporting the pending hit (the stop carries the access and the registers before it, and
        _on_watch puts its result right)."""
        if stop.get("exited") or stop["watch"] is not None or stop["signal"] == 5 or not self.watching:
            return stop
        thread = stop["thread"] or 1
        if self._g_thread != thread:
            self.select(thread)
            self._g_thread = thread
        regs = self.regs()
        insn = self._insns.get((thread, regs.pc)) or decode_mem(self.read(regs.pc, 3))
        if insn is None or not any(start <= (regs.a(insn.base) + insn.offset) & 0xFFFFFFFF < start + n for _, start, n in WATCHES):
            return stop
        stepped = self.step(thread)
        if stepped["watch"] is not None and self.regs().pc != regs.pc:
            stepped["ran"] = (insn, regs)
        return stepped

    def _skip(self, regs: Regs, insn: MemInsn) -> None:
        """Move the PC past an instruction the CPU did not execute, taking a zero-overhead loop's jump back as the CPU would."""
        pc = (regs.pc + insn.length) & 0xFFFFFFFF
        if pc == regs.w[G_LEND] and regs.w[G_LCOUNT] and not regs.w[G_PS] & PS_EXCM:
            self.set_reg(G_LCOUNT, regs.w[G_LCOUNT] - 1)
            pc = regs.w[G_LBEG]
        self.set_reg(G_PC, pc)

    def _on_break(self, handler: Handler, thread: int) -> None:
        regs = self.regs()
        if regs.pc == self.entry and regs.pc != RESET_VECTOR:  # the ROM starts the image: watch the pins from here
            self._watch(True)
            self._step_over(thread, regs.pc)
            return
        if regs.pc != RESET_VECTOR:
            if not is_break(self.read(regs.pc, 3)):
                return  # a debug stop QEMU still owed from a crossed watchpoint hit (see _resolve_crossing): nothing happened
            raise Unsupported("break", f"the firmware stopped at a breakpoint instruction at {regs.pc:#x} (a debugger break or a "
                                       "crash handler waiting for one)", self.t)
        assert self.gdb is not None
        self._insns.clear()
        if thread != 1:  # the second core starting: its cycle counter is anchored to the first core's, which is busy starting it
            if self.clock_kind != "rtc":
                self.now(1)
                self._ccount_offsets.pop(thread, None)
                self.now(thread, running=True)
            self.app_cpu_started = True
        else:
            state = 0
            try:
                state = self.read32(RTC_CNTL_RESET_STATE) & 0x3F
            except QemuError:
                pass
            cause = self._pending_reset or RESET_CAUSES.get(state, "unknown")
            scope = "power-on" if self._pending_reset else RESET_SCOPES.get(state, "system")
            if self.entry is not None:
                self._watch(False)  # until the ROM hands over to the image again
            t = self.t if self._pending_reset or self.clock_kind != "rtc" else self.now(thread, regs, running=True)
            self._pending_reset = None
            self._ccount_offsets = {1: t}  # the PRO CPU's cycle counter starts again; the APP CPU waits to be started again
            self.app_cpu_started = False
            self._raised.clear()  # the CPUs' pending interrupts start over: what is still due is raised again
            self.gpio.reset(scope)
            if scope != "cpu":
                self.ledc.reset()
            if scope in ("power-on", "rtc"):
                self.adc.reset()  # SENS is in the RTC domain, like RTC_IO: a system reset leaves it as it was
            self.resets.append((t, cause))
            handler.on_reset(t, cause, scope)
        self._step_over(thread, RESET_VECTOR)

    def _step_over(self, thread: int, addr: int) -> None:
        """Execute the instruction at a breakpoint of ours on ``thread`` and set the breakpoint again."""
        assert self.gdb is not None
        if self._g_thread != thread:
            self.select(thread)
            self._g_thread = thread
        self.gdb.ok(f"z0,{addr:x},3")
        try:
            self.step(thread)
        finally:
            self.gdb.ok(f"Z0,{addr:x},3")

    def _reset_chip(self, release: float) -> None:
        """The board held EN low: QEMU restarts the machine; its clock continues from ``release``."""
        assert self.gdb is not None
        self.gdb.rpc("qRcmd," + b"system_reset".hex())
        self.t = max(self.t, release)
        self._rtc_base = None
        self._ccount_offsets = {1: self.t}
        self.app_cpu_started = False
        self._pending_reset = "external"
        self._raised.clear()
        self.gpio.reset("power-on")
        self.ledc.reset()
        self.adc.reset()

    def _uart(self, handler: Handler) -> None:
        try:
            size = os.path.getsize(self.uart_path)
        except OSError:
            return
        if size <= self.uart_seen:
            return
        with open(self.uart_path, "rb") as fh:
            fh.seek(self.uart_seen)
            data = fh.read(size - self.uart_seen)
        self.uart_seen += len(data)
        text = self._uart_decoder.decode(data)
        room = UART_LIMIT - len(self.uart_text)
        self.uart_text += text[:max(0, room)]
        self.uart_truncated = self.uart_truncated or len(text) > room
        handler.on_uart(self.t, text)

    def _check_log(self) -> None:
        try:
            size = os.path.getsize(self.log_path)
        except OSError:
            return
        if size > LOG_LIMIT:
            names = sorted(self.unimplemented(tail=True))
            raise Unsupported("unimplemented_polling", "the firmware keeps accessing peripherals QEMU does not emulate (" + ", ".join(names) +
                              "): it waits for hardware that is not there", self.t)

    def unimplemented(self, tail: bool = False) -> dict[str, dict[str, int]]:
        """Peripherals the firmware touched that QEMU does not emulate (from its -d unimp log, the parts written while the image
        ran): ``{name: {reads, writes}}``. ``tail``: only the last megabyte (what the firmware does now)."""
        found: dict[str, dict[str, int]] = {}
        try:
            with open(self.log_path, "rb") as fh:
                size = os.path.getsize(self.log_path)
                chunks = []
                for begin, finish in self._log_spans:
                    finish = size if finish is None else finish
                    if tail:
                        begin = max(begin, size - (1 << 20))
                    if finish > begin:
                        fh.seek(begin)
                        chunks.append(fh.read(min(finish - begin, 8 << 20)))
        except OSError:
            return found
        data = b"".join(chunks).decode("utf-8", errors="replace")
        for m in re.finditer(r"^(\S+): unimplemented device (read|write)", data, re.M):
            name = m.group(1)
            if name in KEPT_STUBS:
                continue
            entry = found.setdefault(name, {"reads": 0, "writes": 0})
            entry["reads" if m.group(2) == "read" else "writes"] += 1
        unmapped = len(re.findall(r"^Invalid access at addr", data, re.M))
        if unmapped:
            found["unmapped addresses"] = {"reads": 0, "writes": 0, "accesses": unmapped}
        for part, counts in self.adc.other.items():  # the SENS block is watched: what the firmware did there beyond the ADCs
            found[f"esp32.sens ({part})"] = dict(counts)
        return found


# ---- what this QEMU offers ---------------------------------------------------------------------
_PROBES: dict[tuple[str, float], dict[str, Any]] = {}


def probe(qemu: str, timeout: float = 30.0) -> dict[str, Any]:
    """Measured once per QEMU binary: the ESP32 machine starts under gdb with the register layout the simulator knows, and how it
    reads the time: ``{"clock": "rtc", "rtc_hz"}`` when the RTC timer runs, else ``{"clock": "ccount"}``. The ROM runs on a blank
    flash (it keeps reporting the missing bootloader), which is enough to see both counters move."""
    key = (qemu, os.path.getmtime(qemu))
    if key in _PROBES:
        return _PROBES[key]
    deadline = time.monotonic() + timeout
    with tempfile.TemporaryDirectory(prefix="dshq") as tmp:
        image = os.path.join(tmp, "blank.bin")
        with open(image, "wb") as fh:
            fh.write(b"\xff" * FLASH_SIZES[0])
        machine = Machine(qemu, image, tmp, clock="ccount")
        try:
            machine.start(deadline, watch=False)
            assert machine.gdb is not None
            samples = []
            for _ in range(3):
                machine.gdb.send("vCont;c" if machine.vcont else "c")
                time.sleep(0.1)
                machine.gdb.interrupt()
                stop = _stop(machine.gdb.recv(STEP_TIMEOUT_S))
                thread = stop["thread"] or 1
                machine._g_thread = thread
                rtc = None
                try:
                    rtc = machine.read_rtc()
                except QemuError:
                    pass
                cycles = None
                try:
                    cycles = machine.ccount(1)  # only the PRO CPU runs the ROM
                except QemuError:
                    pass
                samples.append((rtc, cycles, machine.cpu_hz()))
        finally:
            machine.close()
    (r1, c1, hz1), (r2, c2, hz2) = samples[1], samples[2]
    result: dict[str, Any] = {"clock": None}
    ccount_ok = c1 is not None and c2 is not None and c2 > c1
    if r1 is not None and r2 is not None and r2 > r1 > (samples[0][0] or 0):
        rtc_hz = (r2 - r1) / ((c2 - c1) / hz2) if ccount_ok and hz1 == hz2 else RTC_SLOW_HZ  # type: ignore[operator]
        result = {"clock": "rtc", "rtc_hz": rtc_hz if 1e3 < rtc_hz < 1e8 else RTC_SLOW_HZ}
    elif ccount_ok:
        result = {"clock": "ccount"}
    else:
        raise QemuError("this QEMU's ESP32 machine gives the simulator no way to read the time (neither the RTC timer nor the cycle counter moved)")
    _PROBES[key] = result
    return result


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(prog="esp32qemu.py", description="Download Espressif's QEMU (ESP32) for dsh-kicad.")
    sub = parser.add_subparsers(dest="command", required=True)
    get = sub.add_parser("download", help=f"download QEMU {RELEASE['version']} (verified by SHA-256)")
    get.add_argument("--dir", default=None, help=f"target directory (default {data_dir()})")
    opts = parser.parse_args(argv)
    try:
        download(opts.dir)
    except (OSError, QemuError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
