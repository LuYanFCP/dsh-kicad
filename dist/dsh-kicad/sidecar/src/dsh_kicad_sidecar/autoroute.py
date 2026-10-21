"""``autoroute``: route a board with Freerouting, headless, and bring the routes back (``kicad_autoroute``).

1. Write the board as a Specctra design (:mod:`specctra`): every track and via already on the board is fixed wiring,
   so hand-routed critical nets (power, a USB pair, a crystal) stay exactly as they are.
2. Run Freerouting (:mod:`freerouting`) in a separate process, cancellable, with a time limit.
3. Read its session and add the new tracks and vias to the board. Footprints are never moved, nothing is removed.
4. Save, then let KiCad judge: ``kicad-cli pcb drc`` (with schematic parity when the schematic sits next to the
   board). Copper zones (a GND pour) are refilled and saved by the same run (``--refill-zones --save-board``), so the
   pour flows around the new tracks.

The design, session and Freerouting's log are kept in ``<project>/.dsh-kicad/autoroute/`` for inspection.
"""

from __future__ import annotations

import os
import threading
from typing import Any, Callable, Iterable

from .freerouting import RELEASE, Cancelled, FreeroutingError, Router, run
from .kicad_cli import KiCadCli, has_zones
from .pcb import Board
from .specctra import SpecctraError, import_session, parse_ses, write_dsn

__all__ = ["AutorouteError", "autoroute", "unavailable_message"]

DEFAULT_TIMEOUT = 300
MAX_TIMEOUT = 3600


class AutorouteError(ValueError):
    pass


def unavailable_message(router: Router) -> str:
    """Why Freerouting cannot run, and what the user does about it (the model passes this on; it installs nothing)."""
    lines = ["kicad_autoroute needs the Freerouting autorouter, which cannot run here: " + "; ".join(
        router.problems or ["Freerouting is not installed"]) + "."]
    java_missing = any("Java" in p for p in router.problems)
    if router.jar is None and router.executable is None:
        lines.append(f"Ask the user to run /kicad-install freerouting: it downloads Freerouting {RELEASE['version']} "
                     f"(GPL-3.0, {RELEASE['size'] / 1e6:.0f} MB, checksum verified) into their own data directory after "
                     "they confirm, never with sudo. Or set the KiCad bridge 'freerouting' setting to an existing jar.")
    if java_missing or router.jar is None:
        lines.append(f"Freerouting {RELEASE['version']} runs on Java {RELEASE['java']} or newer: install a JRE "
                     "(the system package manager, or https://adoptium.net), or point the KiCad bridge 'java' setting at one.")
    lines.append("kicad_doctor lists the exact commands for this machine. Until then, route with kicad_edit_pcb add_track / add_via.")
    return " ".join(lines)


def autoroute(cli: KiCadCli, pcb: str, router: Router, nets: Iterable[str] | None = None,
              exclude_nets: Iterable[str] | None = None, passes: int | None = None, timeout: float = DEFAULT_TIMEOUT,
              fill_zones: bool = True, cancel: threading.Event | None = None,
              progress: Callable[[float, float | None, str], None] | None = None) -> dict[str, Any]:
    if not router.ok:
        raise AutorouteError(unavailable_message(router))
    if passes is not None and (isinstance(passes, bool) or not isinstance(passes, int) or not 1 <= passes <= 1000):
        raise AutorouteError("passes must be a whole number from 1 to 1000")
    if isinstance(timeout, bool) or not isinstance(timeout, (int, float)) or not 5 <= timeout <= MAX_TIMEOUT:
        raise AutorouteError(f"timeout must be between 5 and {MAX_TIMEOUT} seconds")
    board = Board(pcb)
    try:
        dsn = write_dsn(board, nets=nets, exclude_nets=exclude_nets, name=os.path.basename(pcb))
    except SpecctraError as exc:
        raise AutorouteError(str(exc)) from exc
    if not dsn.routed:
        raise AutorouteError("no nets left to route (nets / exclude_nets leave none)")
    work = os.path.join(os.path.dirname(pcb), ".dsh-kicad", "autoroute")
    os.makedirs(work, exist_ok=True)
    stem = os.path.splitext(os.path.basename(pcb))[0]
    paths = {k: os.path.join(work, f"{stem}.{k}") for k in ("dsn", "ses", "log")}
    with open(paths["dsn"], "w", encoding="utf-8") as fh:
        fh.write(dsn.text)
    if progress:
        progress(0.0, float(passes) if passes else None, f"routing {len(dsn.routed)} net(s) with {router.describe()}")
    try:
        result = run(router, paths["dsn"], paths["ses"], passes=passes, timeout=timeout, cancel=cancel, progress=progress,
                     log_path=paths["log"])
    except Cancelled:
        raise
    except FreeroutingError as exc:
        raise AutorouteError(f"{exc}\n(design and log: {work})") from exc
    with open(paths["ses"], encoding="utf-8") as fh:
        session = parse_ses(fh.read())
    imported = import_session(board, session, dsn)
    if cancel is not None and cancel.is_set():
        raise Cancelled("autorouting was cancelled; the board was not changed")
    files = board.save() if imported["segments"] or imported["vias"] else []
    zones = has_zones(pcb)
    schematic = os.path.splitext(pcb)[0] + ".kicad_sch"
    parity = os.path.isfile(schematic)
    if progress:
        progress(float(result.passes + result.optimizer_passes), None, "KiCad DRC" + (" and zone refill" if zones and fill_zones else ""))
    report = cli.drc(pcb, "all", schematic_parity=parity, refill_zones=zones, save_board=zones and fill_zones)
    if zones and fill_zones and pcb not in files:
        files.append(pcb)
    notes = list(dsn.notes)
    if result.timed_out:
        notes.append(f"Freerouting stopped at the {int(timeout)} s time limit; the routes it had are on the board. Run "
                     "kicad_autoroute again (existing tracks are kept) or with a longer timeout.")
    if imported.get("ignored_moves"):
        notes.append("Freerouting moved parts in its session; those moves were ignored (the board keeps the placement).")
    unrouted = report.get("unrouted", 0)
    if unrouted:
        notes.append(f"{unrouted} connection(s) are still unrouted. Either route them by hand with kicad_edit_pcb add_track / "
                     "add_via (a second kicad_autoroute keeps every track and only tries what is open), or give the parts more "
                     "room: if the board was laid out with auto_place, clear the routes and place it again with a larger gap, "
                     "kicad_edit_pcb [remove_tracks{}, auto_place{outline: \"fit\", gap: 2, group_gap: 4}] (re-add a copper "
                     "pour drawn for the old outline), then run kicad_autoroute again.")
    return {
        "pcb": pcb,
        "written": bool(files),
        "files": files,
        "nets": {"routed": len(dsn.routed), "left_out": dsn.left_out[:50], "changed": imported["nets"]},
        "added": {"segments": imported["segments"], "vias": imported["vias"], "length_mm": imported["length"]},
        "kept": dsn.fixed,
        "zones_filled": bool(zones and fill_zones),
        "freerouting": {**result.summary(), "command": router.describe(), "files": work},
        "unrouted": unrouted,
        "drc": {"path": pcb, **report},
        "notes": notes,
    }
