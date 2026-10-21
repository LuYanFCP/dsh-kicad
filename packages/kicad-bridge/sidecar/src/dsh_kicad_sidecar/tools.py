"""Tool catalog: JSON schemas plus handlers. Shared by the MCP server and the dsh bridge."""

from __future__ import annotations

import os
import shutil
import threading
from dataclasses import dataclass
from typing import Any, Callable

from . import __version__
from .kicad_cli import KiCadCli, KiCadCliError, svg_to_png
from .schematic import OPERATIONS, Schematic, SchematicError, new_schematic_text
from .symbols import LibraryError, SymbolLibraries, default_symbol_dirs

__all__ = ["ToolError", "Toolbox", "TOOL_SPECS"]


class ToolError(Exception):
    """A domain failure reported to the caller as an ``isError`` result."""


@dataclass
class ToolSpec:
    name: str
    description: str
    schema: dict[str, Any]
    writes: bool = False


def _obj(props: dict[str, Any], required: list[str]) -> dict[str, Any]:
    return {"type": "object", "properties": props, "required": required, "additionalProperties": False}


PATH = {"type": "string", "description": "Absolute path (or relative to the server's working directory)."}
SCH = {"type": "string", "description": "Path to a .kicad_sch file."}

OPERATION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "description": (
        "One edit. 'op' selects it; coordinates are schematic millimetres (Y grows downward) and snap to the 1.27 mm grid. "
        "add_symbol{lib_id,x,y,reference?,value?,rotation?,mirror?,unit?,footprint?,properties?,dnp?} · "
        "set_property{reference,name,value,hide?} · set_value{reference,value} · set_footprint{reference,footprint} · "
        "remove_symbol{reference} · move_symbol{reference,x,y,rotation?} · add_wire{points:[[x,y],...]} · "
        "add_label{text,x,y,kind?:label|global_label|hierarchical_label,rotation?,shape?} · add_junction{x,y} · "
        "add_no_connect{x,y} · no_connect_pin{pin:'REF:PIN'} · connect_pins{a:'REF:PIN',b:'REF:PIN'} · "
        "connect_pin_to_net{pin:'REF:PIN',net,kind?:label|global_label|power}"
    ),
    "properties": {"op": {"type": "string", "enum": sorted(OPERATIONS)}},
    "required": ["op"],
    "additionalProperties": True,
}

TOOL_SPECS: list[ToolSpec] = [
    ToolSpec("environment", "Report kicad-cli, symbol libraries, rasterizers and KiCad IPC availability.", _obj({}, [])),
    ToolSpec("read_schematic", "Summarize a schematic: title block, counts, components (reference, value, lib_id, footprint, position), labels, power nets, sub-sheets.",
             _obj({"path": SCH, "include_components": {"type": "boolean", "default": True},
                   "include_subsheets": {"type": "boolean", "default": False, "description": "Also summarize every sub-sheet file."}}, ["path"])),
    ToolSpec("list_components", "List placed components, optionally filtered by a case-insensitive substring of reference, value, lib_id or footprint.",
             _obj({"path": SCH, "filter": {"type": "string"}}, ["path"])),
    ToolSpec("get_symbol_pins", "Pins of one placed symbol with absolute positions and outward directions — use before wiring.",
             _obj({"path": SCH, "reference": {"type": "string"}}, ["path", "reference"])),
    ToolSpec("list_nets", "Connectivity computed by KiCad (kicad-cli netlist): every net with its member pins.",
             _obj({"path": SCH, "net": {"type": "string", "description": "Only nets whose name contains this text."}}, ["path"])),
    ToolSpec("search_symbols", "Search installed KiCad symbol libraries (and the project's sym-lib-table) by keywords; returns lib_ids to use with add_symbol.",
             _obj({"query": {"type": "string"}, "library": {"type": "string"}, "limit": {"type": "integer", "default": 20},
                   "project_dir": {"type": "string"}}, ["query"])),
    ToolSpec("erc", "Run KiCad's Electrical Rules Check on a schematic and return KiCad's verdict and violations.",
             _obj({"path": SCH, "severity": {"type": "string", "enum": ["all", "error", "warning"], "default": "all"}}, ["path"])),
    ToolSpec("drc", "Run KiCad's Design Rules Check on a .kicad_pcb and return KiCad's verdict and violations.",
             _obj({"path": {"type": "string", "description": "Path to a .kicad_pcb file."},
                   "severity": {"type": "string", "enum": ["all", "error", "warning"], "default": "all"},
                   "schematic_parity": {"type": "boolean", "default": False}}, ["path"])),
    ToolSpec("render", "Render a schematic (every sheet) or board to SVG with kicad-cli, optionally rasterized to PNG.",
             _obj({"path": PATH, "format": {"type": "string", "enum": ["svg", "png"], "default": "svg"},
                   "output_dir": {"type": "string", "description": "Defaults to <project>/.dsh-kicad/render/<name>/."},
                   "pages": {"type": "string", "description": "Comma-separated page numbers (schematic only)."},
                   "width": {"type": "integer", "default": 2000, "description": "PNG width in pixels."}}, ["path"]), writes=True),
    ToolSpec("export_netlist", "Write a netlist file with kicad-cli.",
             _obj({"path": SCH, "output": {"type": "string"},
                   "format": {"type": "string", "enum": ["kicadsexpr", "kicadxml", "cadstar", "orcadpcb2", "spice", "spicemodel", "pads", "allegro"], "default": "kicadsexpr"}},
                  ["path", "output"]), writes=True),
    ToolSpec("export_bom", "Bill of materials grouped by value and footprint (kicad-cli). Optionally also writes the CSV.",
             _obj({"path": SCH, "output": {"type": "string"}, "group_by": {"type": "string", "default": "Value,Footprint"},
                   "exclude_dnp": {"type": "boolean", "default": False}}, ["path"]), writes=True),
    ToolSpec("create_schematic", "Create a blank KiCad 10 schematic (and a minimal .kicad_pro next to it when missing).",
             _obj({"path": SCH, "paper": {"type": "string", "default": "A4"}}, ["path"]), writes=True),
    ToolSpec("edit_schematic", "Apply a batch of edit operations to one .kicad_sch atomically (all or nothing). Untouched text stays byte-identical.",
             _obj({"path": SCH, "operations": {"type": "array", "items": OPERATION_SCHEMA, "minItems": 1},
                   "dry_run": {"type": "boolean", "default": False, "description": "Validate and report without writing."}},
                  ["path", "operations"]), writes=True),
    ToolSpec("ipc_status", "Probe a running KiCad GUI through the IPC API (requires the 'ipc' extra and KiCad's API server enabled).", _obj({}, [])),
]

SPEC_BY_NAME = {s.name: s for s in TOOL_SPECS}


class Toolbox:
    def __init__(self, kicad_cli: str | None = None, roots: list[str] | None = None, cwd: str | None = None):
        self.cli = KiCadCli(kicad_cli)
        self.roots = [os.path.realpath(r) for r in roots or []]
        self.cwd = cwd or os.getcwd()
        self._libraries: dict[str, SymbolLibraries] = {}
        self._locks: dict[str, threading.Lock] = {}
        self._locks_guard = threading.Lock()

    # ---- helpers -------------------------------------------------------------------
    def resolve(self, path: str, suffix: str | tuple[str, ...] | None = None, must_exist: bool = True) -> str:
        if not isinstance(path, str) or not path:
            raise ToolError("path must be a non-empty string")
        full = os.path.realpath(os.path.join(self.cwd, os.path.expanduser(path)))
        if self.roots and not any(full == r or full.startswith(r + os.sep) for r in self.roots):
            raise ToolError(f"{full} is outside the allowed roots {self.roots}")
        if suffix and not full.endswith(suffix):
            raise ToolError(f"expected a {suffix} file, got {full}")
        if must_exist and not os.path.exists(full):
            raise ToolError(f"{full} does not exist")
        return full

    def libraries(self, project_dir: str) -> SymbolLibraries:
        if project_dir not in self._libraries:
            self._libraries[project_dir] = SymbolLibraries(project_dir)
        return self._libraries[project_dir]

    def lock(self, path: str) -> threading.Lock:
        with self._locks_guard:
            return self._locks.setdefault(path, threading.Lock())

    def schematic(self, path: str) -> Schematic:
        full = self.resolve(path, ".kicad_sch")
        return Schematic(full, libraries=self.libraries(os.path.dirname(full)))

    # ---- dispatch ------------------------------------------------------------------
    def call(self, name: str, args: dict[str, Any]) -> dict[str, Any]:
        handler: Callable[[dict[str, Any]], dict[str, Any]] | None = getattr(self, f"tool_{name}", None)
        if name not in SPEC_BY_NAME or handler is None:
            raise ToolError(f"unknown tool '{name}'")
        try:
            return handler(args or {})
        except (SchematicError, LibraryError, KiCadCliError, ValueError, OSError) as exc:
            raise ToolError(str(exc)) from exc

    # ---- tools ---------------------------------------------------------------------
    def tool_environment(self, _args):
        rasterizers = [n for n in ("rsvg-convert", "magick", "convert", "inkscape") if shutil.which(n)]
        try:
            import cairosvg  # type: ignore  # noqa: F401
            rasterizers.insert(0, "cairosvg")
        except ImportError:
            pass
        try:
            import kipy  # type: ignore  # noqa: F401
            ipc = True
        except ImportError:
            ipc = False
        return {
            "sidecar_version": __version__,
            "kicad_cli": " ".join(self.cli.argv) if self.cli.argv else None,
            "kicad_version": self.cli.version(),
            "symbol_dirs": default_symbol_dirs(),
            "rasterizers": rasterizers,
            "ipc_client_installed": ipc,
            "roots": self.roots,
        }

    def tool_read_schematic(self, args):
        s = self.schematic(args["path"])
        out = s.summary(include_components=args.get("include_components", True))
        if args.get("include_subsheets"):
            subs = []
            for sheet in out["sheets"]:
                sub_path = os.path.join(os.path.dirname(s.path), sheet["file"])
                if os.path.isfile(sub_path):
                    subs.append(self.schematic(sub_path).summary(include_components=args.get("include_components", True)))
            out["subsheets"] = subs
        return out

    def tool_list_components(self, args):
        s = self.schematic(args["path"])
        comps = s.summary()["components"]
        needle = (args.get("filter") or "").lower()
        if needle:
            comps = [c for c in comps if any(needle in str(c.get(k, "")).lower() for k in ("reference", "value", "lib_id", "footprint"))]
        return {"path": s.path, "count": len(comps), "components": comps}

    def tool_get_symbol_pins(self, args):
        s = self.schematic(args["path"])
        sym = s.find_symbol(args["reference"])
        return {"reference": args["reference"], "lib_id": sym.lib_id, "at": list(sym.at), "pins": s.pins(args["reference"])}

    def tool_list_nets(self, args):
        path = self.resolve(args["path"], ".kicad_sch")
        net = self.cli.netlist(path)
        needle = args.get("net")
        nets = [n for n in net["nets"] if not needle or needle.lower() in (n["name"] or "").lower()]
        return {"path": path, "count": len(nets), "nets": nets}

    def tool_search_symbols(self, args):
        project_dir = self.resolve(args["project_dir"]) if args.get("project_dir") else None
        libs = self.libraries(project_dir) if project_dir else self.libraries("")
        results = libs.search(args["query"], limit=int(args.get("limit", 20)), library=args.get("library"))
        return {"query": args["query"], "count": len(results), "results": results}

    def tool_erc(self, args):
        path = self.resolve(args["path"], ".kicad_sch")
        return {"path": path, **self.cli.erc(path, args.get("severity", "all"))}

    def tool_drc(self, args):
        path = self.resolve(args["path"], ".kicad_pcb")
        return {"path": path, **self.cli.drc(path, args.get("severity", "all"), bool(args.get("schematic_parity")))}

    def tool_render(self, args):
        path = self.resolve(args["path"], (".kicad_sch", ".kicad_pcb"))
        stem = os.path.splitext(os.path.basename(path))[0]
        out_dir = self.resolve(args["output_dir"], must_exist=False) if args.get("output_dir") else \
            os.path.join(os.path.dirname(path), ".dsh-kicad", "render", stem)
        os.makedirs(out_dir, exist_ok=True)
        if path.endswith(".kicad_sch"):
            svgs = self.cli.export_sch_svg(path, out_dir, pages=args.get("pages"))
        else:
            svgs = [self.cli.export_pcb_svg(path, os.path.join(out_dir, stem + ".svg"))]
        result: dict[str, Any] = {"path": path, "output_dir": out_dir, "svg": svgs}
        if args.get("format", "svg") == "png":
            result["png"] = [svg_to_png(svg, os.path.splitext(svg)[0] + ".png", int(args.get("width", 2000))) for svg in svgs]
        return result

    def tool_export_netlist(self, args):
        path = self.resolve(args["path"], ".kicad_sch")
        output = self.resolve(args["output"], must_exist=False)
        self.cli.export_netlist_file(path, output, args.get("format", "kicadsexpr"))
        return {"path": path, "output": output, "format": args.get("format", "kicadsexpr")}

    def tool_export_bom(self, args):
        path = self.resolve(args["path"], ".kicad_sch")
        output = self.resolve(args["output"], must_exist=False) if args.get("output") else None
        bom = self.cli.bom(path, group_by=args.get("group_by", "Value,Footprint"), exclude_dnp=bool(args.get("exclude_dnp")), output=output)
        bom.pop("csv", None) if output else None
        return {"path": path, **bom}

    def tool_create_schematic(self, args):
        path = self.resolve(args["path"], ".kicad_sch", must_exist=False)
        if os.path.exists(path):
            raise ToolError(f"{path} already exists")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(new_schematic_text(paper=args.get("paper", "A4")))
        pro = os.path.splitext(path)[0] + ".kicad_pro"
        created = [path]
        if not any(f.endswith(".kicad_pro") for f in os.listdir(os.path.dirname(path))):
            import json

            with open(pro, "w", encoding="utf-8") as fh:
                json.dump({"meta": {"filename": os.path.basename(pro), "version": 3}}, fh, indent=2)
                fh.write("\n")
            created.append(pro)
        return {"created": created}

    def tool_edit_schematic(self, args):
        ops = args.get("operations")
        if not isinstance(ops, list) or not ops:
            raise ToolError("operations must be a non-empty array")
        full = self.resolve(args["path"], ".kicad_sch")
        with self.lock(full):
            s = self.schematic(full)
            results = []
            for i, op in enumerate(ops):
                if not isinstance(op, dict):
                    raise ToolError(f"operation {i} is not an object")
                try:
                    results.append({"op": op.get("op"), "result": s.apply(op)})
                except (SchematicError, LibraryError) as exc:
                    raise ToolError(f"operation {i} ({op.get('op')}) failed, nothing was written: {exc}") from exc
            if not args.get("dry_run"):
                s.save()
        return {"path": full, "written": not args.get("dry_run"), "applied": len(ops), "changes": s.changes,
                "results": [r for r in results if r["result"] is not None]}

    def tool_ipc_status(self, _args):
        try:
            from kipy import KiCad  # type: ignore
        except ImportError:
            return {"available": False, "reason": "kicad-python (kipy) is not installed; install the sidecar's 'ipc' extra"}
        try:
            kicad = KiCad(timeout_ms=2000)
            version = str(kicad.get_version())
            docs = []
            try:
                from kipy.proto.common.types import DocumentType  # type: ignore

                for kind in ("DOCTYPE_SCHEMATIC", "DOCTYPE_PCB"):
                    for d in kicad.get_open_documents(getattr(DocumentType, kind)):
                        docs.append({"type": kind, "project": d.project.path, "board": d.board_filename})
            except Exception as exc:  # pragma: no cover - depends on a live KiCad
                docs.append({"error": str(exc)})
            return {"available": True, "kicad_version": version, "open_documents": docs}
        except Exception as exc:
            return {"available": False, "reason": f"no KiCad IPC server reachable: {exc}"}
