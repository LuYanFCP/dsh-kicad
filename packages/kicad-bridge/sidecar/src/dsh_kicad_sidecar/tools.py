"""Tool catalog: JSON schemas plus handlers. Shared by the MCP server and the dsh bridge."""

from __future__ import annotations

import contextvars
import json
import os
import re
import shutil
import threading
from dataclasses import dataclass, field
from typing import Any, Callable

from . import __version__
from .doctor import format_report, platform_info, run_doctor
from .fab import EXTRAS, apply_preset, export_fab, list_presets, preset_names
from .kicad_cli import KiCadCli, KiCadCliError, has_zones, parse_version, MIN_KICAD, svg_to_png
from .schematic import OPERATIONS, Schematic, SchematicError, new_schematic_text
from .pcb import OPERATIONS as PCB_OPERATIONS, Board, PcbError
from .pcb_sync import update_pcb
from .placement import OPERATIONS as PLACE_OPERATIONS, apply as apply_placement, check_placement
from .board3d import QUALITIES, SIDES, export_glb, render_args, render_name
from .autoroute import DEFAULT_TIMEOUT, MAX_TIMEOUT, autoroute
from .freerouting import Cancelled, locate as locate_freerouting
from . import mcu, mcusim, simmodels, spice
from .spice import SimulationError
from .footprints import FootprintLibraries, default_footprint_dirs
from . import geometry
from .symbols import LibraryError, SymbolLibraries, default_symbol_dirs

__all__ = ["ToolError", "Toolbox", "TOOL_SPECS"]


def Circuit_components(netlist):
    return {c["reference"]: c for c in netlist["components"]}


class ToolError(Exception):
    """A domain failure reported to the caller as an ``isError`` result."""


@dataclass
class CallContext:
    """What a long tool call can see of its request: the client's cancellation and a progress channel
    (MCP ``notifications/cancelled`` and ``notifications/progress``)."""

    cancel: threading.Event = field(default_factory=threading.Event)
    progress: Callable[[float, "float | None", str], None] | None = None


_CALL: contextvars.ContextVar[CallContext | None] = contextvars.ContextVar("kicad_call", default=None)


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
        "set_property{reference,name,value,hide?} · "
        "set_sim_model{reference,library?,name?,pins?,device?,params?} (SPICE: library+name binds a .subckt/.model from a model file, pins matched by name or {symbolPin: modelPin}; device alone e.g. D with params sets a built-in model; inspect files with kicad_sim_model) · "
        "set_value{reference,value} · set_footprint{reference,footprint} · "
        "remove_symbol{reference} · move_symbol{reference,x,y,rotation?} · add_wire{points:[[x,y],...]} · "
        "add_label{text,x,y,kind?:label|global_label|hierarchical_label,rotation?,shape?} · add_junction{x,y} · "
        "add_no_connect{x,y} · no_connect_pin{pin:'REF:PIN'} · "
        "connect_pins{a:'REF:PIN',b:'REF:PIN'} (wire routed around parts, labels and other nets; may join wiring already on either pin) · "
        "connect_pin_to_net{pin:'REF:PIN',net,kind?:label|global_label|power} (stub + label or power symbol) · "
        "disconnect_pin{pin:'REF:PIN'} (removes the wires/labels/power symbols/no-connect attached to that pin) · "
        "remove_item{uuid} · remove_label{text,x?,y?} · remove_wire{x,y} (segments ending at x,y). "
        "Layout: set_page{paper?,title?,date?,rev?,company?,comments?} · "
        "add_block{title, references:[...] | x,y,width,height, margin?} (dashed frame + bold title around a functional group) · "
        "move_block{title, dx,dy | x,y} (frame, title, parts inside and their wiring) · "
        "move_symbols{references,dx,dy} (parts with their wires, labels and power symbols; refuses to tear a wire to a part left behind) · "
        "add_text{text,x,y,size?,bold?,rotation?} · add_rectangle{x,y,width,height,style?}. "
        "Rotation is counter-clockwise: Device:R/C/L at 0 are vertical with pin 1 on top, at 90 horizontal with pin 1 on the left. "
        "Wire parts that work together with connect_pins; use power symbols for rails and labels between blocks or across the page."
    ),
    "properties": {"op": {"type": "string", "enum": sorted(OPERATIONS)}},
    "required": ["op"],
    "additionalProperties": True,
}

PCB = {"type": "string", "description": "Path to a .kicad_pcb file."}

PCB_OPERATION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "description": (
        "One board edit. 'op' selects it; millimetres, Y grows downward, rotation in degrees counter-clockwise. "
        "Outline: set_board_outline{width,height,corner_radius?,x?,y?} | set_board_outline{points:[[x,y],...]} (replaces Edge.Cuts) · "
        "add_mounting_hole{x,y,drill?=3.2,plated?,footprint?,reference?}. "
        "Footprints: move_footprint{reference,x?,y?,rotation?,side?:front|back} · move_footprints{references,dx,dy} · "
        "lock_footprint{reference,locked?=true} (locked parts refuse to move). "
        "Rules (stored in the .kicad_pro): set_design_rules{min_clearance?,min_track_width?,min_via_diameter?,min_via_annular_width?,"
        "min_through_hole_diameter?,min_hole_to_hole?,min_hole_clearance?,min_copper_edge_clearance?,min_silk_clearance?,min_text_height?,...} · "
        "set_net_class{name,nets?,track_width?,clearance?,via_diameter?,via_drill?}. "
        "Copper: add_track{points:[[x,y] | 'REF:PAD',...],net?,layer?=F.Cu,width?,locked?} (pad endpoints snap to the pad centre and must be on that net and layer; "
        "locked tracks stay as they are when autoroute runs) · add_via{x,y,net,diameter?,drill?,locked?} · lock_tracks{nets? | uuids?,locked?} · remove_tracks{nets?,locked?} (unroute; locked tracks stay unless locked: true) · add_zone{net,layer|layers,outline?:'board'|[[x,y],...],priority?,clearance?,connect_pads?:thermal|solid|none} · "
        "add_keepout{outline,layers?,tracks?,vias?,pads?,copperpour?,footprints?}. "
        "Silkscreen: add_text{text,x,y,layer?=F.SilkS,size?,thickness?,rotation?} · "
        "set_reference_text{reference,x?,y?,size?,thickness?,rotation?,hide?}. "
        "remove_item{uuid} (any footprint, track, via, zone, text or outline shape; uuids from read_pcb include_items). "
        "Placement: auto_place{groups?:[{title,references}],references?,outline?:fit|keep,gap?=1,group_gap?=2.5,margin?=1} "
        "(lays out every unlocked footprint, or only references, from the schematic's functional blocks: connectors on the "
        "edge facing out, decoupling capacitors at their IC's power pins, crystals at their IC; fit sizes the outline to the "
        "parts, keep places inside the current one) · place_block{title | references, x, y, width?, height?, face?:"
        "left|right|top|bottom} (one block laid out with its top-left corner at x,y, or inside that rectangle)."
    ),
    "properties": {"op": {"type": "string", "enum": sorted({*PCB_OPERATIONS, *PLACE_OPERATIONS})}},
    "required": ["op"],
    "additionalProperties": True,
}

TOOL_SPECS: list[ToolSpec] = [
    ToolSpec("environment", "Report kicad-cli, symbol libraries, rasterizers and KiCad IPC availability.", _obj({}, [])),
    ToolSpec("doctor", "Check whether this machine can run the KiCad tools (kicad-cli present and KiCad 8+, symbol/footprint libraries, "
             "Python 3.10+, optional PNG rasterizer and kicad-python). Every check has a status and a fix; when KiCad is missing "
             "or too old, 'install' lists the ways to install it on this platform.", _obj({}, [])),
    ToolSpec("read_schematic", "Summarize a schematic: page (paper, drawable area), title block, counts, components (reference, value, lib_id, footprint, position), "
             "labels, power nets, sub-sheets, functional blocks (titled frames with the parts inside) and parts outside every block.",
             _obj({"path": SCH, "include_components": {"type": "boolean", "default": True},
                   "include_wiring": {"type": "boolean", "default": False, "description": "Also list wires, junctions and no-connects with uuids."},
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
    ToolSpec("library_symbol", "Inspect a library symbol before placing it: every pin (number, name, electrical type, unit), units, description, keywords, default footprint and footprint filters.",
             _obj({"lib_id": {"type": "string", "description": "e.g. MCU_Microchip_ATtiny:ATtiny85-20S"}, "project_dir": {"type": "string"}}, ["lib_id"])),
    ToolSpec("search_footprints", "Search installed footprint libraries (and the project fp-lib-table) by name terms, e.g. 'R 0603', 'SOT-223', 'USB_C 6P'. With an exact lib_id, confirms it exists and lists its pad names.",
             _obj({"query": {"type": "string", "description": "Name terms (all must match) or an exact Library:Name."},
                   "library": {"type": "string"}, "limit": {"type": "integer", "default": 20},
                   "pads": {"type": "boolean", "default": False, "description": "Include pad names in every result."},
                   "project_dir": {"type": "string"}}, ["query"])),
    ToolSpec("erc", "Run KiCad's Electrical Rules Check on a schematic and return KiCad's verdict and violations.",
             _obj({"path": SCH, "severity": {"type": "string", "enum": ["all", "error", "warning"], "default": "all"}}, ["path"])),
    ToolSpec("drc", "Run KiCad's Design Rules Check on a .kicad_pcb and return KiCad's verdict, violations and unrouted connection count.",
             _obj({"path": {"type": "string", "description": "Path to a .kicad_pcb file."},
                   "severity": {"type": "string", "enum": ["all", "error", "warning"], "default": "all"},
                   "schematic_parity": {"type": "boolean", "default": False},
                   "refill_zones": {"type": "boolean", "description": "Refill zones first (in memory; the file is not changed). Default: when the board has zones."}},
                  ["path"])),
    ToolSpec("render", "Render a schematic (every sheet) or board to SVG with kicad-cli, optionally rasterized to PNG; "
             "view 3d renders a board with KiCad's 3D viewer (kicad-cli pcb render) to PNG, from any side or angle.",
             _obj({"path": PATH, "format": {"type": "string", "enum": ["svg", "png"], "default": "svg"},
                   "view": {"type": "string", "enum": ["2d", "3d"], "default": "2d", "description": "Boards only: 3d is KiCad's 3D view as PNG."},
                   "side": {"type": "string", "enum": list(SIDES), "default": "top", "description": "3D: the side the camera starts from."},
                   "rotate": {"type": ["string", "array"], "items": {"type": "number"},
                              "description": "3D: extra rotation 'X,Y,Z' in degrees after side, e.g. '-45,0,45' for an isometric view from the front left."},
                   "zoom": {"type": "number", "default": 1, "description": "3D: camera zoom (1 shows the whole board, 2 is twice as close)."},
                   "pivot": {"type": ["string", "array"], "items": {"type": "number"},
                             "description": "3D: point to look at, 'X,Y,Z' in cm from the board centre (KiCad 3D axes: X right, Y up the board, Z out of the top)."},
                   "perspective": {"type": "boolean", "default": False, "description": "3D: perspective instead of orthographic projection."},
                   "quality": {"type": "string", "enum": list(QUALITIES), "default": "basic", "description": "3D: high is ray-traced (a few seconds)."},
                   "output_dir": {"type": "string", "description": "Defaults to <project>/.dsh-kicad/render/<name>/."},
                   "pages": {"type": "string", "description": "Comma-separated page numbers (schematic only)."},
                   "width": {"type": "integer", "default": 2000, "description": "PNG width in pixels."},
                   "height": {"type": "integer", "description": "3D: PNG height in pixels (default 3/4 of the width)."},
                   "name": {"type": "string", "description": "3D: fixed file name <board>-3d-<name>.png (default: from side and camera)."}}, ["path"]), writes=True),
    ToolSpec("export_glb", "Export a board as a binary glTF scene (kicad-cli pcb export glb, with copper, mask, silkscreen and the "
             "footprints' 3D models) for an interactive 3D viewer. Cached by board content in <project>/.dsh-kicad/render/<name>/; "
             "reports the board outline, the footprint references (node names of their 3D models) and models KiCad could not find.",
             _obj({"path": PCB, "force": {"type": "boolean", "default": False, "description": "Export again even when the cached scene is current."}},
                  ["path"]), writes=True),
    ToolSpec("simulate", "Verify a schematic's behaviour with SPICE: KiCad exports the netlist (symbols' Sim.* properties, Simulation_SPICE sources), "
             "ngspice runs it headless (op = DC operating point, tran = transient, ac = frequency sweep) and every assertion is judged on the "
             "numbers, never by the model. Probes: V(net), V(netA,netB), I(R1|C1|L1|D1|V1) (ngspice sign: a source that supplies current reads "
             "negative, use abs). Needs ngspice (kicad_doctor says how to install it) and a ground net. Results and the netlist are kept in "
             "<project>/.dsh-kicad/sim/<name>/.",
             _obj({"path": SCH,
                   "analyses": {"type": "array", "maxItems": 3, "description": "Default: one operating point. At most one of each type.",
                                "items": {"type": "object", "properties": {
                                    "type": {"type": "string", "enum": list(spice.ANALYSES)},
                                    "stop": {"type": ["number", "string"], "description": "tran: end time in s (e.g. 10m); ac: last frequency in Hz (e.g. 1Meg)."},
                                    "step": {"type": ["number", "string"], "description": "tran: time step (default stop/1000)."},
                                    "start": {"type": ["number", "string"], "description": "ac: first frequency (Hz), e.g. 10."},
                                    "points": {"type": "integer", "description": "ac: points per decade/octave (default 20)."},
                                    "sweep": {"type": "string", "enum": ["dec", "oct", "lin"], "default": "dec"}},
                                    "required": ["type"], "additionalProperties": False}},
                   "assertions": {"type": "array", "description": (
                       "Requirements to verify. Each: {probe, min?/max?/equals?+tol|tol_pct, name?, abs?, analysis?, measure?, at?, from?, to?, ref?}. "
                       "Numbers accept SPICE suffixes (10k, 100n, 3.3, 20m). Measures: op value; tran final|initial|max|min|mean|rms|pp|at (at = time; "
                       "from/to restrict the window); ac gain_db|phase_deg (at = frequency)|peak_gain_db|lowpass_cutoff_hz|highpass_cutoff_hz "
                       "(ref = reference probe, e.g. V(IN), for a gain relative to the input). analysis is optional when only one ran."),
                       "items": {"type": "object"}},
                   "probes": {"type": "array", "items": {"type": "string"}, "description": "Extra currents to record, e.g. I(R1); node voltages are always recorded."},
                   "monte_carlo": {"type": "object", "description": (
                       "Tolerance analysis: repeat the run with R, C, L values (and V/I DC levels) drawn within their tolerances and report how often each "
                       "assertion holds (needs assertions). {runs?: 2-500 (default 50), seed? (default 1: repeatable), tolerances?: {R: 5, C: 10, L: 10, R1: '1%', V1: 2} "
                       "(percent; keys are a part letter or a reference; defaults R 5, C 10, L 10), distribution?: uniform (default, ±tolerance) | gaussian "
                       "(3σ = tolerance), min_pass_rate?: 0-1 (default 1: every run must pass)}.")},
                   "timeout": {"type": "number", "default": spice.DEFAULT_TIMEOUT, "maximum": spice.MAX_TIMEOUT, "description": "Seconds for ngspice."},
                   "spec": {"type": "string", "description": "Requirements file (JSON with analyses, assertions, probes, monte_carlo, timeout). Default: <schematic name>.sim.json next to the schematic, used when it exists; what the call names replaces the same key of the file."},
                   "save_spec": {"type": "boolean", "default": False, "description": "Write the analyses, assertions and monte_carlo this call used to the spec file, so the requirements stay with the project (and /simulate checks them)."},
                   "output_dir": {"type": "string", "description": "Defaults to <project>/.dsh-kicad/sim/<name>/."}}, ["path"]), writes=True),
    ToolSpec("sim_model", "Find SPICE models for kicad_edit_schematic set_sim_model: lists the .subckt (with their pin names and the comment above them) "
             "and .model (with their device type) definitions in one model file, or in every model file (.lib .mod .sub .cir .sp .spi .ckt .cmp .mdl .inc) "
             "below a folder, optionally filtered by a part of the model name. Read-only.",
             _obj({"path": {"type": "string", "description": "A model file, or a folder to search (e.g. the project folder)."},
                   "name": {"type": "string", "description": "Only models whose name contains this text (case-insensitive)."}}, ["path"])),
    ToolSpec("check_mcu", "Static check of how each microcontroller is wired, from KiCad's netlist and a per-family pin table (MCU providers; covered now: "
             "classic ESP32 modules and PICO, ATtiny25/45/85). Finds strapping pins held at the wrong level at reset (ESP32 GPIO0/2/12), reserved flash/PSRAM pins in use, "
             "input-only pins used to drive or left floating, an EN pin without pull-up, a thin supply decoupling; and judges requirements "
             "{net|pin, needs: output|input|adc|adc1|adc2|dac|touch|boot_free} against the GPIO the signal is on. An MCU no provider covers is reported "
             "as cannot_verify, never as passing. A project can add its own provider as <family>.mcu.json next to the schematic. Read-only.",
             _obj({"path": SCH,
                   "reference": {"type": "string", "description": "Only this MCU (e.g. U1)."},
                   "requirements": {"type": "array", "items": {"type": "object"}, "description": (
                       "What the firmware needs from the board, e.g. [{net: 'VBAT_SENSE', needs: 'adc1'}, {pin: 'U1:IO25', needs: ['output', 'dac']}]. "
                       "needs: output (not input-only), input, adc (adc1 or adc2), adc1 (usable with WiFi), adc2, dac, touch, boot_free (not a strapping pin).")}},
                  ["path"])),
    ToolSpec("simulate_firmware", "Run a firmware image on the simulated MCU against the schematic and judge assertions on what the board does: "
             "press buttons, watch pins, nets and LEDs over time. Covered: ATtiny25/45/85 (a Python AVR core: GPIO, pin-change and INT0 interrupts, "
             "Timer0 normal/CTC, the ADC on PB2-PB5 and the bandgap with Vcc/1.1 V/2.56 V/AREF references, sleep). Anything else the firmware uses (differential ADC, Timer1, USI, PWM, EEPROM, watchdog) stops the run with the reason and the "
             "assertions after that point are cannot-verify, never passed. The board is a DC resistor network with switches, the chip's pin drivers and "
             "pull-ups; LEDs report whether they would light; other parts are open circuits and are listed. Also reports hazards: a floating input read, "
             "an output fighting a switch (overcurrent). Firmware: .hex or .elf built by the user; this tool never builds or invents one.",
             _obj({"path": SCH,
                   "firmware": {"type": "string", "description": "Intel HEX or ELF file for the ATtiny."},
                   "reference": {"type": "string", "description": "The MCU (default: the one covered by a simulator)."},
                   "duration": {"type": ["number", "string"], "description": "Simulated time, e.g. 200ms (default 100ms, at most 5 s)."},
                   "clock_hz": {"type": ["number", "string"], "description": "CPU clock after any CKDIV8 (default 1000000: the factory 8 MHz RC with the divide-by-8 fuse)."},
                   "stimuli": {"type": "array", "items": {"type": "object"}, "description": (
                       "What happens to the board: {at: '50ms', press|release|toggle: 'SW1', name?} or {at, drive: 'NET', level: high|low|release|<volts>}. "
                       "name lets an assertion refer to that moment.")},
                   "assertions": {"type": "array", "items": {"type": "object"}, "description": (
                       "What must hold: subject {led: 'D2', is: on|off} | {pin: 'PB4', level: high|low} | {net: 'NAME', level: high|low} | {net, min?, max?} (volts); "
                       "when {at: '40ms'} | {after: 'press', within: '20ms'} (holds at some moment) | {from: '50ms', to: '150ms'} (holds throughout). "
                       "after/from/to take a time or a stimulus name. name? labels it.")},
                   "initial": {"type": "object", "description": "Switch states at the start, e.g. {SW1: 'closed'} (default all open)."},
                   "vcc": {"type": ["number", "string"], "description": "Supply voltage (default: from the supply net name, else 5)."},
                   "led_vf": {"type": ["number", "string"], "description": "Forward voltage at which an LED counts as lit (default 1.8)."},
                   "timeout": {"type": "number", "default": 60, "description": "Wall-clock seconds."}}, ["path", "firmware"])),
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
    ToolSpec("read_pcb", "Summarize a board: outline size, copper layers, stackup, design rules and net classes (from the .kicad_pro), "
             "footprints (reference, value, footprint, position, rotation, side, locked, courtyard box, pad nets), zones, nets, "
             "placement checks (courtyard overlaps, footprints outside the outline, reference text over pads, ratsnest length) "
             "and KiCad DRC's unrouted connection count.",
             _obj({"path": PCB, "include_footprints": {"type": "boolean", "default": True},
                   "include_pads": {"type": "boolean", "default": False, "description": "Also list every pad with its absolute position and layers."},
                   "include_items": {"type": "boolean", "default": False, "description": "Also list tracks, vias, texts and outline shapes with uuids."},
                   "drc": {"type": "boolean", "default": True, "description": "Run KiCad DRC for the unrouted count and verdict."}}, ["path"])),
    ToolSpec("edit_pcb", "Apply a batch of edit operations to one .kicad_pcb (and its .kicad_pro for rules and net classes) atomically "
             "(all or nothing). Untouched text stays byte-identical.",
             _obj({"path": PCB, "operations": {"type": "array", "items": PCB_OPERATION_SCHEMA, "minItems": 1},
                   "dry_run": {"type": "boolean", "default": False, "description": "Validate and report without writing."}},
                  ["path", "operations"]), writes=True),
    ToolSpec("export_fab", "Fabrication files for a .kicad_pcb in one zip: Gerbers (copper, mask, paste, silkscreen, Edge.Cuts), Excellon drill + map, "
             "position CSV, BOM (when the schematic is next to the board), JLC BOM/CPL with the jlcpcb preset, optional IPC-2581/ODB++/STEP, "
             "and front/back 3D PNG previews. Gated by KiCad: refused while DRC has errors, connections are unrouted, schematic parity "
             "disagrees or (with a preset) the board breaks the fab's limits; force exports anyway and the result says so.",
             _obj({"pcb": PCB,
                   "preset": {"type": "string", "enum": preset_names(), "description": "Fab house: checks its limits and uses its output options."},
                   "output_dir": {"type": "string", "description": "Defaults to <project>/fab/<preset or kicad>/."},
                   "force": {"type": "boolean", "default": False, "description": "Export even when the gate fails (recorded in the result)."},
                   "extras": {"type": "array", "items": {"type": "string", "enum": list(EXTRAS)}, "description": "Additional formats."},
                   "preview": {"type": "boolean", "default": True, "description": "Render front and back 3D PNGs."}}, ["pcb"]), writes=True),
    ToolSpec("fab_preset", "Fab house design-rule presets. Without preset: list them with their limits. With preset: make its limits the project's "
             "rules (board setup minimums in the .kicad_pro, custom rules in a managed block of the .kicad_dru, netclass sizes raised to "
             "the minimums); dry_run lists the changes without writing.",
             _obj({"path": {"type": "string", "description": "The .kicad_pcb or .kicad_pro of the project."},
                   "preset": {"type": "string", "enum": preset_names()},
                   "dry_run": {"type": "boolean", "default": False}}, []), writes=True),
    ToolSpec("update_pcb", "Update a board from its schematic, headless (KiCad's Update PCB from Schematic). Creates "
             "<schematic name>.kicad_pcb when missing (the installed KiCad's empty board, default stackup, parts packed inside a "
             "placeholder outline). Refuses, writing nothing, with every REF:PIN that cannot be placed: symbols without a "
             "footprint, footprints in no library, pins without a pad. On an existing board, placed parts keep position, rotation "
             "and side; new parts are staged right of the outline; references, values, fields and nets follow the schematic "
             "(renamed nets carry their tracks); footprints without a symbol are flagged, or deleted with delete_removed. "
             "Untouched text stays byte-identical. Ends with KiCad's DRC including schematic parity.",
             _obj({"schematic": SCH,
                   "pcb": {"type": "string", "description": "The board (default: <schematic name>.kicad_pcb next to the schematic, which is where KiCad looks)."},
                   "delete_removed": {"type": "boolean", "default": False, "description": "Delete footprints whose symbol is gone (locked ones stay)."},
                   "dry_run": {"type": "boolean", "default": False, "description": "Report the changes without writing."},
                   "copper_layers": {"type": "integer", "enum": [2, 4], "default": 2, "description": "Copper layers of a new board."},
                   "drc": {"type": "boolean", "default": True, "description": "Run KiCad DRC with schematic parity afterwards."}},
                  ["schematic"]), writes=True),
    ToolSpec("autoroute", "Route a board with the Freerouting autorouter, headless: export a Specctra design (tracks and vias already "
             "on the board are fixed wiring, so hand-routed critical nets stay as they are), run Freerouting (Java), import "
             "only the new tracks and vias (footprints never move), save, refill copper zones and run KiCad's DRC. Needs "
             "Java and Freerouting; when they are missing the error says how to install them (doctor has the details). "
             "Cancellable; progress is reported per routing pass.",
             _obj({"pcb": PCB,
                   "nets": {"type": "array", "items": {"type": "string"}, "description": "Route only these nets (names or glob patterns)."},
                   "exclude_nets": {"type": "array", "items": {"type": "string"}, "description": "Leave these nets unrouted (e.g. a GND net left to the pour)."},
                   "passes": {"type": "integer", "minimum": 1, "maximum": 1000, "description": "Maximum routing passes (default: Freerouting's)."},
                   "timeout": {"type": "number", "minimum": 5, "maximum": MAX_TIMEOUT, "default": DEFAULT_TIMEOUT,
                               "description": "Seconds; Freerouting stops and keeps the routes it has."},
                   "fill_zones": {"type": "boolean", "default": True, "description": "Refill and save copper zones afterwards."}},
                  ["pcb"]), writes=True),
    ToolSpec("ipc_status", "Probe a running KiCad GUI through the IPC API (requires the 'ipc' extra and KiCad's API server enabled).", _obj({}, [])),
]

SPEC_BY_NAME = {s.name: s for s in TOOL_SPECS}


class Toolbox:
    def __init__(self, kicad_cli: str | None = None, roots: list[str] | None = None, cwd: str | None = None,
                 java: str | None = None, freerouting: str | None = None, ngspice: str | None = None):
        self.cli = KiCadCli(kicad_cli)
        self.java = java  # the bridge's java / freerouting settings (None: search)
        self.freerouting = freerouting
        self.ngspice = ngspice  # None: $NGSPICE, then PATH
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
    def call(self, name: str, args: dict[str, Any], context: CallContext | None = None) -> dict[str, Any]:
        handler: Callable[[dict[str, Any]], dict[str, Any]] | None = getattr(self, f"tool_{name}", None)
        if name not in SPEC_BY_NAME or handler is None:
            raise ToolError(f"unknown tool '{name}'")
        token = _CALL.set(context)
        try:
            return handler(args or {})
        except (SchematicError, PcbError, LibraryError, KiCadCliError, Cancelled, ValueError, OSError) as exc:
            raise ToolError(str(exc)) from exc
        finally:
            _CALL.reset(token)

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
        self.cli.locate()
        version = self.cli.version_or_none()
        parsed = parse_version(version)
        return {
            "sidecar_version": __version__,
            "platform": platform_info(),
            "kicad_cli": " ".join(self.cli.argv) if self.cli.argv else None,
            "kicad_cli_source": self.cli.source,
            "kicad_version": version,
            "kicad_version_ok": parsed is not None and parsed >= MIN_KICAD,
            "symbol_dirs": default_symbol_dirs(),
            "footprint_dirs": default_footprint_dirs(),
            "rasterizers": rasterizers,
            "ipc_client_installed": ipc,
            "roots": self.roots,
        }

    def tool_doctor(self, _args):
        report = run_doctor(self.cli, router=self.router(), ngspice=spice.locate_ngspice(self.ngspice))
        return {**report, "text": format_report(report)}

    def tool_read_schematic(self, args):
        s = self.schematic(args["path"])
        out = s.summary(include_components=args.get("include_components", True), include_wiring=bool(args.get("include_wiring")))
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

    def footprints(self, project_dir: str) -> FootprintLibraries:
        key = "fp:" + project_dir
        if key not in self._libraries:
            self._libraries[key] = FootprintLibraries(project_dir or None)  # type: ignore[assignment]
        return self._libraries[key]  # type: ignore[return-value]

    def tool_library_symbol(self, args):
        project_dir = self.resolve(args["project_dir"]) if args.get("project_dir") else ""
        node = self.libraries(project_dir).get(args["lib_id"])
        props = {p.value(0): p.value(1) for p in node.lists("property")}
        pins = geometry.library_pins(node)
        units = sorted({p.unit for p in pins if p.unit})
        fp_filters = props.get("ki_fp_filters", "")
        return {
            "lib_id": args["lib_id"],
            "description": props.get("Description", ""), "keywords": props.get("ki_keywords", ""),
            "reference_prefix": props.get("Reference", ""), "default_value": props.get("Value", ""),
            "footprint": props.get("Footprint", ""), "footprint_filters": fp_filters.split() if fp_filters else [],
            "datasheet": props.get("Datasheet", ""), "power_symbol": node.find("power") is not None,
            "units": units or [1],
            "pins": [{"number": p.number, "name": p.name, "type": p.electrical_type, "unit": p.unit or "all", **({"hidden": True} if p.hidden else {})}
                     for p in sorted(pins, key=lambda p: (p.unit, _num_key(p.number))) if p.body_style in (0, 1)],
        }

    def tool_search_footprints(self, args):
        project_dir = self.resolve(args["project_dir"]) if args.get("project_dir") else ""
        libs = self.footprints(project_dir)
        query = args["query"].strip()
        if re.fullmatch(r"[^\s:]+:[^\s]+", query):
            try:
                return {"query": query, "count": 1, "results": [libs.get(query)]}
            except LookupError:
                pass  # fall back to a fuzzy search on the name part
            query = query.split(":", 1)[1]
        results = libs.search(query, library=args.get("library"), limit=int(args.get("limit", 20)), pads=bool(args.get("pads")))
        return {"query": args["query"], "count": len(results), "results": results}

    def tool_erc(self, args):
        path = self.resolve(args["path"], ".kicad_sch")
        return {"path": path, **self.cli.erc(path, args.get("severity", "all"))}

    def tool_drc(self, args):
        path = self.resolve(args["path"], ".kicad_pcb")
        refill = args.get("refill_zones")
        if refill is None:
            refill = has_zones(path)
        return {"path": path, **self.cli.drc(path, args.get("severity", "all"), bool(args.get("schematic_parity")), bool(refill))}

    def board(self, path: str) -> Board:
        full = self.resolve(path, ".kicad_pcb")
        return Board(full, libraries=self.footprints(os.path.dirname(full)))

    def tool_read_pcb(self, args):
        b = self.board(args["path"])
        out = b.summary(include_footprints=args.get("include_footprints", True), include_pads=bool(args.get("include_pads")),
                        include_items=bool(args.get("include_items")))
        out["placement"] = check_placement(b)
        if args.get("drc", True):
            try:
                report = self.cli.drc(b.path, "all", refill_zones=has_zones(b.path))
                out["drc"] = {"passed": report["passed"], "kicad_version": report.get("kicad_version"),
                              "errors": report["counts"]["error"], "warnings": report["counts"]["warning"],
                              "unrouted": report.get("unrouted", 0), "by_type": report["by_type"]}
            except KiCadCliError as exc:
                out["drc"] = {"error": str(exc)}
        return out

    def tool_edit_pcb(self, args):
        ops = args.get("operations")
        if not isinstance(ops, list) or not ops:
            raise ToolError("operations must be a non-empty array")
        full = self.resolve(args["path"], ".kicad_pcb")
        with self.lock(full):
            b = self.board(full)
            results = []
            for i, op in enumerate(ops):
                if not isinstance(op, dict):
                    raise ToolError(f"operation {i} is not an object")
                try:
                    placing = op.get("op") in PLACE_OPERATIONS  # these read the schematic's blocks next to the board
                    results.append({"op": op.get("op"), "result": apply_placement(b, op) if placing else b.apply(op)})
                except PcbError as exc:
                    raise ToolError(f"operation {i} ({op.get('op')}) failed, nothing was written: {exc}") from exc
            files = [] if args.get("dry_run") else b.save()
        return {"path": full, "written": not args.get("dry_run"), "files": files, "applied": len(ops), "changes": b.changes,
                "results": [r for r in results if r["result"] is not None]}

    def tool_update_pcb(self, args):
        schematic = self.resolve(args["schematic"], ".kicad_sch")
        pcb = self.resolve(args["pcb"], ".kicad_pcb", must_exist=False) if args.get("pcb") else os.path.splitext(schematic)[0] + ".kicad_pcb"
        layers = args.get("copper_layers", 2)
        if layers not in (2, 4):
            raise ToolError("copper_layers must be 2 or 4")
        with self.lock(pcb):
            return update_pcb(self.cli, schematic, pcb, delete_removed=bool(args.get("delete_removed")),
                              dry_run=bool(args.get("dry_run")), copper_layers=layers, drc=args.get("drc", True) is not False,
                              on_created=self.board_created)

    def router(self):
        return locate_freerouting(self.java, self.freerouting)

    def tool_autoroute(self, args):
        pcb = self.resolve(args["pcb"], ".kicad_pcb")
        context = _CALL.get() or CallContext()
        with self.lock(pcb):
            return autoroute(self.cli, pcb, self.router(), nets=args.get("nets"), exclude_nets=args.get("exclude_nets"),
                             passes=args.get("passes"), timeout=args.get("timeout", DEFAULT_TIMEOUT),
                             fill_zones=args.get("fill_zones", True) is not False, cancel=context.cancel, progress=context.progress)

    def board_created(self, board: str) -> list[str]:
        """Hook run after update_pcb writes a new board; returns change lines. A fab-preset step plugs in here
        (``fab.apply_preset(board, name)``, e.g. from a ``preset`` argument) so a new board starts with the fab
        house's rules instead of KiCad's defaults."""
        return []

    def tool_render(self, args):
        path = self.resolve(args["path"], (".kicad_sch", ".kicad_pcb"))
        stem = os.path.splitext(os.path.basename(path))[0]
        out_dir = self.resolve(args["output_dir"], must_exist=False) if args.get("output_dir") else \
            os.path.join(os.path.dirname(path), ".dsh-kicad", "render", stem)
        os.makedirs(out_dir, exist_ok=True)
        if args.get("view") == "3d":
            if not path.endswith(".kicad_pcb"):
                raise ToolError("view 3d needs a .kicad_pcb")
            camera = {k: args[k] for k in ("side", "rotate", "zoom", "pivot", "perspective", "quality") if args.get(k) is not None}
            png = os.path.join(out_dir, render_name(stem, **camera, name=args.get("name")))
            self.cli.run(*render_args(path, png, width=args.get("width", 2000), height=args.get("height"), **camera),
                         cwd=os.path.dirname(path))
            return {"path": path, "output_dir": out_dir, "svg": [], "png": [png], "view": "3d",
                    **({"camera": camera} if camera.keys() - {"side"} else {})}
        if path.endswith(".kicad_sch"):
            svgs = self.cli.export_sch_svg(path, out_dir, pages=args.get("pages"))
        else:
            svgs = [self.cli.export_pcb_svg(path, os.path.join(out_dir, stem + ".svg"))]
        result: dict[str, Any] = {"path": path, "output_dir": out_dir, "svg": svgs}
        if args.get("format", "svg") == "png":
            result["png"] = [svg_to_png(svg, os.path.splitext(svg)[0] + ".png", int(args.get("width", 2000))) for svg in svgs]
        return result

    def tool_export_glb(self, args):
        path = self.resolve(args["path"], ".kicad_pcb")
        stem = os.path.splitext(os.path.basename(path))[0]
        out_dir = os.path.join(os.path.dirname(path), ".dsh-kicad", "render", stem)
        with self.lock(path + "#glb"):  # the viewer may ask twice (open + change); the second gets the cache
            return export_glb(self.cli, path, out_dir, force=bool(args.get("force")))

    SPEC_KEYS = ("analyses", "assertions", "probes", "monte_carlo", "timeout")

    def load_spec(self, path: str, explicit: bool) -> dict[str, Any]:
        """The requirements file next to a schematic (``<name>.sim.json``): analyses, assertions, probes, monte_carlo, timeout."""
        try:
            with open(path, encoding="utf-8") as fh:
                spec = json.load(fh)
        except json.JSONDecodeError as exc:
            raise ToolError(f"{path} is not valid JSON: {exc}") from exc
        if not isinstance(spec, dict):
            raise ToolError(f"{path} must hold a JSON object with {', '.join(self.SPEC_KEYS)}")
        unknown = sorted(set(spec) - set(self.SPEC_KEYS))
        if unknown:
            raise ToolError(f"{path}: unknown key(s) {', '.join(unknown)}; the spec holds {', '.join(self.SPEC_KEYS)}")
        return spec

    def tool_simulate(self, args):
        path = self.resolve(args["path"], ".kicad_sch")
        if self.ngspice and not os.path.isfile(self.ngspice):
            raise ToolError(f"the ngspice setting {self.ngspice} is not a file; fix or clear it (empty: $NGSPICE, then PATH)")
        executable = spice.locate_ngspice(self.ngspice)
        if not executable:
            raise ToolError("ngspice was not found. Install it (see kicad_doctor; e.g. `sudo dnf install ngspice` / `sudo apt-get install ngspice` / "
                            f"`brew install ngspice`, or {spice.DOWNLOAD_URL}) or set the KiCad bridge 'ngspice' setting / $NGSPICE to its path.")
        stem = os.path.splitext(os.path.basename(path))[0]
        out_dir = self.resolve(args["output_dir"], must_exist=False) if args.get("output_dir") else \
            os.path.join(os.path.dirname(path), ".dsh-kicad", "sim", stem)
        default_spec = os.path.join(os.path.dirname(path), f"{stem}.sim.json")
        if args.get("spec"):
            spec_path = self.resolve(args["spec"], ".json", must_exist=not args.get("save_spec"))
        else:
            spec_path = default_spec
        spec = self.load_spec(spec_path, bool(args.get("spec"))) if os.path.isfile(spec_path) else {}
        given = {k: args[k] for k in self.SPEC_KEYS if args.get(k) is not None}
        use = {**spec, **given}  # what the call names replaces the same key of the file
        if args.get("save_spec"):
            to_save = {k: use[k] for k in self.SPEC_KEYS if k in use and use[k] not in (None, [], {})}
            if not to_save.get("assertions"):
                raise ToolError("save_spec writes the requirements: give assertions")
            with self.lock(spec_path):
                with open(spec_path, "w", encoding="utf-8") as fh:
                    json.dump(to_save, fh, indent=2, ensure_ascii=False)
                    fh.write("\n")
        try:
            result = spice.simulate(self.cli, path, out_dir, use.get("analyses"), use.get("assertions"), executable,
                                    timeout=float(use.get("timeout", spice.DEFAULT_TIMEOUT)), probes=use.get("probes"),
                                    monte_carlo=use.get("monte_carlo"))
        except spice.SimulationError as exc:
            raise ToolError(str(exc)) from exc
        if spec or args.get("save_spec"):
            result["spec"] = {"path": spec_path, "loaded": sorted(set(spec) - set(given)) if spec else [], "saved": bool(args.get("save_spec"))}
        return result

    def tool_check_mcu(self, args):
        path = self.resolve(args["path"], ".kicad_sch")
        try:
            result = mcu.check_schematic(self.cli.netlist(path), os.path.dirname(path), args.get("requirements"), args.get("reference"))
        except (mcu.McuError, SimulationError) as exc:
            raise ToolError(str(exc)) from exc
        return {"path": path, **result}

    def tool_simulate_firmware(self, args):
        path = self.resolve(args["path"], ".kicad_sch")
        firmware = self.resolve(args["firmware"])
        netlist = self.cli.netlist(path)
        providers = [p for p in mcu.load_providers(os.path.dirname(path)) if p.get("simulator") == "avr-attiny85"]
        candidates = []
        for ref, comp in sorted(Circuit_components(netlist).items()):
            if args.get("reference") and ref != args["reference"]:
                continue
            provider = next((p for p in providers if mcu._patterns(p["match"], comp.get("lib_id", ""), comp.get("value", ""))), None)
            if provider:
                candidates.append((ref, provider))
        if not candidates:
            raise ToolError("no MCU with a firmware simulator in this schematic: only the ATtiny25/45/85 can be simulated" +
                            (f" (there is no {args['reference']} among them)" if args.get("reference") else "") +
                            "; kicad_check_mcu still checks the wiring of the MCUs it covers")
        ref, provider = candidates[0]
        try:
            result = mcusim.simulate_firmware(netlist, ref, provider, firmware, args.get("stimuli"), args.get("assertions"), args.get("duration"), args.get("clock_hz"),
                                              args.get("vcc"), args.get("led_vf"), args.get("initial"), timeout=float(args.get("timeout", 60)))
        except (SimulationError, mcu.McuError) as exc:
            raise ToolError(str(exc)) from exc
        if len(candidates) > 1:
            result["notes"].append(f"{len(candidates)} simulable MCUs found; simulated {ref} (pass reference to choose)")
        return {"path": path, **result}

    def tool_sim_model(self, args):
        path = self.resolve(args["path"])
        try:
            return simmodels.scan(path, args.get("name"))
        except simmodels.ModelError as exc:
            raise ToolError(str(exc)) from exc

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

    def tool_export_fab(self, args):
        pcb = self.resolve(args["pcb"], ".kicad_pcb")
        out = self.resolve(args["output_dir"], must_exist=False) if args.get("output_dir") else None
        with self.lock(pcb):
            return export_fab(self.cli, pcb, output_dir=out, preset=args.get("preset") or None, force=bool(args.get("force")),
                              extras=list(args.get("extras") or []), preview=args.get("preview", True) is not False)

    def tool_fab_preset(self, args):
        if not args.get("preset"):
            return {"presets": list_presets()}
        if not args.get("path"):
            raise ToolError("path (the project's .kicad_pcb or .kicad_pro) is required to apply a preset")
        path = self.resolve(args["path"], (".kicad_pcb", ".kicad_pro"))
        with self.lock(path):
            return apply_preset(path, args["preset"], dry_run=bool(args.get("dry_run")))

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


def _num_key(number: str):
    return (0, int(number), "") if number.isdigit() else (1, 0, number)
