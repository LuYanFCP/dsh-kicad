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
from . import freerouting
from . import spice
from .footprints import default_footprint_dirs
from .kicad_cli import FLATPAK_APP, MIN_KICAD, KiCadCli, parse_version
from .models3d import FLATPAK_EXTENSION, model_library
from .symbols import default_symbol_dirs

__all__ = ["MIN_PYTHON", "platform_info", "install_options", "install_hint", "model_options", "run_doctor"]

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


JAVA_PACKAGES = {  # a headless JRE new enough for the Freerouting release the bridge downloads
    "fedora": ["sudo", "dnf", "install", "-y", "java-25-openjdk-headless"],
    "ubuntu": ["sudo", "apt-get", "install", "-y", "openjdk-25-jre-headless"],
    "debian": ["sudo", "apt-get", "install", "-y", "openjdk-25-jre-headless"],
    "arch": ["sudo", "pacman", "-S", "--needed", "--noconfirm", "jre-openjdk-headless"],
    "suse": ["sudo", "zypper", "--non-interactive", "install", "java-25-openjdk-headless"],
}


def java_options(info: dict[str, Any], which: Which = shutil.which) -> list[dict[str, Any]]:
    """Ways to install a Java runtime for Freerouting on this machine (the user runs those that need root)."""
    options: list[dict[str, Any]] = []
    family = _family(info)
    if info["os"] == "linux" and family in JAVA_PACKAGES:
        step = JAVA_PACKAGES[family]
        options.append(_option("java", f"Java runtime ({step[1]})", [step], needs_root=True, available=which(step[1]) is not None,
                               note="Older releases may not package Java 25 yet; then use the Temurin download."))
    elif info["os"] == "macos":
        brew = which("brew")
        options.append(_option("java", "Java runtime (Homebrew)", [["brew", "install", "--cask", "temurin"]], needs_root=False,
                               available=brew is not None, note="" if brew else "Homebrew is not installed (https://brew.sh)."))
    elif info["os"] == "windows":
        winget = which("winget")
        options.append(_option("java", "Java runtime (winget)", [["winget", "install", "--id", "EclipseAdoptium.Temurin.25.JRE", "-e",
                                                                  "--accept-package-agreements", "--accept-source-agreements"]],
                               needs_root=False, available=winget is not None, note="Windows may ask for permission (UAC)."))
    options.append(_option("java-download", "Temurin JRE from adoptium.net", [], needs_root=False, available=True,
                           note=f"Install Java {freerouting.RELEASE['java']}+, then set the KiCad bridge 'java' setting if it is not on PATH.",
                           url=freerouting.JAVA_URL))
    return options


MODEL_PACKAGES = {  # KiCad's 3D model library as a distribution package (installs into <share>/kicad/3dmodels)
    "fedora": ["sudo", "dnf", "install", "-y", "kicad-packages3d"],
    "ubuntu": ["sudo", "apt-get", "install", "-y", "kicad-packages3d"],
    "debian": ["sudo", "apt-get", "install", "-y", "kicad-packages3d"],
    "arch": ["sudo", "pacman", "-S", "--needed", "--noconfirm", "kicad-library-3d"],
    "suse": ["sudo", "zypper", "--non-interactive", "install", "kicad-packages3D"],
}
LIBRARIES_URL = "https://www.kicad.org/libraries/download/"
PACKAGES3D_URL = "https://gitlab.com/kicad/libraries/kicad-packages3D/-/tags"


def model_options(info: dict[str, Any], which: Which = shutil.which, kicad_source: str | None = None) -> list[dict[str, Any]]:
    """Ways to install KiCad's 3D model library for the KiCad in use (the user runs those that need root)."""
    options: list[dict[str, Any]] = []
    family = _family(info)
    if kicad_source == "flatpak":
        flatpak = which("flatpak")
        options.append(_option("packages3d", "Flatpak extension (per user, no root)",
                               [["flatpak", "remote-add", "--user", "--if-not-exists", "flathub", FLATHUB],
                                ["flatpak", "install", "--user", "-y", "--noninteractive", "flathub", f"{FLATPAK_EXTENSION}//stable"]],
                               needs_root=False, available=flatpak is not None,
                               note="KiCad's Flatpak keeps its 3D models in a separate extension (about 640 MB download, 3.1 GB installed)."))
    elif info["os"] == "linux" and family in MODEL_PACKAGES:
        step = MODEL_PACKAGES[family]
        options.append(_option("packages3d", f"KiCad 3D models ({step[1]})", [step], needs_root=True,
                               available=which(step[1]) is not None,
                               note="About 270 MB to download and 3.1 GB installed, into KiCad's 3dmodels directory."))
    elif info["os"] == "macos":
        brew = which("brew")
        options.append(_option("packages3d", "Reinstall KiCad with Homebrew", [["brew", "reinstall", "--cask", "kicad"]],
                               needs_root=False, available=brew is not None,
                               note="KiCad for macOS (the DMG and the cask) bundles the 3D models in KiCad.app; reinstalling restores them."
                               if brew else "KiCad for macOS bundles the 3D models in KiCad.app: reinstall it from kicad.org."))
    elif info["os"] == "windows":
        options.append(_option("packages3d-installer", "Run the KiCad installer again", [], needs_root=False, available=True,
                               note="The full installer (and winget install KiCad.KiCad) includes them; keep the \"3D models\" component selected.",
                               url=DOWNLOAD_URL))
    options.append(_option("packages3d-download", "Download the 3D model library", [], needs_root=False, available=True,
                           note="Unpack the kicad-packages3D archive for your KiCad version (gitlab.com/kicad/libraries/kicad-packages3D, "
                                "about 3.3 GB unpacked) anywhere, then point KICAD10_3DMODEL_DIR at it (KiCad: Preferences → "
                                "Configure Paths, or the environment).", url=PACKAGES3D_URL))
    return options


def _model_check(cli: KiCadCli, info: dict[str, Any], which: Which) -> dict[str, Any]:
    """Optional: KiCad's 3D model library, which 3D renders and the Web UI's 3D view use for component bodies."""
    lib = model_library(cli)
    var, where = lib["var"], lib["dir"]
    label = "3D models (optional)"
    if lib["installed"]:
        return _check("3d_models", label, "ok", f"{lib['libraries']} model libraries in {where} ({var}, {lib['source']}).",
                      required=False, dir=where, var=var, source=lib["source"])
    options = model_options(info, which, cli.source)
    best = next((o for o in options if o["command"]), None)
    found = f"{where} is empty or missing" if where else "no 3D model directory was found"
    return _check("3d_models", label, "warn",
                  f"KiCad's 3D model library is not installed ({var}: {found}); 3D views show boards without component bodies.",
                  required=False, dir=where, var=var, source=lib["source"], install=options,
                  fix=(f"Install it (`{best['command']}`)" if best else "Install it") +
                  f", or download it ({PACKAGES3D_URL}) and set {var} to that directory.")


NGSPICE_PACKAGES = {  # the ngspice command line simulator (kicad_simulate)
    "fedora": ["sudo", "dnf", "install", "-y", "ngspice"],
    "ubuntu": ["sudo", "apt-get", "install", "-y", "ngspice"],
    "debian": ["sudo", "apt-get", "install", "-y", "ngspice"],
    "arch": ["sudo", "pacman", "-S", "--needed", "--noconfirm", "ngspice"],
    "suse": ["sudo", "zypper", "--non-interactive", "install", "ngspice"],
}


def ngspice_options(info: dict[str, Any], which: Which = shutil.which) -> list[dict[str, Any]]:
    """Ways to install ngspice on this machine (the user runs those that need root)."""
    options: list[dict[str, Any]] = []
    family = _family(info)
    if info["os"] == "linux" and family in NGSPICE_PACKAGES:
        step = NGSPICE_PACKAGES[family]
        options.append(_option("ngspice", f"ngspice ({step[1]})", [step], needs_root=True, available=which(step[1]) is not None))
    elif info["os"] == "macos":
        brew = which("brew")
        options.append(_option("ngspice", "ngspice (Homebrew)", [["brew", "install", "ngspice"]], needs_root=False,
                               available=brew is not None, note="" if brew else "Homebrew is not installed (https://brew.sh)."))
    elif info["os"] == "windows":
        winget = which("winget")
        options.append(_option("ngspice", "ngspice (winget)", [["winget", "install", "--id", "ngspice.ngspice", "-e"]], needs_root=False,
                               available=winget is not None, note="Or use the zip from the ngspice download page."))
    options.append(_option("ngspice-download", "ngspice from ngspice.sourceforge.io", [], needs_root=False, available=True,
                           note="Install it, then make sure `ngspice` is on PATH (or set $NGSPICE to the executable).", url=spice.DOWNLOAD_URL))
    return options


def _simulation_check(info: dict[str, Any], which: Which, ngspice: str | None) -> dict[str, Any]:
    """Optional: ngspice, which kicad_simulate runs (KiCad's own Simulator is a GUI feature; kicad-cli has none)."""
    label = "ngspice (optional, simulation)"
    path = ngspice or spice.locate_ngspice()
    if path:
        version = spice.ngspice_version(path)
        if version:
            return _check("ngspice", label, "ok", f"ngspice {version} ({path}).", required=False, path=path, version=version)
        return _check("ngspice", label, "warn", f"{path} does not run (`ngspice --version` failed).", required=False, path=path,
                      fix="Reinstall ngspice or set $NGSPICE to a working executable.")
    options = ngspice_options(info, which)
    best = next((o for o in options if o["command"]), None)
    return _check("ngspice", label, "warn", "ngspice was not found; kicad_simulate (SPICE verification) needs it.", required=False,
                  install=options,
                  fix=(f"Install it (`{best['command']}`)" if best else "Install it") + f", or download it ({spice.DOWNLOAD_URL}); "
                  "if it is not on PATH, set $NGSPICE to the executable.")


def freerouting_option() -> dict[str, Any]:
    release = freerouting.RELEASE
    return _option("freerouting", f"Freerouting {release['version']} (download the release jar, per user)",
                   [freerouting.download_command()], needs_root=False, available=True,
                   note=(f"Downloads {release['size'] / 1e6:.1f} MB from {freerouting.HOMEPAGE} (GPL-3.0) into "
                         f"{freerouting.data_dir()} and checks its SHA-256; it runs on Java {release['java']}+."),
                   url=freerouting.HOMEPAGE)


def _routing_checks(router: freerouting.Router, info: dict[str, Any], which: Which) -> list[dict[str, Any]]:
    """Optional: Java and Freerouting, which kicad_autoroute needs."""
    release = freerouting.RELEASE
    needed = router.java_required or release["java"]
    checks = []
    if router.executable:
        checks.append(_check("java", "Java (optional, autorouting)", "ok", "Not needed: Freerouting runs as a native executable.",
                             required=False))
    else:
        java, version, problems = router.java, router.java_version, router.java_problems
        text = ".".join(map(str, version)) if version else None
        if java and version and version[0] >= needed and problems:
            status, summary = "warn", f"Java {text} ({java}); but {'; '.join(problems)}."
        elif java and version and version[0] >= needed:
            status, summary = "ok", f"Java {text} ({java})."
        elif java and version:
            status, summary = "warn", f"Java {text} ({java}) is older than Java {needed}, which Freerouting {router.version or release['version']} needs."
        elif java:
            status, summary = "warn", f"{java} does not run (`java -version` failed)."
        else:
            status, summary = "warn", "Java was not found; kicad_autoroute runs Freerouting, a Java program."
        options = [] if status == "ok" or (version and version[0] >= needed) else java_options(info, which)
        best = next((o for o in options if o["command"]), None)
        fix = None if status == "ok" else "Fix or clear the KiCad bridge 'java' setting." if not options else (
            f"Install Java {needed}+" + (f" (`{best['command']}`)" if best else "") +
            f", or a Temurin JRE from {freerouting.JAVA_URL}; if it is not on PATH, set the KiCad bridge 'java' setting.")
        checks.append(_check("java", "Java (optional, autorouting)", status, summary, required=False, fix=fix, path=java,
                             version=text, minimum=str(needed), problems=problems, install=options))
    if router.ok:
        checks.append(_check("freerouting", "Freerouting (optional, autorouting)", "ok", router.describe() + ".", required=False,
                             path=router.jar or router.executable, version=router.version, source=router.source))
    elif router.jar is None and router.executable is None:
        checks.append(_check("freerouting", "Freerouting (optional, autorouting)", "warn",
                             "Freerouting is not installed; kicad_autoroute needs it." + (
                                 " " + "; ".join(router.problems).capitalize() + "." if router.problems else ""),
                             required=False, install=[freerouting_option()],
                             fix=(f"Run /kicad-install freerouting to download Freerouting {release['version']} into "
                                  f"{freerouting.data_dir()} (after you confirm; no root), or set the KiCad bridge "
                                  "'freerouting' setting to an existing freerouting.jar.")))
    else:
        checks.append(_check("freerouting", "Freerouting (optional, autorouting)", "warn",
                             f"{router.jar or router.executable} cannot run: {'; '.join(router.problems)}.", required=False,
                             path=router.jar or router.executable, version=router.version,
                             fix=f"Install Java {needed}+ (see the Java check) or point the 'java' setting at one."))
    return checks


def run_doctor(cli: KiCadCli, info: dict[str, Any] | None = None, which: Which = shutil.which,
               python_version: tuple[int, ...] | None = None, router: freerouting.Router | None = None,
               ngspice: str | None = None) -> dict[str, Any]:
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
                             fix=(f"Upgrade to KiCad {MIN_KICAD[0]} or newer. {hint}"
                                  + (f" Then clear or update the {'kicadCli setting' if cli.source == 'setting' else '$KICAD_CLI variable'}, which points to this old kicad-cli."
                                     if cli.source in ("setting", "env") else "")) if old else None))
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

    if cli.argv is not None:
        checks.append(_model_check(cli, info, which))

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

    checks += _routing_checks(router if router is not None else freerouting.locate(), info, which)
    checks.append(_simulation_check(info, which, ngspice))

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
        for o in c.get("install") or []:
            if o["runnable"]:
                lines.append(f"    install: /kicad-install {o['id']} ({o['command']})")
    if report["install"]:
        lines += ["", "Install options:"]
        for o in report["install"]:
            how = o["command"] or o.get("url", "")
            flags = [*(["recommended"] if o["recommended"] else []), *(["needs root"] if o["needs_root"] else []),
                     *(["unavailable here"] if not o["available"] else [])]
            lines.append(f"- {o['label']}{' (' + ', '.join(flags) + ')' if flags else ''}: {how}")
    return "\n".join(lines)
