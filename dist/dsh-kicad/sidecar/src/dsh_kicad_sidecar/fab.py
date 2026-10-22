"""Fabrication output: a gate judged by KiCad, then Gerber / drill / position / BOM files in one zip.

Entry points for the other PCB phases:

- ``apply_preset(project, name)`` adopts a fab house's limits (``presets/<name>.json`` + ``.kicad_dru``) as the
  project's design rules (``.kicad_pro``) and custom rules (a managed block in ``<project>.kicad_dru``).
- ``fab_gate(cli, pcb, preset)`` is KiCad's verdict on whether a board can be ordered: no DRC errors, no unrouted
  connections, schematic parity clean (when a schematic exists) and, with a preset, no errors against its rules.
- ``export_fab(cli, pcb, ...)`` runs the gate, then writes every fab file, a zip and 3D previews.
"""

from __future__ import annotations

import csv
import io
import json
import os
import re
import shutil
import tempfile
import zipfile
from collections import Counter
from typing import Any

from .kicad_cli import KiCadCli, KiCadCliError, has_zones
from .pcb import Board, PcbError

__all__ = ["FabError", "apply_preset", "export_fab", "fab_gate", "inspect_excellon", "inspect_gerber",
           "list_presets", "load_preset", "preset_names", "EXTRAS", "PRESETS_DIR"]

PRESETS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "presets")
DRU_BEGIN = "# >>> dsh-kicad fab preset"
DRU_END = "# <<< dsh-kicad fab preset"
MANIFEST = "fab-manifest.json"
EXTRAS = ("ipc2581", "odb", "step")
# Non-copper layers a fab needs; copper layers come from the board (F.Cu, In*.Cu, B.Cu).
FAB_LAYERS = ("F.Paste", "F.SilkS", "F.Mask", "B.Mask", "B.SilkS", "B.Paste", "Edge.Cuts")
LCSC_FIELDS = ("LCSC", "LCSC Part #", "JLCPCB Part #")
MAX_LISTED = 50


class FabError(ValueError):
    """A request the fab tools cannot honour (unknown preset, foreign output directory)."""


# ---- presets ----------------------------------------------------------------------------

def preset_names() -> list[str]:
    return sorted(f[: -len(".json")] for f in os.listdir(PRESETS_DIR) if f.endswith(".json"))


def load_preset(name: str) -> dict[str, Any]:
    key = (name or "").strip().lower()
    if key not in preset_names():
        raise FabError(f"unknown fab preset {name!r}; available: {', '.join(preset_names())}")
    with open(os.path.join(PRESETS_DIR, key + ".json"), encoding="utf-8") as fh:
        preset = json.load(fh)
    dru = os.path.join(PRESETS_DIR, key + ".kicad_dru")
    with open(dru, encoding="utf-8") as fh:
        preset["dru"] = fh.read()
    return preset


def list_presets() -> list[dict[str, Any]]:
    return [{k: p[k] for k in ("name", "label", "source", "notes", "rules")} for p in map(load_preset, preset_names())]


def project_files(path: str) -> tuple[str, str]:
    """``(.kicad_pro, .kicad_dru)`` of the project a board, project file or directory belongs to."""
    if os.path.isdir(path):
        pros = sorted(f for f in os.listdir(path) if f.endswith(".kicad_pro"))
        if len(pros) != 1:
            raise FabError(f"{path} holds {len(pros)} .kicad_pro files; pass the .kicad_pcb or .kicad_pro instead")
        pro = os.path.join(path, pros[0])
    elif path.endswith((".kicad_pro", ".kicad_pcb", ".kicad_sch")):
        pro = os.path.splitext(path)[0] + ".kicad_pro"
    else:
        raise FabError(f"expected a .kicad_pcb, .kicad_pro or project directory, got {path}")
    return pro, os.path.splitext(pro)[0] + ".kicad_dru"


def apply_preset(project: str, name: str, dry_run: bool = False) -> dict[str, Any]:
    """Make a fab house's limits the project's rules: board setup minimums in the .kicad_pro, its custom rules
    as a managed block in the .kicad_dru (user rules outside the block are kept), and netclass track, clearance
    and via sizes raised to those minimums (never lowered). Re-applying is a no-op; another preset replaces it."""
    preset = load_preset(name)
    pro, dru = project_files(project)
    if os.path.isfile(pro):
        with open(pro, encoding="utf-8") as fh:
            data = json.load(fh)
    else:
        data = {"meta": {"filename": os.path.basename(pro), "version": 3}}
    changes: list[str] = []
    rules = data.setdefault("board", {}).setdefault("design_settings", {}).setdefault("rules", {})
    for key, value in preset["rules"].items():
        if rules.get(key) != value:
            changes.append(f"board rule {key}: {_fmt(rules.get(key))} -> {_fmt(value)}")
            rules[key] = value
    for cls in (data.get("net_settings") or {}).get("classes") or []:
        for key, value in _netclass_floors(preset["rules"], cls).items():
            changes.append(f"netclass {cls.get('name', '?')} {key}: {_fmt(cls[key])} -> {_fmt(value)}")
            cls[key] = value
    old_dru = ""
    if os.path.isfile(dru):
        with open(dru, encoding="utf-8") as fh:
            old_dru = fh.read()
    new_dru = _with_preset_block(old_dru, preset)
    if new_dru != old_dru:
        changes.append(f"{os.path.basename(dru)}: {preset['label']} custom rules")
    written = bool(changes) and not dry_run
    if written:
        _write_atomic(pro, json.dumps(data, indent=2, ensure_ascii=False) + "\n")
        if new_dru != old_dru:
            _write_atomic(dru, new_dru)
    return {"preset": preset["name"], "label": preset["label"], "source": preset["source"], "project": pro, "dru": dru,
            "written": written, "dry_run": dry_run, "changes": changes, "rules": preset["rules"], "notes": preset["notes"]}


def _netclass_floors(rules: dict[str, Any], cls: dict[str, Any]) -> dict[str, float]:
    """Netclass values below the preset's minimums, with the value they must be raised to."""
    drill = max(_num(cls.get("via_drill")), _num(rules.get("min_through_hole_diameter")))
    floors = {
        "clearance": _num(rules.get("min_clearance")),
        "track_width": _num(rules.get("min_track_width")),
        "via_drill": _num(rules.get("min_through_hole_diameter")),
        "via_diameter": max(_num(rules.get("min_via_diameter")), drill + 2 * _num(rules.get("min_via_annular_width"))),
    }
    return {k: round(v, 4) for k, v in floors.items()
            if v and isinstance(cls.get(k), (int, float)) and not isinstance(cls.get(k), bool) and cls[k] < v - 1e-9}


def _with_preset_block(text: str, preset: dict[str, Any]) -> str:
    body = re.sub(r"^\s*\(version\s+\d+\)\s*\n", "", preset["dru"].strip() + "\n", count=1)
    block = (f"{DRU_BEGIN}: {preset['name']} ({preset['label']}). Managed by dsh-kicad; applying a preset replaces this block.\n"
             f"{body.strip()}\n{DRU_END}\n")
    managed = re.compile(re.escape(DRU_BEGIN) + r".*?" + re.escape(DRU_END) + r"[^\n]*\n?", re.S)
    if managed.search(text):
        return managed.sub(lambda _: block, text, count=1)
    if not text.strip():
        return "(version 1)\n\n" + block
    return text.rstrip("\n") + "\n\n" + block


# ---- gate -------------------------------------------------------------------------------

def root_schematic(pcb: str) -> str | None:
    sch = os.path.splitext(pcb)[0] + ".kicad_sch"
    return sch if os.path.isfile(sch) else None


_HELP: dict[tuple[tuple[str, ...], tuple[str, ...]], str] = {}


def _supports(cli: KiCadCli, command: tuple[str, ...], flag: str) -> bool:
    """Whether this kicad-cli knows a flag (several fab flags are newer than KiCad 8)."""
    key = (tuple(cli.argv or ()), command)
    if key not in _HELP:
        try:
            proc = cli.run(*command, "--help", check=False)
            _HELP[key] = proc.stdout + proc.stderr
        except KiCadCliError:
            _HELP[key] = ""
    return flag in _HELP[key]


def _drc(cli: KiCadCli, pcb: str, parity: bool) -> dict[str, Any]:
    """The same DRC kicad_drc runs: zones refilled in memory when the board has any, the file is not touched."""
    return cli.drc(pcb, "all", schematic_parity=parity, refill_zones=has_zones(pcb))


def fab_gate(cli: KiCadCli, pcb: str, preset: str | None = None) -> dict[str, Any]:
    """KiCad's verdict on whether the board can be ordered; ``passed`` is false when anything in ``blocking``."""
    sch = root_schematic(pcb)
    report = _drc(cli, pcb, parity=sch is not None)
    active = [v for v in report["violations"] if not v.get("excluded")]
    drc = [v for v in active if "category" not in v]
    errors = [v for v in drc if v["severity"] == "error"]
    unrouted = [v for v in active if v.get("category") == "unconnected"]
    parity = [v for v in active if v.get("category") == "schematic_parity"]
    blocking: list[str] = []
    if errors:
        blocking.append(f"{len(errors)} DRC error(s): {_types(errors)}")
    if report["unrouted"]:
        blocking.append(f"{report['unrouted']} unrouted connection(s)")
    parity_info: dict[str, Any] = {"checked": sch is not None, "schematic": sch, "issues": len(parity), "by_type": dict(Counter(v["type"] for v in parity))}
    if sch is None:
        parity_info["note"] = "no schematic next to the board, so parity was not checked"
    elif report.get("schematic_parity_error"):
        # kicad-cli then reports an empty parity list: unchecked, not clean.
        parity_info.update(checked=False, note=report["schematic_parity_error"])
        blocking.append(f"schematic parity could not be checked: {parity_info['note']}")
    if parity:
        blocking.append(f"{len(parity)} schematic parity issue(s): {_types(parity)}")
    listed = errors + unrouted + parity
    gate: dict[str, Any] = {
        "passed": False,
        "kicad_version": report.get("kicad_version"),
        "drc": {"errors": len(errors), "warnings": sum(v["severity"] == "warning" for v in drc), "by_type": dict(Counter(v["type"] for v in drc))},
        "unrouted": report["unrouted"],
        "parity": parity_info,
    }
    if preset:
        check = _preset_drc(cli, pcb, preset, {_violation_key(v) for v in errors})
        gate["preset"] = {k: v for k, v in check.items() if k != "violations"}
        if check["errors"]:
            blocking.append(f"{check['errors']} error(s) against {check['label']} limits: {_types(check['violations'])} "
                            f"(kicad_fab_preset makes {check['name']}'s limits the project rules, so kicad_drc shows them)")
            listed += check["violations"]
    gate["passed"] = not blocking
    gate["blocking"] = blocking
    gate["violations"] = [_brief(v) for v in listed[:MAX_LISTED]]
    return gate


# DRC checks that enforce the preset limits; the scratch copy makes them errors whatever the project says.
PRESET_CHECKS = ("annular_width", "clearance", "copper_edge_clearance", "drill_out_of_range", "hole_to_hole", "track_width", "via_diameter")


def _preset_drc(cli: KiCadCli, pcb: str, name: str, known: set[tuple]) -> dict[str, Any]:
    """DRC against the preset's limits on a scratch copy, so the check never edits the user's project.

    The copy keeps the board and its .kicad_pro but not the user's .kicad_dru, and the checks behind the limits are
    errors there: a custom rule or a lowered severity in the project must not hide a track the fab cannot make."""
    preset = load_preset(name)
    pro, _dru = project_files(pcb)
    with tempfile.TemporaryDirectory(prefix="dsh-kicad-fab-preset-") as tmp:
        board = os.path.join(tmp, os.path.basename(pcb))
        shutil.copyfile(pcb, board)
        if os.path.isfile(pro):
            shutil.copyfile(pro, os.path.join(tmp, os.path.basename(pro)))
        scratch_pro = apply_preset(board, name)["project"]
        with open(scratch_pro, encoding="utf-8") as fh:
            data = json.load(fh)
        severities = data["board"]["design_settings"].setdefault("rule_severities", {})
        severities.update({check: "error" for check in PRESET_CHECKS})
        _write_atomic(scratch_pro, json.dumps(data, indent=2))
        report = _drc(cli, board, parity=False)
    fresh = [v for v in report["violations"] if not v.get("excluded") and "category" not in v
             and v["severity"] == "error" and _violation_key(v) not in known]
    return {"name": preset["name"], "label": preset["label"], "errors": len(fresh),
            "by_type": dict(Counter(v["type"] for v in fresh)), "violations": fresh}


def _violation_key(v: dict[str, Any]) -> tuple:
    return (v["type"], tuple(sorted(i.get("uuid", "") for i in v["items"])))


def _brief(v: dict[str, Any]) -> dict[str, Any]:
    out = {k: v[k] for k in ("severity", "type", "description", "items") if k in v}
    out["items"] = out.get("items", [])[:4]
    if "category" in v:
        out["category"] = v["category"]
    return out


def _types(violations: list[dict[str, Any]]) -> str:
    return ", ".join(f"{t} x{n}" if n > 1 else t for t, n in Counter(v["type"] for v in violations).most_common())


# ---- export -----------------------------------------------------------------------------

def fab_layers(pcb: str) -> list[str]:
    """The layers to plot: every copper layer of the board, then the fab layers it has (from its layer table)."""
    try:
        board = Board(pcb)
    except PcbError as exc:
        raise FabError(str(exc)) from exc
    copper = board.copper_layers()
    if not copper:
        raise FabError(f"{pcb} has no readable layer table; open and save it in KiCad, then export again")
    names = {layer["name"] for layer in board.layer_table()}
    return copper + [n for n in FAB_LAYERS if n in names]


def export_fab(cli: KiCadCli, pcb: str, output_dir: str | None = None, preset: str | None = None, force: bool = False,
               extras: list[str] | tuple[str, ...] = (), preview: bool = True) -> dict[str, Any]:
    """Gate, then Gerbers + drill + position (+ BOM, JLC BOM/CPL, extras) in ``output_dir`` and one zip.

    Without ``force`` a failed gate writes nothing; with it the export runs and the result says the gate was overridden.
    """
    spec = load_preset(preset) if preset else None
    unknown = [e for e in extras if e not in EXTRAS]
    if unknown:
        raise FabError(f"unknown extra output(s) {unknown}; choose from {list(EXTRAS)}")
    out = output_dir or os.path.join(os.path.dirname(pcb), "fab", spec["name"] if spec else "kicad")
    gate = fab_gate(cli, pcb, preset)
    result: dict[str, Any] = {"pcb": pcb, "preset": spec["name"] if spec else None, "output_dir": out, "gate": gate}
    if spec:
        result["preset_label"] = spec["label"]
    if not gate["passed"] and not force:
        return {**result, "exported": False, "refused": True, "forced": False}

    _check_output_dir(out, pcb)
    parent = os.path.dirname(os.path.abspath(out))
    created_parent = not os.path.isdir(parent)
    os.makedirs(parent, exist_ok=True)
    # Everything is written to a staging directory next to the output and moved in at the end, so a failing
    # kicad-cli call leaves the previous export (or nothing) behind, never a mix.
    stage = tempfile.mkdtemp(prefix=".fab-stage-", dir=parent)
    try:
        exported = _export_files(cli, pcb, stage, spec, gate, extras, preview)
        _clear_previous(out)
        for dirpath, _dirs, names in os.walk(stage):
            for name in names:
                rel = os.path.relpath(os.path.join(dirpath, name), stage)
                os.makedirs(os.path.dirname(os.path.join(out, rel)), exist_ok=True)
                os.replace(os.path.join(dirpath, name), os.path.join(out, rel))
    finally:
        shutil.rmtree(stage, ignore_errors=True)
        if created_parent and not os.listdir(parent):
            os.rmdir(parent)  # a failed first export leaves no empty fab/ behind
    return {**result, "exported": True, "refused": False, "forced": not gate["passed"], **exported,
            "zip": os.path.join(out, exported["zip"])}


def _export_files(cli: KiCadCli, pcb: str, out: str, spec: dict[str, Any] | None, gate: dict[str, Any],
                  extras: list[str] | tuple[str, ...], preview: bool) -> dict[str, Any]:
    stem = os.path.splitext(os.path.basename(pcb))[0]
    cwd = os.path.dirname(pcb)
    sch = root_schematic(pcb)
    outputs = (spec or {}).get("outputs", {})
    warnings: list[str] = []
    if not gate["passed"]:
        warnings.append("FORCED: exported although the fab gate failed (" + "; ".join(gate["blocking"])
                        + "). KiCad does not consider this board ready to order.")

    gerber = ["pcb", "export", "gerbers", "-o", out + os.sep, "--layers", ",".join(fab_layers(pcb))]
    if _supports(cli, ("pcb", "export", "gerbers"), "--check-zones"):
        gerber.append("--check-zones")
    cli.run(*gerber, pcb, cwd=cwd)
    drill_opts = outputs.get("drill", {})
    drill = ["pcb", "export", "drill", "-o", out + os.sep, "--format", "excellon", "--excellon-units", "mm",
             "--generate-map", "--map-format", drill_opts.get("map_format", "gerberx2")]
    if drill_opts.get("separate_th"):
        drill.append("--excellon-separate-th")
    cli.run(*drill, pcb, cwd=cwd)

    assembly = os.path.join(out, "assembly")
    os.makedirs(assembly, exist_ok=True)
    pos = os.path.join(assembly, f"{stem}-pos.csv")
    pos_args = ["pcb", "export", "pos", "-o", pos, "--format", "csv", "--units", "mm", "--side", "both"]
    if _supports(cli, ("pcb", "export", "pos"), "--exclude-dnp"):
        pos_args.append("--exclude-dnp")
    cli.run(*pos_args, pcb, cwd=cwd)
    if sch:
        cli.bom(sch, output=os.path.join(assembly, f"{stem}-bom.csv"))
    else:
        warnings.append("no schematic next to the board: no BOM in the output")
    if outputs.get("assembly") == "jlc":
        write_jlc_cpl(pos, os.path.join(assembly, f"{stem}-cpl-jlc.csv"))
        if sch:
            write_jlc_bom(cli, sch, os.path.join(assembly, f"{stem}-bom-jlc.csv"))

    for extra in extras:
        if extra == "ipc2581":
            cli.run("pcb", "export", "ipc2581", "-o", os.path.join(out, f"{stem}-ipc2581.xml"), pcb, cwd=cwd)
        elif extra == "odb":
            cli.run("pcb", "export", "odb", "-o", os.path.join(out, f"{stem}-odb.zip"), pcb, cwd=cwd)
        elif extra == "step":
            # kicad-cli exits non-zero when component 3D models are missing, yet still writes the board.
            step = os.path.join(out, f"{stem}.step")
            proc = cli.run("pcb", "export", "step", "--force", "-o", step, pcb, cwd=cwd, check=False)
            log = proc.stdout + proc.stderr
            if not os.path.isfile(step):
                raise KiCadCliError(f"kicad-cli pcb export step failed ({proc.returncode}): {log.strip()[-500:]}")
            missing = log.count("Could not add 3D model")
            if missing:
                warnings.append(f"the STEP model lacks {missing} component 3D model(s) that KiCad could not find")

    files = describe_outputs(out)
    zip_name = f"{stem}-{spec['name'] if spec else 'fab'}.zip"
    with zipfile.ZipFile(os.path.join(out, zip_name), "w", zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            zf.write(os.path.join(out, f["path"]), arcname=f["path"])

    previews: list[str] = []
    if preview:
        os.makedirs(os.path.join(out, "preview"), exist_ok=True)
        for side in ("top", "bottom"):
            png = f"preview/{stem}-{side}.png"
            try:
                cli.run("pcb", "render", "-o", os.path.join(out, png), "--side", side, "--width", "1600", "--height", "1000", pcb, cwd=cwd)
                previews.append(png)
            except KiCadCliError as exc:
                warnings.append(f"3D preview ({side}) failed: {str(exc).splitlines()[0]}")

    warnings += _content_warnings(files)
    board = _job_board(out, files)
    copper = sum(1 for f in files if f["kind"] == "gerber" and (f.get("layer") or "").endswith(".Cu"))
    if board and board.get("copper_layers") and board["copper_layers"] != copper:
        warnings.append(f"the board has {board['copper_layers']} copper layers but {copper} copper Gerber(s) were written")
    manifest = {"generator": GENERATOR, "pcb": pcb, "preset": spec["name"] if spec else None,
                "forced": not gate["passed"], "zip": zip_name, "files": [f["path"] for f in files], "preview": previews}
    _write_atomic(os.path.join(out, MANIFEST), json.dumps(manifest, indent=2) + "\n")
    return {"board": board, "zip": zip_name,
            "layers": [f["layer"] for f in files if f["kind"] == "gerber" and f.get("layer")],
            "files": files, "preview": previews, "warnings": warnings, "notes": (spec or {}).get("notes", [])}


GENERATOR = "dsh-kicad export_fab"


def _previous_export(out: str) -> list[str] | None:
    """Files listed by the manifest of an earlier export into ``out``, or None when there is no valid one."""
    try:
        with open(os.path.join(out, MANIFEST), encoding="utf-8") as fh:
            old = json.load(fh)
    except (OSError, ValueError):
        return None
    if not isinstance(old, dict) or old.get("generator") != GENERATOR:
        return None
    listed = [*(old.get("files") or []), *(old.get("preview") or []), old.get("zip"), MANIFEST]
    return [rel for rel in listed if isinstance(rel, str) and rel]


def _check_output_dir(out: str, pcb: str) -> None:
    """Refuse a non-empty directory that no fab export of this board wrote (never delete the user's files)."""
    if not os.path.isdir(out) or not os.listdir(out):
        return
    if _previous_export(out) is None:
        raise FabError(f"{out} is not empty and was not written by the fab export; choose another output_dir")
    with open(os.path.join(out, MANIFEST), encoding="utf-8") as fh:
        other = json.load(fh).get("pcb")
    if isinstance(other, str) and os.path.basename(other) != os.path.basename(pcb):
        raise FabError(f"{out} holds the fab files of {os.path.basename(other)}; choose another output_dir for {os.path.basename(pcb)}")


def _clear_previous(out: str) -> None:
    """Remove exactly the files the previous export listed in its manifest."""
    root = os.path.realpath(out)
    for rel in _previous_export(out) or []:
        target = os.path.realpath(os.path.join(out, rel))
        if target.startswith(root + os.sep) and os.path.isfile(target):
            os.remove(target)
    for sub in ("assembly", "preview"):
        path = os.path.join(out, sub)
        if os.path.isdir(path) and not os.listdir(path):
            os.rmdir(path)


def describe_outputs(out: str) -> list[dict[str, Any]]:
    """Every file the export wrote (not previews or the zip), with what a fab or viewer will find in it."""
    files = []
    for dirpath, dirnames, names in os.walk(out):
        dirnames[:] = sorted(d for d in dirnames if d != "preview")
        for name in sorted(names):
            path = os.path.join(dirpath, name)
            rel = os.path.relpath(path, out).replace(os.sep, "/")
            if rel == MANIFEST or (dirpath == out and name.endswith(".zip") and not name.endswith("-odb.zip")):
                continue
            entry: dict[str, Any] = {"path": rel, "kind": _kind(name), "bytes": os.path.getsize(path)}
            if entry["kind"] in ("gerber", "drill_map"):
                info = inspect_gerber(path)
                entry.update({k: info[k] for k in ("layer", "function", "draws", "flashes", "valid")})
            elif entry["kind"] == "drill":
                info = inspect_excellon(path)
                entry.update({k: info[k] for k in ("function", "tools", "holes", "valid")})
            files.append(entry)
    order = {"gerber": 0, "drill": 1, "drill_map": 2, "job": 3}
    return sorted(files, key=lambda f: (order.get(f["kind"], 4), _layer_rank(f.get("layer")), f["path"]))


def _layer_rank(layer: str | None) -> tuple[int, int]:
    """Stackup order, top to bottom: paste, silk, mask, copper (F, In1..n, B), mask, silk, paste, outline."""
    if not layer:
        return (9, 0)
    inner = re.fullmatch(r"In(\d+)\.Cu", layer)
    if inner:
        return (4, int(inner.group(1)))
    ranks = {"F.Paste": 0, "F.SilkS": 1, "F.Mask": 2, "F.Cu": 3, "B.Cu": 5, "B.Mask": 6, "B.SilkS": 7, "B.Paste": 8, "Edge.Cuts": 9}
    return (ranks.get(layer, 10), 0)


def _kind(name: str) -> str:
    lower = name.lower()
    if lower.endswith(".gbrjob"):
        return "job"
    if lower.endswith(".drl"):
        return "drill"
    if "-drl_map." in lower:
        return "drill_map"
    if re.search(r"\.(g[tb][lospa]|gm\d+|g\d+|gbr)$", lower):
        return "gerber"
    if lower.endswith("-pos.csv"):
        return "position"
    if lower.endswith("-cpl-jlc.csv"):
        return "cpl"
    if "-bom" in lower and lower.endswith(".csv"):
        return "bom"
    return {".xml": "ipc2581", ".step": "step", ".zip": "odb"}.get(os.path.splitext(lower)[1], "other")


def _content_warnings(files: list[dict[str, Any]]) -> list[str]:
    warnings = []
    for f in files:
        if f.get("valid") is False:
            warnings.append(f"{f['path']} is not a complete {f['kind']} file")
        layer = f.get("layer") or ""
        if f["kind"] == "gerber" and (layer.endswith(".Cu") or layer == "Edge.Cuts") and not (f["draws"] or f["flashes"]):
            warnings.append(f"{layer} is empty" + (": the board has no outline" if layer == "Edge.Cuts" else ""))
    if not any(f.get("layer") == "Edge.Cuts" for f in files):
        warnings.append("no Edge.Cuts Gerber: the board has no outline layer")
    return warnings


def _job_board(out: str, files: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Board size, copper layer count and thickness from KiCad's Gerber job file (what fab order forms ask)."""
    job = next((f for f in files if f["kind"] == "job"), None)
    if not job:
        return None
    try:
        with open(os.path.join(out, job["path"]), encoding="utf-8") as fh:
            specs = json.load(fh).get("GeneralSpecs", {})
    except (OSError, ValueError):
        return None
    size = specs.get("Size") or {}
    return {"width_mm": size.get("X"), "height_mm": size.get("Y"), "copper_layers": specs.get("LayerNumber"),
            "thickness_mm": specs.get("BoardThickness")}


# ---- JLC assembly files -----------------------------------------------------------------

def write_jlc_cpl(pos_csv: str, output: str) -> str:
    """KiCad's position CSV in JLCPCB's CPL columns (Designator, Mid X, Mid Y, Layer, Rotation)."""
    with open(pos_csv, encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(["Designator", "Mid X", "Mid Y", "Layer", "Rotation"])
    for r in rows:
        writer.writerow([r["Ref"], f"{float(r['PosX']):.4f}mm", f"{float(r['PosY']):.4f}mm",
                         "Bottom" if r["Side"].strip().lower() == "bottom" else "Top", f"{float(r['Rot']):g}"])
    _write_atomic(output, buf.getvalue())
    return output


def write_jlc_bom(cli: KiCadCli, sch: str, output: str) -> str:
    """BOM in JLCPCB's columns (Comment, Designator, Footprint, LCSC Part #); the part number comes from the
    first non-empty LCSC / "LCSC Part #" / "JLCPCB Part #" field."""
    fields = ",".join(("Value", "Reference", "Footprint", *LCSC_FIELDS))
    # One designator per part (C1,C2,C3, not C1-C3): JLCPCB matches them one by one against the CPL.
    no_ranges = "" if _supports(cli, ("sch", "export", "bom"), "--ref-range-delimiter") else None
    bom = cli.bom(sch, fields=fields, labels=fields, group_by=",".join(("Value", "Footprint", *LCSC_FIELDS)), exclude_dnp=True,
                  ref_range_delimiter=no_ranges)
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(["Comment", "Designator", "Footprint", "LCSC Part #"])
    for r in bom["rows"]:
        footprint = (r.get("Footprint") or "").split(":", 1)[-1]
        writer.writerow([r.get("Value", ""), r.get("Reference", ""), footprint, next((r[f] for f in LCSC_FIELDS if r.get(f)), "")])
    _write_atomic(output, buf.getvalue())
    return output


# ---- structural readers (stdlib; no gerbv needed) -------------------------------------------

def inspect_gerber(path: str) -> dict[str, Any]:
    """What a Gerber viewer needs to open the file: format, units, X2 file function, operations, end of file."""
    with open(path, encoding="ascii", errors="replace") as fh:
        text = fh.read()
    fs = re.search(r"%FS[LT]AX(\d)(\d)Y\d\d\*%", text)
    units = re.search(r"%MO(MM|IN)\*%", text)
    function = re.search(r"%TF\.FileFunction,([^*]*)\*%", text)
    ops = Counter(m.group(1) for m in re.finditer(r"^(?:[XYIJ]-?\d+)*D0?([123])\*$", text, re.M))
    complete = text.rstrip().endswith("M02*")
    return {
        "format": f"{fs.group(1)}.{fs.group(2)}" if fs else None,
        "units": units.group(1).lower() if units else None,
        "function": function.group(1) if function else None,
        "layer": layer_of(function.group(1)) if function else None,
        "apertures": len(re.findall(r"^%ADD\d+", text, re.M)),
        "draws": ops["1"], "moves": ops["2"], "flashes": ops["3"],
        "complete": complete,
        "valid": bool(fs and units and complete),
    }


def layer_of(function: str) -> str | None:
    """KiCad layer name for a Gerber X2 file function (``Copper,L2,Inr`` -> ``In1.Cu``)."""
    parts = [p.strip() for p in function.split(",")]
    kind = parts[0]
    side = "F" if "Top" in parts else "B" if "Bot" in parts else None
    if kind == "Copper" and len(parts) >= 3:
        number = int(parts[1].lstrip("L") or 0)
        return {"Top": "F.Cu", "Bot": "B.Cu"}.get(parts[2], f"In{number - 1}.Cu")
    if kind == "Profile":
        return "Edge.Cuts"
    suffix = {"Soldermask": "Mask", "Legend": "SilkS", "Paste": "Paste", "Glue": "Adhes"}.get(kind)
    return f"{side}.{suffix}" if suffix and side else None


def inspect_excellon(path: str) -> dict[str, Any]:
    """Excellon structure: header, units, tool table, hit count, end of program."""
    with open(path, encoding="ascii", errors="replace") as fh:
        text = fh.read()
    lines = [ln.strip() for ln in text.splitlines()]
    function = re.search(r"TF\.FileFunction,([^\n]*)", text)
    tools = {f"T{n}": float(d) for n, d in re.findall(r"^T(\d+)C([\d.]+)", text, re.M)}
    holes = sum(1 for ln in lines if re.match(r"^X-?[\d.]+Y-?[\d.]+$", ln))
    header = bool(lines) and lines[0] == "M48"
    units = "mm" if "METRIC" in text else "in" if "INCH" in text else None
    complete = "M30" in lines[-3:]
    return {"function": function.group(1).strip() if function else None, "units": units, "tools": len(tools),
            "diameters": sorted(set(tools.values())), "holes": holes, "complete": complete,
            "valid": header and units is not None and complete}


# ---- helpers ------------------------------------------------------------------------------

def _num(value: Any) -> float:
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else 0.0


def _fmt(value: Any) -> str:
    return "unset" if value is None else json.dumps(value)


def _write_atomic(path: str, text: str) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = f"{path}.tmp-{os.getpid()}"
    with open(tmp, "w", encoding="utf-8", newline="") as fh:
        fh.write(text)
    os.replace(tmp, path)
