"""Judge a board the way ordering it would, shared by the board evals: KiCad's own DRC (schematic parity, unrouted connections,
errors, with the zones refilled) and the fab zip's contents as KiCad wrote them (Gerber X2 file functions, Excellon drill hits
counted against the holes in the board). Nothing here asks the model or the plugin's own checks.

    import board_check
    checks = board_check.check_board(sidecar_src, "/path/to/board.kicad_pcb")   # [(name, ok, detail), ...]
"""
import glob
import os
import re
import sys
import zipfile

# Gerber X2 file functions a bare-board order needs (KiCad writes %TF.FileFunction,...*% in every Gerber)
LAYERS = (
    ("top copper", r"Copper,L1,Top"),
    ("bottom copper", r"Copper,L\d+,Bot"),
    ("top solder mask", r"Soldermask,Top"),
    ("bottom solder mask", r"Soldermask,Bot"),
    ("top silkscreen", r"Legend,Top"),
    ("bottom silkscreen", r"Legend,Bot"),
    ("board outline", r"Profile,NP"),
)
FUNCTION = re.compile(r"(?:%TF|G04 #@! TF)\.FileFunction,([^*%]+)")
DRILL_FUNCTION = re.compile(r"; #@! TF\.FileFunction,(Plated|NonPlated),")
HIT = re.compile(r"^X-?[\d.]+Y-?[\d.]+", re.M)


def find_zip(pcb):
    """The newest zip under <project>/fab/ (kicad_export_fab's default output), or None."""
    found = glob.glob(os.path.join(os.path.dirname(os.path.abspath(pcb)), "fab", "**", "*.zip"), recursive=True)
    return max(found, key=os.path.getmtime) if found else None


def board_holes(pcb_text):
    """(plated, non-plated) holes the board has: vias and through-hole pads, and non-plated pads (mounting holes, pegs)."""
    vias = len(re.findall(r"^\s*\(via\b", pcb_text, re.M))
    plated = len(re.findall(r'^\s*\(pad\s+"[^"]*"\s+thru_hole\b', pcb_text, re.M))
    non_plated = len(re.findall(r'^\s*\(pad\s+"[^"]*"\s+np_thru_hole\b', pcb_text, re.M))
    return vias + plated, non_plated


def read_zip(path):
    """{"functions": [file function, ...], "drill": {"Plated": hits, "NonPlated": hits}} from the Gerber and Excellon files."""
    functions, drill = [], {}
    with zipfile.ZipFile(path) as z:
        for name in z.namelist():
            if name.endswith("/"):
                continue
            text = z.read(name).decode("utf-8", errors="replace")
            if name.lower().endswith(".drl") or text.lstrip().startswith("M48"):
                m = DRILL_FUNCTION.search(text)
                if m:
                    drill[m.group(1)] = drill.get(m.group(1), 0) + len(HIT.findall(text))
                continue
            m = FUNCTION.search(text)
            if m:
                functions.append(m.group(1).strip())
    return {"functions": functions, "drill": drill}


def check_board(sidecar_src, pcb, zip_path=None, copper_layers=2, pour_net="GND", preset="jlcpcb"):
    """[(name, ok, detail), ...] for the board at ``pcb`` and its fab zip (found under <project>/fab/ unless given). ``preset``: the
    fab whose limits the board must meet, checked by KiCad's DRC with that fab's rules (None: not checked)."""
    if sidecar_src not in sys.path:
        sys.path.insert(0, sidecar_src)
    from dsh_kicad_sidecar import fab
    from dsh_kicad_sidecar.kicad_cli import KiCadCli
    from dsh_kicad_sidecar.pcb import Board

    checks = []

    def check(name, ok, detail=""):
        checks.append((name, bool(ok), detail))

    if not os.path.isfile(pcb):
        check("the board exists", False, pcb)
        return checks
    drc = KiCadCli().drc(pcb, schematic_parity=True, refill_zones=True)
    print("DRC:", "PASSED" if drc["passed"] else "FAILED", drc["counts"], "unrouted", drc.get("unrouted"), "parity", drc.get("parity"), drc["by_type"])
    parity_error = drc.get("schematic_parity_error")
    check("schematic parity 0 (KiCad DRC)", not parity_error and drc.get("parity") == 0, parity_error or f"{drc.get('parity')} issue(s)")
    check("0 unrouted connections (KiCad DRC)", drc.get("unrouted") == 0, f"{drc.get('unrouted')} unrouted")
    check("0 DRC errors (KiCad DRC, zones refilled)", drc["counts"]["error"] == 0,
          ", ".join(f"{t} ×{n}" for t, n in sorted(drc["by_type"].items())) or "none")
    if preset:  # a scratch copy with the fab's limits as its rules, judged by KiCad's DRC (the export's own gate does the same)
        limits = fab.fab_gate(KiCadCli(), pcb, preset).get("preset") or {}
        check(f"within {limits.get('label', preset)} limits (KiCad DRC with the fab's rules)", limits.get("errors") == 0,
              ", ".join(f"{t} ×{n}" for t, n in sorted((limits.get("by_type") or {}).items())) or "none")
    board = Board(pcb)
    layers = board.copper_layers()
    check(f"{copper_layers} copper layers", len(layers) == copper_layers, ", ".join(layers))
    pours = [z for z in board.zones() if z.get("net") == pour_net and not z.get("keepout")]
    check(f"a {pour_net} copper pour", pours, ", ".join("/".join(z["layers"]) for z in pours) or "none")

    zip_path = zip_path or find_zip(pcb)
    if not zip_path or not os.path.isfile(zip_path):
        check("fab zip (kicad_export_fab)", False, "no zip under fab/")
        return checks
    check("fab zip (kicad_export_fab)", True, os.path.relpath(zip_path, os.path.dirname(os.path.abspath(pcb))))
    fresh = os.path.getmtime(zip_path) >= os.path.getmtime(pcb) - 1
    check("the zip is not older than the board", fresh, "" if fresh else "the board changed after the export: export again")
    content = read_zip(zip_path)
    missing = [what for what, pattern in LAYERS if not any(re.fullmatch(pattern, f) for f in content["functions"])]
    check("Gerbers: copper, solder mask and silkscreen on both sides, board outline", not missing,
          ("missing " + ", ".join(missing)) if missing else f"{len(content['functions'])} Gerber files")
    with open(pcb, encoding="utf-8") as fh:
        plated, non_plated = board_holes(fh.read())
    hits = content["drill"]
    check("drill: every plated hole (vias, through-hole pads)", hits.get("Plated", 0) == plated,
          f"{hits.get('Plated', 0)} in the drill file, {plated} on the board")
    check("drill: every non-plated hole", hits.get("NonPlated", 0) == non_plated,
          f"{hits.get('NonPlated', 0)} in the drill file, {non_plated} on the board")
    return checks


def report(checks, title="BOARD", what="board requirements"):
    """Print the checks; True when all hold."""
    print(f"\n{title}:")
    for name, ok, detail in checks:
        print(("  OK  " if ok else "  FAIL"), name, f"({detail})" if detail else "")
    print(f"\n{sum(ok for _, ok, _ in checks)}/{len(checks)} {what} satisfied")
    return all(ok for _, ok, _ in checks)
