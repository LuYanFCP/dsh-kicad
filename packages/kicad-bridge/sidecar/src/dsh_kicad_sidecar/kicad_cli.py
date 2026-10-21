"""Thin, typed wrapper around ``kicad-cli``. Every verdict (ERC, DRC) comes from KiCad itself."""

from __future__ import annotations

import csv
import glob
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from collections import Counter
from typing import Any

__all__ = ["KiCadCli", "KiCadCliError", "find_kicad_cli", "locate_kicad_cli", "parse_version", "svg_to_png", "MIN_KICAD"]


class KiCadCliError(RuntimeError):
    pass


FLATPAK_APP = "org.kicad.KiCad"


def flatpak_argv(flatpak: str) -> list[str]:
    """kicad-cli inside the Flatpak; the sandbox gets the host files and /tmp (kicad-cli writes reports there)."""
    return [flatpak, "run", "--filesystem=host", "--filesystem=/tmp", "--command=kicad-cli", FLATPAK_APP]


def install_dirs() -> list[str]:
    """Places installers put kicad-cli that are often missing from PATH (GUI-started processes, services)."""
    home = os.path.expanduser("~")
    local = os.environ.get("LOCALAPPDATA", os.path.join(home, "AppData", "Local"))
    return [
        "/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli",
        os.path.join(home, "Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli"),
        *sorted(glob.glob(r"C:\Program Files\KiCad\*\bin\kicad-cli.exe"), reverse=True),
        *sorted(glob.glob(os.path.join(local, "Programs", "KiCad", "*", "bin", "kicad-cli.exe")), reverse=True),
        "/snap/bin/kicad.kicad-cli",
    ]


def locate_kicad_cli(explicit: str | None = None) -> tuple[list[str] | None, str | None, list[str]]:
    """Find kicad-cli. Returns ``(argv, source, problems)``.

    ``source`` is one of ``setting``, ``env``, ``path``, ``install_dir``, ``flatpak``; ``problems`` lists
    configured candidates that do not exist (the search then continues, so a stale setting is reported, not fatal).
    """
    problems: list[str] = []
    for candidate, source in ((explicit, "setting"), (os.environ.get("KICAD_CLI"), "env")):
        if candidate:
            if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
                return [candidate], source, problems
            found = shutil.which(candidate)
            if found:
                return [found], source, problems
            problems.append(f"{'the kicadCli setting' if source == 'setting' else '$KICAD_CLI'} points to {candidate!r}, which is not an executable")
    found = shutil.which("kicad-cli")
    if found:
        return [found], "path", problems
    for path in install_dirs():
        if os.path.isfile(path):
            return [path], "install_dir", problems
    flatpak = shutil.which("flatpak")
    if flatpak and sys.platform.startswith("linux"):
        try:
            probe = subprocess.run([flatpak, "info", FLATPAK_APP], capture_output=True, text=True, timeout=30)
        except (OSError, subprocess.TimeoutExpired):
            probe = None
        if probe is not None and probe.returncode == 0:
            return flatpak_argv(flatpak), "flatpak", problems
    return None, None, problems


def find_kicad_cli(explicit: str | None = None) -> list[str] | None:
    """Return the argv prefix that runs kicad-cli, or None."""
    return locate_kicad_cli(explicit)[0]


def parse_version(text: str | None) -> tuple[int, ...] | None:
    """``"10.0.7"`` (or any text containing a dotted version) → ``(10, 0, 7)``."""
    match = re.search(r"(\d+)\.(\d+)(?:\.(\d+))?", text or "")
    return tuple(int(g) for g in match.groups() if g is not None) if match else None


MIN_KICAD = (8, 0)


def _clean_stderr(text: str) -> str:
    # KiCad builds print wx debug asserts on stderr; keep only meaningful lines.
    lines = [ln for ln in text.splitlines() if "assert" not in ln and ln.strip()]
    return "\n".join(lines[-20:])


class KiCadCli:
    def __init__(self, executable: str | None = None, timeout: float = 180.0):
        self.executable = executable
        self.timeout = timeout
        self._version: str | None = None
        self.argv: list[str] | None = None
        self.source: str | None = None
        self.problems: list[str] = []
        self.locate()

    def locate(self) -> list[str] | None:
        """(Re)run the search, e.g. after KiCad was installed while the sidecar was running."""
        argv, self.source, self.problems = locate_kicad_cli(self.executable)
        if argv != self.argv:
            self._version = None
        self.argv = argv
        return argv

    @property
    def available(self) -> bool:
        return self.argv is not None

    def _require(self) -> list[str]:
        if self.argv is None and self.locate() is None:
            from .doctor import install_hint  # deferred: doctor imports this module

            raise KiCadCliError(missing_message(self.problems, install_hint()))
        return self.argv  # type: ignore[return-value]

    def run(self, *args: str, cwd: str | None = None, check: bool = True) -> subprocess.CompletedProcess:
        argv = [*self._require(), *args]
        try:
            proc = subprocess.run(argv, cwd=cwd, capture_output=True, text=True, timeout=self.timeout)
        except subprocess.TimeoutExpired as exc:
            raise KiCadCliError(f"kicad-cli timed out after {self.timeout}s: {' '.join(args[:3])}") from exc
        except OSError as exc:
            # The binary vanished (uninstalled) or is not runnable: search again next time.
            self.argv = None
            raise KiCadCliError(f"kicad-cli could not be started ({exc}). Run /kicad-doctor (or the kicad_doctor tool) to check the installation.") from exc
        if check and proc.returncode != 0:
            message = f"kicad-cli {' '.join(args[:3])} failed ({proc.returncode}): {_clean_stderr(proc.stderr + proc.stdout)}"
            if args and args[0] != "version":
                version = parse_version(self.version_or_none())
                if version is not None and version < MIN_KICAD:
                    message += (f"\nThis kicad-cli is KiCad {self.version_or_none()}; the KiCad tools need KiCad "
                                f"{MIN_KICAD[0]} or newer. Run /kicad-doctor (or the kicad_doctor tool) for upgrade options.")
            raise KiCadCliError(message)
        return proc

    def version(self) -> str | None:
        if self.argv is None and self.locate() is None:
            return None
        if self._version is None:
            self._version = self.run("version").stdout.strip()
        return self._version

    def version_or_none(self) -> str | None:
        try:
            return self.version()
        except KiCadCliError:
            return None

    # ---- checks --------------------------------------------------------------------
    def erc(self, schematic: str, severity: str = "all") -> dict[str, Any]:
        with tempfile.TemporaryDirectory(prefix="dsh-kicad-erc-") as tmp:
            out = os.path.join(tmp, "erc.json")
            sev = {"all": "--severity-all", "error": "--severity-error", "warning": "--severity-warning"}[severity]
            # Exit code is non-zero when violations exist only with --exit-code-violations; never pass it.
            self.run("sch", "erc", "--format", "json", "--units", "mm", sev, "-o", out, schematic, cwd=os.path.dirname(schematic))
            with open(out, encoding="utf-8") as fh:
                report = json.load(fh)
        return normalize_report(report, "erc")

    def drc(self, board: str, severity: str = "all", schematic_parity: bool = False) -> dict[str, Any]:
        with tempfile.TemporaryDirectory(prefix="dsh-kicad-drc-") as tmp:
            out = os.path.join(tmp, "drc.json")
            sev = {"all": "--severity-all", "error": "--severity-error", "warning": "--severity-warning"}[severity]
            args = ["pcb", "drc", "--format", "json", "--units", "mm", sev, "-o", out]
            if schematic_parity:
                args.append("--schematic-parity")
            self.run(*args, board, cwd=os.path.dirname(board))
            with open(out, encoding="utf-8") as fh:
                report = json.load(fh)
        return normalize_report(report, "drc")

    # ---- exports -------------------------------------------------------------------
    def netlist(self, schematic: str) -> dict[str, Any]:
        with tempfile.TemporaryDirectory(prefix="dsh-kicad-net-") as tmp:
            out = os.path.join(tmp, "net.xml")
            self.run("sch", "export", "netlist", "--format", "kicadxml", "-o", out, schematic, cwd=os.path.dirname(schematic))
            with open(out, encoding="utf-8") as fh:
                return parse_netlist_xml(fh.read())

    def export_netlist_file(self, schematic: str, output: str, fmt: str = "kicadsexpr") -> str:
        self.run("sch", "export", "netlist", "--format", fmt, "-o", output, schematic, cwd=os.path.dirname(schematic))
        return output

    def bom(self, schematic: str, fields: str = "Reference,Value,Footprint,${QUANTITY},${DNP}",
            labels: str = "Refs,Value,Footprint,Qty,DNP", group_by: str = "Value,Footprint",
            exclude_dnp: bool = False, output: str | None = None) -> dict[str, Any]:
        with tempfile.TemporaryDirectory(prefix="dsh-kicad-bom-") as tmp:
            out = output or os.path.join(tmp, "bom.csv")
            args = ["sch", "export", "bom", "-o", out, "--fields", fields, "--labels", labels, "--group-by", group_by]
            if exclude_dnp:
                args.append("--exclude-dnp")
            self.run(*args, schematic, cwd=os.path.dirname(schematic))
            with open(out, encoding="utf-8") as fh:
                text = fh.read()
        rows = list(csv.DictReader(io.StringIO(text)))
        return {"columns": labels.split(","), "rows": rows, "csv": text, **({"output": output} if output else {})}

    def export_sch_svg(self, schematic: str, output_dir: str, black_and_white: bool = False,
                       exclude_drawing_sheet: bool = False, theme: str | None = None, pages: str | None = None) -> list[str]:
        os.makedirs(output_dir, exist_ok=True)
        before = set(glob.glob(os.path.join(output_dir, "*.svg")))
        args = ["sch", "export", "svg", "-o", output_dir]
        if black_and_white:
            args.append("--black-and-white")
        if exclude_drawing_sheet:
            args.append("--exclude-drawing-sheet")
        if theme:
            args += ["--theme", theme]
        if pages:
            args += ["--pages", pages]
        self.run(*args, schematic, cwd=os.path.dirname(schematic))
        files = sorted(glob.glob(os.path.join(output_dir, "*.svg")))
        fresh = [f for f in files if f not in before] or files
        return sorted(fresh, key=lambda f: (os.path.basename(f) != os.path.splitext(os.path.basename(schematic))[0] + ".svg", f))

    def export_pcb_svg(self, board: str, output: str, layers: str = "F.Cu,B.Cu,F.SilkS,B.SilkS,Edge.Cuts,F.Fab",
                       black_and_white: bool = False) -> str:
        os.makedirs(os.path.dirname(output), exist_ok=True)
        args = ["pcb", "export", "svg", "--mode-single", "--layers", layers, "--page-size-mode", "2", "--exclude-drawing-sheet", "-o", output]
        if black_and_white:
            args.append("--black-and-white")
        self.run(*args, board, cwd=os.path.dirname(board))
        return output

    def export_pdf(self, path: str, output: str) -> str:
        kind = "pcb" if path.endswith(".kicad_pcb") else "sch"
        args = [kind, "export", "pdf", "-o", output]
        if kind == "pcb":
            args += ["--layers", "F.Cu,B.Cu,F.SilkS,B.SilkS,Edge.Cuts"]
        self.run(*args, path, cwd=os.path.dirname(path))
        return output

    def upgrade(self, path: str) -> None:
        kind = "pcb" if path.endswith(".kicad_pcb") else "sch"
        self.run(kind, "upgrade", "--force", path, cwd=os.path.dirname(path))


def missing_message(problems: list[str], hint: str) -> str:
    lead = "KiCad is not installed or kicad-cli was not found (KiCad 8+ is required)."
    tail = "Then run /kicad-doctor (or the kicad_doctor tool) to check again; no restart is needed."
    return " ".join([lead, *(p[0].upper() + p[1:] + "." for p in problems), hint, tail])


# ---- report shaping -------------------------------------------------------------------

def normalize_report(report: dict[str, Any], kind: str) -> dict[str, Any]:
    """Flatten KiCad's ERC/DRC JSON into one violation list with counts."""
    violations: list[dict[str, Any]] = []

    def take(items: list[dict], sheet: str | None, bucket: str | None = None) -> None:
        for v in items or []:
            entry = {
                "severity": v.get("severity", "error"),
                "type": v.get("type", ""),
                "description": v.get("description", ""),
                "items": [
                    {k: it[k] for k in ("description", "pos", "uuid") if k in it} for it in v.get("items", [])
                ],
            }
            if v.get("excluded"):
                entry["excluded"] = True
            if sheet is not None:
                entry["sheet"] = sheet
            if bucket:
                entry["category"] = bucket
            violations.append(entry)

    if kind == "erc":
        for sheet in report.get("sheets", []):
            take(sheet.get("violations", []), sheet.get("path"))
    else:
        take(report.get("violations", []), None)
        take(report.get("unconnected_items", []), None, "unconnected")
        take(report.get("schematic_parity", []), None, "schematic_parity")
    active = [v for v in violations if not v.get("excluded")]
    counts = Counter(v["severity"] for v in active)
    by_type = Counter(v["type"] for v in active)
    return {
        "kind": kind,
        "source": report.get("source"),
        "kicad_version": report.get("kicad_version"),
        "coordinate_units": report.get("coordinate_units", "mm"),
        "passed": counts.get("error", 0) == 0,
        "counts": {"error": counts.get("error", 0), "warning": counts.get("warning", 0),
                   "exclusion": len(violations) - len(active), "total": len(active)},
        "by_type": dict(by_type.most_common()),
        "violations": violations,
    }


def parse_netlist_xml(text: str) -> dict[str, Any]:
    root = ET.fromstring(text)
    components = []
    for comp in root.iterfind("./components/comp"):
        libsource = comp.find("libsource")
        components.append({
            "reference": comp.get("ref"),
            "value": (comp.findtext("value") or ""),
            "footprint": (comp.findtext("footprint") or ""),
            "lib_id": f"{libsource.get('lib')}:{libsource.get('part')}" if libsource is not None else "",
            "sheet": (comp.find("sheetpath").get("names") if comp.find("sheetpath") is not None else "/"),
        })
    nets = []
    for net in root.iterfind("./nets/net"):
        nodes = [
            {k: v for k, v in (("ref", n.get("ref")), ("pin", n.get("pin")), ("pin_function", n.get("pinfunction")),
                               ("pin_type", n.get("pintype"))) if v}
            for n in net.iterfind("node")
        ]
        nets.append({"name": net.get("name"), "code": int(net.get("code") or 0), "nodes": nodes})
    return {"components": components, "nets": nets}


def svg_to_png(svg_path: str, png_path: str, width: int = 2000) -> str:
    """Rasterize with cairosvg, rsvg-convert, ImageMagick or Inkscape — whichever exists."""
    try:
        import cairosvg  # type: ignore

        cairosvg.svg2png(url=svg_path, write_to=png_path, output_width=width, background_color="white")
        return png_path
    except ImportError:
        pass
    tools = [
        ("rsvg-convert", lambda exe: [exe, "-w", str(width), "-b", "white", "-o", png_path, svg_path]),
        ("magick", lambda exe: [exe, "-density", "150", "-background", "white", "-flatten", svg_path, "-resize", f"{width}x", png_path]),
        ("convert", lambda exe: [exe, "-density", "150", "-background", "white", "-flatten", svg_path, "-resize", f"{width}x", png_path]),
        ("inkscape", lambda exe: [exe, svg_path, "--export-type=png", f"--export-filename={png_path}", f"--export-width={width}", "--export-background=white"]),
    ]
    errors = []
    for name, build in tools:
        exe = shutil.which(name)
        if not exe:
            continue
        proc = subprocess.run(build(exe), capture_output=True, text=True, timeout=120)
        if proc.returncode == 0 and os.path.isfile(png_path):
            return png_path
        errors.append(f"{name}: {proc.stderr.strip()[-200:]}")
    raise KiCadCliError("no SVG rasterizer available (install the 'png' extra, rsvg-convert, or ImageMagick)"
                        + (f"; failures: {'; '.join(errors)}" if errors else ""))
