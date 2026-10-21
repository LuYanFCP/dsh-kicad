"""Local environment check ("doctor") and per-platform KiCad install plans.

Every check reports a status (``ok`` / ``warn`` / ``error``), what was found and,
when something is wrong, how to fix it. Install plans are data: the dsh bridge
runs a plan only after the user confirmed it, and never one that needs root.
"""

from __future__ import annotations

import shlex
import shutil
import sys
from typing import Any, Callable

from . import __version__
from .footprints import default_footprint_dirs
from .kicad_cli import FLATPAK_APP, MIN_KICAD, KiCadCli, parse_version
from .symbols import default_symbol_dirs

__all__ = ["MIN_PYTHON", "platform_info", "install_options", "install_hint", "run_doctor"]

MIN_PYTHON = (3, 10)
DOWNLOAD_URL = "https://www.kicad.org/download/"
FLATHUB = "https://dl.flathub.org/repo/flathub.flatpakrepo"
UBUNTU_PPA = "ppa:kicad/kicad-10.0-releases"

Which = Callable[[str], "str | None"]


def platform_info(os_release: str = "/etc/os-release", system: str | None = None) -> dict[str, Any]:
    """``{"os": linux|macos|windows|other, "distro", "distro_like", "name", "version"}``."""
    system = system or sys.platform
    kind = "linux" if system.startswith("linux") else "macos" if system == "darwin" else "windows" if system in ("win32", "cygwin") else "other"
    info: dict[str, Any] = {"os": kind, "distro": None, "distro_like": [], "name": None, "version": None}
    if kind == "linux":
        fields: dict[str, str] = {}
        try:
            with open(os_release, encoding="utf-8") as fh:
                for line in fh:
                    key, sep, value = line.strip().partition("=")
                    if sep:
                        fields[key] = value.strip().strip('"').strip("'")
        except OSError:
            pass
        info.update(distro=(fields.get("ID") or "").lower() or None, distro_like=(fields.get("ID_LIKE") or "").lower().split(),
                    name=fields.get("PRETTY_NAME") or fields.get("NAME"), version=fields.get("VERSION_ID"))
    return info


def _family(info: dict[str, Any]) -> str | None:
    ids = [info.get("distro") or "", *info.get("distro_like", [])]
    for family, members in (("ubuntu", ("ubuntu", "pop", "linuxmint", "elementary", "zorin")),
                            ("debian", ("debian", "raspbian")),
                            ("fedora", ("fedora",)),
                            ("arch", ("arch", "manjaro", "endeavouros")),
                            ("suse", ("opensuse", "opensuse-leap", "opensuse-tumbleweed", "suse", "sles"))):
        if any(i in members for i in ids):
            return family
    return None


def _option(option_id: str, label: str, steps: list[list[str]], *, needs_root: bool, available: bool,
            note: str = "", url: str | None = None) -> dict[str, Any]:
    return {
        "id": option_id, "label": label, "steps": steps,
        "command": " && ".join(shlex.join(step) for step in steps),
        "needs_root": needs_root,
        # The bridge may run it for the user (after confirmation): no root and the tool is present.
        "runnable": available and not needs_root and bool(steps),
        "available": available, "note": note, "recommended": False,
        **({"url": url} if url else {}),
    }


def install_options(info: dict[str, Any] | None = None, which: Which = shutil.which) -> list[dict[str, Any]]:
    """Ways to install KiCad on this machine, best first; the first one is marked ``recommended``."""
    info = info or platform_info()
    options: list[dict[str, Any]] = []
    if info["os"] == "linux":
        family = _family(info)
        native = {
            "fedora": ("dnf", "Fedora package (dnf)", [["sudo", "dnf", "install", "-y", "kicad"]], ""),
            "ubuntu": ("apt", "KiCad PPA (apt)", [["sudo", "add-apt-repository", "-y", UBUNTU_PPA], ["sudo", "apt-get", "update"],
                                                  ["sudo", "apt-get", "install", "-y", "kicad"]],
                       "Official KiCad PPA for Ubuntu and derivatives."),
            "debian": ("apt", "Debian package (apt)", [["sudo", "apt-get", "update"], ["sudo", "apt-get", "install", "-y", "kicad"]],
                       "Older Debian releases ship KiCad < 8; use Flatpak (or backports) if the check reports an old version."),
            "arch": ("pacman", "Arch package (pacman)", [["sudo", "pacman", "-S", "--needed", "--noconfirm", "kicad", "kicad-library"]],
                     "kicad-library provides the symbol and footprint libraries."),
            "suse": ("zypper", "openSUSE package (zypper)", [["sudo", "zypper", "--non-interactive", "install", "kicad"]], ""),
        }.get(family or "")
        flatpak = _option(
            "flatpak", "Flatpak from Flathub (per user, no root)",
            [["flatpak", "remote-add", "--user", "--if-not-exists", "flathub", FLATHUB],
             ["flatpak", "install", "--user", "-y", "--noninteractive", "flathub", FLATPAK_APP]],
            needs_root=False, available=which("flatpak") is not None,
            note="Downloads about 1.5 GB. The KiCad tools run kicad-cli through `flatpak run`." if which("flatpak")
            else "Install flatpak first (https://flathub.org/setup), then use this option.")
        if native:
            option_id, label, steps, note = native
            options.append(_option(option_id, label, steps, needs_root=True, available=which(steps[-1][1]) is not None, note=note))
        options.append(flatpak)
    elif info["os"] == "macos":
        brew = which("brew")
        options.append(_option("brew", "Homebrew cask", [["brew", "install", "--cask", "kicad"]], needs_root=False,
                               available=brew is not None,
                               note="" if brew else "Homebrew is not installed (https://brew.sh); or use the installer download."))
    elif info["os"] == "windows":
        winget = which("winget")
        options.append(_option("winget", "winget", [["winget", "install", "--id", "KiCad.KiCad", "-e", "--accept-package-agreements",
                                                     "--accept-source-agreements"]],
                               needs_root=False, available=winget is not None,
                               note="Windows may ask for permission (UAC)." if winget else "winget is not available; use the installer download."))
    options.append(_option("download", "Installer from kicad.org", [], needs_root=False, available=True,
                           note="Download and run the official installer for your system.", url=DOWNLOAD_URL))
    # Prefer what needs no root and can run here, then a native package, then the download page.
    best = next((o for o in options if o["runnable"]), None) or next((o for o in options if o["available"]), options[-1])
    best["recommended"] = True
    return options


def install_hint(info: dict[str, Any] | None = None, which: Which = shutil.which) -> str:
    """One sentence for error messages: the recommended install command for this machine."""
    options = install_options(info, which)
    best = next(o for o in options if o["recommended"])
    if best["command"]:
        native = next((o for o in options if o is not best and o["needs_root"] and o["available"]), None)
        tail = f" (or with your package manager: `{native['command']}`)" if native else ""
        return f"Install it with `{best['command']}`{tail}, or download it from {DOWNLOAD_URL}."
    return f"Install it from {DOWNLOAD_URL}."


def _check(check_id: str, label: str, status: str, summary: str, *, required: bool, fix: str | None = None, **extra: Any) -> dict[str, Any]:
    return {"id": check_id, "label": label, "status": status, "required": required, "summary": summary,
            **({"fix": fix} if fix else {}), **extra}


def run_doctor(cli: KiCadCli, info: dict[str, Any] | None = None, which: Which = shutil.which,
               python_version: tuple[int, ...] | None = None) -> dict[str, Any]:
    """Check everything the KiCad tools need and say how to fix what is missing."""
    info = info or platform_info()
    cli.locate()  # pick up an installation that appeared since the last call
    options = install_options(info, which)
    hint = install_hint(info, which)
    checks: list[dict[str, Any]] = []

    # kicad-cli and its version
    version_text = cli.version_or_none() if cli.argv else None
    version = parse_version(version_text)
    command = " ".join(cli.argv) if cli.argv else None
    if cli.argv is None:
        checks.append(_check("kicad_cli", "kicad-cli", "error", "kicad-cli was not found.", required=True,
                             fix=f"{hint} If KiCad is installed somewhere unusual, set the KiCad bridge 'kicadCli' setting (or $KICAD_CLI) to its kicad-cli.",
                             problems=cli.problems))
    elif version is None:
        checks.append(_check("kicad_cli", "kicad-cli", "error", f"{command} does not run (`kicad-cli version` failed).", required=True,
                             fix=f"Check the KiCad installation or point the 'kicadCli' setting to a working kicad-cli. {hint}",
                             path=command, source=cli.source, problems=cli.problems))
    else:
        problems = cli.problems
        checks.append(_check("kicad_cli", "kicad-cli", "warn" if problems else "ok", f"{command} (found via {cli.source}).",
                             required=True, path=command, source=cli.source, problems=problems,
                             fix=" ".join(p[0].upper() + p[1:] + "." for p in problems) + " Fix or clear that value." if problems else None))
    if version is not None:
        old = version < MIN_KICAD
        checks.append(_check("kicad_version", "KiCad version", "error" if old else "ok",
                             f"KiCad {version_text}" + (f" is older than {MIN_KICAD[0]}.0." if old else "."),
                             required=True, version=version_text, minimum=f"{MIN_KICAD[0]}.0",
                             fix=f"Upgrade to KiCad {MIN_KICAD[0]} or newer. {hint}" if old else None))
    else:
        checks.append(_check("kicad_version", "KiCad version", "error", "Unknown: kicad-cli is not available.", required=True,
                             version=None, minimum=f"{MIN_KICAD[0]}.0", fix="Install KiCad first (see kicad-cli)."))

    # libraries
    sym_dirs, fp_dirs = default_symbol_dirs(), default_footprint_dirs()
    checks.append(_check("symbol_libraries", "Symbol libraries", "ok" if sym_dirs else "error",
                         f"{len(sym_dirs)} director{'y' if len(sym_dirs) == 1 else 'ies'}: {', '.join(sym_dirs)}" if sym_dirs else "No KiCad symbol libraries found.",
                         required=True, dirs=sym_dirs,
                         fix=None if sym_dirs else "Install KiCad's libraries (they come with KiCad; on Arch also `kicad-library`), or set KICAD10_SYMBOL_DIR to the 'symbols' directory."))
    checks.append(_check("footprint_libraries", "Footprint libraries", "ok" if fp_dirs else "warn",
                         f"{len(fp_dirs)} director{'y' if len(fp_dirs) == 1 else 'ies'}: {', '.join(fp_dirs)}" if fp_dirs else "No KiCad footprint libraries found.",
                         required=False, dirs=fp_dirs,
                         fix=None if fp_dirs else "Install KiCad's footprint libraries (on Arch `kicad-library`; Debian/Ubuntu `kicad-footprints`), or set KICAD10_FOOTPRINT_DIR."))

    # Python running this sidecar
    py = python_version or tuple(sys.version_info[:3])
    py_text = ".".join(str(p) for p in py)
    py_ok = py >= MIN_PYTHON
    checks.append(_check("python", "Python", "ok" if py_ok else "error", f"Python {py_text} ({sys.executable}).", required=True,
                         version=py_text, minimum="3.10",
                         fix=None if py_ok else "Install Python 3.10+ and set the KiCad bridge 'python' setting to it."))

    # optional extras
    rasterizers = [n for n in ("rsvg-convert", "magick", "convert", "inkscape") if which(n)]
    try:
        import cairosvg  # type: ignore  # noqa: F401
        rasterizers.insert(0, "cairosvg")
    except Exception:  # ImportError, or OSError when libcairo is missing
        pass
    raster_fix = {"fedora": "`sudo dnf install librsvg2-tools`", "ubuntu": "`sudo apt-get install librsvg2-bin`",
                  "debian": "`sudo apt-get install librsvg2-bin`", "arch": "`sudo pacman -S librsvg`"}.get(_family(info) or "") \
        or ("`brew install librsvg`" if info["os"] == "macos" else "ImageMagick")
    checks.append(_check("png", "PNG renders (optional)", "ok" if rasterizers else "warn",
                         f"Rasterizers: {', '.join(rasterizers)}." if rasterizers else "No SVG→PNG rasterizer; renders stay SVG (images are not attached for the model).",
                         required=False, rasterizers=rasterizers,
                         fix=None if rasterizers else f"Install rsvg-convert ({raster_fix}) or use the bridge's uv launcher with the 'png' extra."))
    try:
        import kipy  # type: ignore  # noqa: F401
        kipy_ok = True
    except Exception:
        kipy_ok = False
    checks.append(_check("kipy", "KiCad IPC client (optional)", "ok" if kipy_ok else "warn",
                         "kicad-python (kipy) is installed." if kipy_ok else "kicad-python (kipy) is not installed; only the live IPC status probe needs it.",
                         required=False, fix=None if kipy_ok else "Use the bridge's uv launcher with the 'ipc' extra, or `pip install kicad-python`."))

    errors = [c for c in checks if c["status"] == "error" and c["required"]]
    kicad_missing = cli.argv is None or version is None
    kicad_outdated = version is not None and version < MIN_KICAD
    status = "missing" if kicad_missing else "outdated" if kicad_outdated else "error" if errors else "ok"
    return {
        "ok": not errors,
        "status": status,
        "summary": _summary(status, version_text, errors),
        "kicad": {"cli": command, "source": cli.source, "version": version_text, "minimum": f"{MIN_KICAD[0]}.0"},
        "platform": info,
        "checks": checks,
        # Install plans only matter when KiCad itself is the problem.
        "install": options if kicad_missing or kicad_outdated else [],
        "sidecar_version": __version__,
    }


def _summary(status: str, version: str | None, errors: list[dict[str, Any]]) -> str:
    if status == "ok":
        return f"Ready: KiCad {version} and everything the KiCad tools need were found."
    if status == "missing":
        return "KiCad (kicad-cli) is not installed or was not found. Install KiCad 8+ to use the KiCad tools."
    if status == "outdated":
        return f"KiCad {version} is too old; the KiCad tools need KiCad {MIN_KICAD[0]} or newer."
    return "Not ready: " + "; ".join(c["summary"] for c in errors)


def format_report(report: dict[str, Any]) -> str:
    """Plain-text rendering (for the model and the standalone server)."""
    marks = {"ok": "✓", "warn": "!", "error": "✗"}
    lines = [report["summary"], ""]
    for c in report["checks"]:
        lines.append(f"{marks[c['status']]} {c['label']}: {c['summary']}")
        if c.get("fix"):
            lines.append(f"    fix: {c['fix']}")
    if report["install"]:
        lines += ["", "Install options:"]
        for o in report["install"]:
            how = o["command"] or o.get("url", "")
            flags = [*(["recommended"] if o["recommended"] else []), *(["needs root"] if o["needs_root"] else []),
                     *(["unavailable here"] if not o["available"] else [])]
            lines.append(f"- {o['label']}{' (' + ', '.join(flags) + ')' if flags else ''}: {how}")
    return "\n".join(lines)
