"""Find, run and fetch the Freerouting autorouter (https://github.com/freerouting/freerouting).

Freerouting (GPL-3.0) is a Java program: it reads a Specctra design (.dsn) and writes a session (.ses) with the routes.
The sidecar only runs it as a separate process; nothing of it ships with dsh-kicad. ``doctor`` reports whether Java and
Freerouting are here, and the KiCad bridge downloads the pinned release jar into the user's data directory only after
the user confirmed it (``/kicad-install freerouting`` runs ``python freerouting.py download``).

This module imports nothing from the sidecar, so that download step can run it as a plain script.
"""

from __future__ import annotations

import hashlib
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
import zipfile
from dataclasses import dataclass, field
from typing import Any, Callable

__all__ = ["RELEASE", "Cancelled", "FreeroutingError", "Router", "data_dir", "download", "locate", "run"]

# The release the bridge downloads. Its jar is compiled for Java 25 (class file version 69); 2.5.0 also stops
# auto-routing on its own when the score no longer improves. The native "freerouting-cli" builds of 2.5.0 crash
# (GraalVM serialization) on KiCad's DSN files, so the jar is the supported form.
RELEASE = {
    "version": "2.5.0",
    "url": "https://github.com/freerouting/freerouting/releases/download/v2.5.0/freerouting-2.5.0.jar",
    "sha256": "f6f51bb02245e8e717f9359bd260cc9c5c0b1bc0acc8b7cb2cd5b8ffeb5de3c7",
    "size": 64599107,
    "java": 25,
}
HOMEPAGE = "https://github.com/freerouting/freerouting"
JAVA_URL = "https://adoptium.net/temurin/releases/?package=jre"
MIN_VERSION = (2, 0)
KILL_GRACE = 60.0  # seconds past the time limit before a Freerouting that did not stop itself is killed
# Headless, quiet, and nothing KiCad's DRC rejects: neck-down and SMD fan-out make tracks narrower than the net
# class width (and add vias for every SMD pad).
FLAGS = ["--gui.enabled=false", "--usage_and_diagnostic_data.disable_analytics=true", "--profile.allow_telemetry=false",
         "--router.automatic_neckdown=false", "--router.fanout.enabled=false"]


class FreeroutingError(RuntimeError):
    pass


class Cancelled(FreeroutingError):
    pass


def data_dir() -> str:
    """Per-user directory for the downloaded jar (no root needed)."""
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or os.path.join(os.path.expanduser("~"), "AppData", "Local")
    elif sys.platform == "darwin":
        base = os.path.join(os.path.expanduser("~"), "Library", "Application Support")
    else:
        base = os.environ.get("XDG_DATA_HOME") or os.path.join(os.path.expanduser("~"), ".local", "share")
    return os.path.join(base, "dsh-kicad", "freerouting")


def _version_tuple(text: str | None) -> tuple[int, ...] | None:
    m = re.search(r"(\d+)\.(\d+)(?:\.(\d+))?", text or "")
    return tuple(int(g) for g in m.groups() if g is not None) if m else None


def jar_version(path: str) -> str | None:
    m = re.search(r"freerouting(?:-executable)?-(\d+\.\d+(?:\.\d+)?)", os.path.basename(path))
    return m.group(1) if m else None


def jar_java(path: str) -> int | None:
    """The Java release a jar needs, from the class file version of its main class (69 → Java 25)."""
    try:
        with zipfile.ZipFile(path) as jar:
            head = jar.read("app/freerouting/Freerouting.class")[:8]
    except (OSError, KeyError, zipfile.BadZipFile):
        return None
    return int.from_bytes(head[6:8], "big") - 44 if head[:4] == b"\xca\xfe\xba\xbe" else None


_JAVA_CACHE: dict[tuple[str, float], tuple[int, ...] | None] = {}


def java_version(java: str) -> tuple[int, ...] | None:
    """``java -version`` → (25, 0, 4); Java 8 style "1.8.0_402" → (8, 0, 402)."""
    try:
        key = (java, os.path.getmtime(java))
    except OSError:
        key = (java, 0.0)
    if key not in _JAVA_CACHE:
        try:
            proc = subprocess.run([java, "-version"], capture_output=True, text=True, timeout=30)
            text = proc.stderr + proc.stdout
        except (OSError, subprocess.TimeoutExpired):
            text = ""
        m = re.search(r'version "(\d+)(?:\.(\d+))?(?:\.(\d+))?', text)
        if m:
            parts = [int(g) for g in m.groups() if g is not None]
            if parts[0] == 1 and len(parts) > 1:  # 1.8.0 → 8
                parts = parts[1:]
            _JAVA_CACHE[key] = tuple(parts)
        else:
            _JAVA_CACHE[key] = None
    return _JAVA_CACHE[key]


@dataclass
class Router:
    """Where Freerouting is and how to start it. ``argv`` is None when it cannot run here (see ``problems``)."""

    argv: list[str] | None = None
    jar: str | None = None
    executable: str | None = None
    java: str | None = None
    java_version: tuple[int, ...] | None = None
    java_required: int | None = None
    java_problems: list[str] = field(default_factory=list)
    version: str | None = None
    source: str | None = None
    problems: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.argv is not None

    def describe(self) -> str:
        what = f"Freerouting {self.version or '(unknown version)'}"
        if self.executable:
            return f"{what}: {self.executable}"
        return f"{what}: {self.jar} with Java {'.'.join(map(str, self.java_version or ())) or '?'} ({self.java})"


def _find_java(explicit: str | None) -> tuple[str | None, str | None, list[str]]:
    problems: list[str] = []
    if explicit:
        path = shutil.which(explicit) or (explicit if os.path.isfile(explicit) else None)
        if path:
            return path, "setting", problems
        problems.append(f"the KiCad bridge 'java' setting points to {explicit}, which does not exist")
    home = os.environ.get("JAVA_HOME")
    if home:
        path = os.path.join(home, "bin", "java.exe" if sys.platform == "win32" else "java")
        if os.path.isfile(path):
            return path, "JAVA_HOME", problems
    path = shutil.which("java")
    return (path, "PATH", problems) if path else (None, None, problems)


def _find_freerouting(explicit: str | None) -> tuple[str | None, str | None, list[str]]:
    problems: list[str] = []
    for value, source in ((explicit, "setting"), (os.environ.get("FREEROUTING_JAR"), "FREEROUTING_JAR")):
        if not value:
            continue
        path = os.path.expanduser(value)
        if os.path.isfile(path):
            return path, source, problems
        found = shutil.which(value)
        if found:
            return found, source, problems
        problems.append(f"the {'KiCad bridge freerouting setting' if source == 'setting' else '$FREEROUTING_JAR variable'} "
                        f"points to {value}, which does not exist")
    folder = data_dir()
    try:
        jars = [os.path.join(folder, n) for n in os.listdir(folder) if n.startswith("freerouting") and n.endswith(".jar")]
    except OSError:
        jars = []
    if jars:
        best = max(jars, key=lambda p: _version_tuple(jar_version(p)) or (0,))
        return best, "downloaded", problems
    return None, None, problems


def locate(java: str | None = None, freerouting: str | None = None) -> Router:
    """Find Freerouting: the bridge setting (a jar, or a native ``freerouting`` executable), ``$FREEROUTING_JAR``, then
    the jar ``/kicad-install freerouting`` downloaded. A jar also needs a Java at least as new as the one it was
    compiled for: the bridge's ``java`` setting, ``$JAVA_HOME``, then ``java`` on PATH."""
    path, source, problems = _find_freerouting(freerouting)
    router = Router(source=source, problems=problems)
    router.java, _, router.java_problems = _find_java(java)  # always: the doctor reports Java before Freerouting is installed
    router.java_version = java_version(router.java) if router.java else None
    if path is None:
        return router
    if not path.lower().endswith(".jar"):
        router.executable, router.version = path, jar_version(path)
        router.argv = [path]
        return router
    router.jar = path
    router.version = jar_version(path)
    router.java_required = jar_java(path) or (RELEASE["java"] if router.version == RELEASE["version"] else None)
    version = _version_tuple(router.version)
    if version is not None and version < MIN_VERSION:
        problems.append(f"{os.path.basename(path)} is older than Freerouting {'.'.join(map(str, MIN_VERSION))}; "
                        f"the headless options need {'.'.join(map(str, MIN_VERSION))}+")
        return router
    problems += router.java_problems
    if router.java is None:
        problems.append("Java was not found (Freerouting is a Java program)")
        return router
    if router.java_version is None:
        problems.append(f"{router.java} does not run (`java -version` failed)")
        return router
    if router.java_required and router.java_version[0] < router.java_required:
        problems.append(f"Freerouting {router.version or ''} needs Java {router.java_required}+, but {router.java} is "
                        f"Java {'.'.join(map(str, router.java_version))}".replace("  ", " "))
        return router
    router.argv = [router.java, "-Djava.awt.headless=true", "-jar", path]
    return router


# ---- running -----------------------------------------------------------------------------

_PASS = re.compile(r"Auto-routing pass #(\d+).*?\((\d+) unrouted")
_OPT = re.compile(r"Optimizer pass #(\d+)")
_STARTED = re.compile(r"started with (\d+) unrouted")
_DONE = re.compile(r"Auto-routing stage completed.*?\((\d+) unrouted")
_STATE = re.compile(r"finished with state: (\w+)")
_VERSION = re.compile(r"Freerouting(?: CLI)? v(\d[\w.\-]*)")

Progress = Callable[[float, "float | None", str], None]


@dataclass
class RunResult:
    returncode: int | None
    elapsed: float
    log: list[str]
    version: str | None = None
    state: str | None = None
    started: int | None = None
    unrouted: int | None = None
    passes: int = 0
    optimizer_passes: int = 0
    timed_out: bool = False

    def summary(self) -> dict[str, Any]:
        return {"version": self.version, "state": self.state, "passes": self.passes, "optimizer_passes": self.optimizer_passes,
                "unrouted_before": self.started, "unrouted": self.unrouted, "seconds": round(self.elapsed, 1),
                "timed_out": self.timed_out}


def _clock(seconds: float) -> str:
    seconds = max(1, int(seconds))
    return f"{seconds // 3600:02d}:{seconds % 3600 // 60:02d}:{seconds % 60:02d}"


def run(router: Router, dsn: str, ses: str, passes: int | None = None, timeout: float = 300,
        cancel: threading.Event | None = None, progress: Progress | None = None, log_path: str | None = None) -> RunResult:
    """Route ``dsn`` into ``ses``. Freerouting stops itself at ``timeout`` and still writes its best routes; it is
    killed if it overruns by a minute, and at once when ``cancel`` is set (then :class:`Cancelled` is raised and no
    session is left behind)."""
    if not router.ok:
        raise FreeroutingError("Freerouting cannot run here: " + "; ".join(router.problems or ["not installed"]))
    if os.path.exists(ses):
        os.unlink(ses)
    argv = [*router.argv, "-de", dsn, "-do", ses, *FLAGS, f"--router.job_timeout={_clock(timeout)}"]  # type: ignore[misc]
    if passes:
        argv.append(f"--router.autorouter.max_passes={int(passes)}")
    result = RunResult(None, 0.0, [])
    start = time.monotonic()
    try:
        proc = subprocess.Popen(argv, cwd=os.path.dirname(os.path.abspath(dsn)), stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
    except OSError as exc:
        raise FreeroutingError(f"Freerouting could not be started ({exc}); run kicad_doctor to check Java and Freerouting") from exc

    def read() -> None:
        assert proc.stdout is not None
        for raw in proc.stdout:
            line = raw.rstrip()
            result.log.append(line)
            if m := _VERSION.search(line):
                result.version = result.version or m.group(1)
            if m := _STARTED.search(line):
                result.started = result.started if result.started is not None else int(m.group(1))
            if m := _PASS.search(line):
                result.passes, result.unrouted = int(m.group(1)), int(m.group(2))
                if progress:
                    progress(float(result.passes), float(passes) if passes else None,
                             f"routing pass {result.passes}: {result.unrouted} unrouted")
            elif m := _OPT.search(line):
                result.optimizer_passes = max(result.optimizer_passes, int(m.group(1)))
                if progress and "completed" in line:
                    progress(float(result.passes + result.optimizer_passes), None, f"optimizing, pass {result.optimizer_passes}")
            if m := _DONE.search(line):
                result.unrouted = int(m.group(1))
            if m := _STATE.search(line):
                result.state = m.group(1)

    reader = threading.Thread(target=read, daemon=True)
    reader.start()
    deadline = start + timeout + KILL_GRACE
    try:
        while proc.poll() is None:
            if cancel is not None and cancel.is_set():
                _stop(proc)
                raise Cancelled("autorouting was cancelled; the board was not changed")
            if time.monotonic() > deadline:
                result.timed_out = True
                _stop(proc)
                break
            time.sleep(0.1)
    finally:
        if proc.poll() is None:
            _stop(proc)
        reader.join(timeout=5)
        result.elapsed = time.monotonic() - start
        result.returncode = proc.returncode
        if log_path:
            with open(log_path, "w", encoding="utf-8") as fh:
                fh.write("$ " + " ".join(argv) + "\n" + "\n".join(result.log) + "\n")
    if result.state == "TIMED_OUT":
        result.timed_out = True
    if not os.path.isfile(ses):
        tail = "\n".join(line for line in result.log[-15:] if line.strip())
        hint = ""
        if "UnsupportedClassVersionError" in tail:
            hint = f" Freerouting needs a newer Java (Java {router.java_required or RELEASE['java']}+); run kicad_doctor."
        why = "it was stopped after the time limit" if result.timed_out else f"it exited with {result.returncode}"
        raise FreeroutingError(f"Freerouting wrote no session ({why}).{hint}\n{tail}")
    return result


def _stop(proc: subprocess.Popen) -> None:
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=5)


# ---- downloading ---------------------------------------------------------------------------

def download(folder: str | None = None, release: dict[str, Any] = RELEASE, out=sys.stdout) -> str:
    """Fetch the pinned release jar into ``folder`` (default :func:`data_dir`), check its size and SHA-256, and only
    then move it into place. Returns the jar's path."""
    folder = folder or data_dir()
    os.makedirs(folder, exist_ok=True)
    target = os.path.join(folder, os.path.basename(release["url"]))
    if os.path.isfile(target) and _sha256(target) == release["sha256"]:
        print(f"Freerouting {release['version']} is already in {target}", file=out)
        return target
    part = target + ".part"
    digest = hashlib.sha256()
    size, shown = 0, -1
    print(f"Downloading {release['url']} ({release['size'] / 1e6:.1f} MB)", file=out, flush=True)
    request = urllib.request.Request(release["url"], headers={"User-Agent": "dsh-kicad"})
    try:
        with urllib.request.urlopen(request, timeout=60) as response, open(part, "wb") as fh:
            while chunk := response.read(1 << 16):
                fh.write(chunk)
                digest.update(chunk)
                size += len(chunk)
                percent = size * 100 // max(1, release["size"])
                if percent // 10 != shown:
                    shown = percent // 10
                    print(f"{min(percent, 100)}% ({size / 1e6:.1f} MB)", file=out, flush=True)
        if size != release["size"] or digest.hexdigest() != release["sha256"]:
            raise FreeroutingError(f"the download does not match the published checksum (got {size} bytes, sha256 "
                                   f"{digest.hexdigest()}); nothing was installed")
        os.replace(part, target)
    finally:
        if os.path.exists(part):
            os.unlink(part)
    print(f"Freerouting {release['version']} installed: {target} (sha256 verified)", file=out)
    return target


def _sha256(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        while chunk := fh.read(1 << 20):
            digest.update(chunk)
    return digest.hexdigest()


def download_command(folder: str | None = None) -> list[str]:
    """The install step the doctor offers: this file run as a script by the sidecar's own Python (``-I``: nothing
    from the working directory or the user's site-packages is imported)."""
    return [sys.executable, "-I", os.path.abspath(__file__), "download", "--dir", folder or data_dir()]


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(prog="freerouting.py", description="Download the Freerouting autorouter for dsh-kicad.")
    sub = parser.add_subparsers(dest="command", required=True)
    get = sub.add_parser("download", help=f"download Freerouting {RELEASE['version']} (verified by SHA-256)")
    get.add_argument("--dir", default=None, help=f"target directory (default {data_dir()})")
    opts = parser.parse_args(argv)
    try:
        download(opts.dir)
    except (OSError, FreeroutingError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
