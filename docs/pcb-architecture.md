# PCB architecture: generating and updating `.kicad_pcb` headlessly

PCB-0 spike, #9 (part of the roadmap in #16). This document records the decision, the evidence and the
design that #10 (`kicad_update_pcb`) implements and #11–#14 build on. Measured with KiCad 10.0.7 on
Fedora 44 (`/usr/bin/kicad-cli`, stock libraries in `/usr/share/kicad`).

## Decision

**Option A: the sidecar writes `.kicad_pcb` itself**, with the stdlib-only, lossless S-expression code it
already uses for schematics. Two steps stay with KiCad:

- **The empty board comes from KiCad.** The one-line stub `(kicad_pcb (version 20240108) (generator "dsh-kicad"))`
  run through `kicad-cli pcb upgrade --force` becomes the installed KiCad's empty board in its native
  format (layer table, setup, plot parameters). The result is byte-identical to `pcbnew.CreateEmptyBoard()`
  saved, so the sidecar keeps no per-version layer tables.
- **Zone fills come from KiCad.** `kicad-cli pcb drc --refill-zones --save-board` is a working headless
  "fill zones and save".

**Option B (pcbnew SWIG) is not used to generate or update boards.** It stays an optional extra that
`doctor` detects, for Specctra DSN/SES (#13) if that path is chosen, and as a test oracle. Option C (IPC
API) needs a running GUI and admits one client at a time, so it is out for a headless flow.

Why A:

1. **Both options produce the same board.** Each passes `--schematic-parity` with 0 issues. Footprint ids,
   symbol paths and all 52 pad nets are identical.
2. **A's output is what KiCad itself writes.** Re-saving A's board with KiCad (`kicad-cli pcb upgrade --force`)
   changes 0 bytes. Opening and saving it in KiCad causes no diff noise. Later sidecar edits only rewrite
   the atoms they touch.
3. **B saves no work.** SWIG does not wrap `BOARD_NETLIST_UPDATER`, so B needs the same hand-written
   netlist → board mapping (load footprint, set path, set each pad's net). Only the final serializer
   differs.
4. **B does not run where the sidecar runs.** `pcbnew` imports only in the interpreter KiCad was built
   against. Here that is `/usr/bin/python3` (3.14, from the `kicad` RPM). The sidecar's `uv` launcher
   venv (Python 3.12) fails with `ModuleNotFoundError: No module named 'pcbnew'`. On Flatpak, macOS and
   Windows only KiCad's bundled interpreter has it.
5. **B is deprecated and its API changes.** The SWIG bindings are deprecated in favour of IPC. In
   KiCad 10, `FOOTPRINT.AddField` no longer exists (the spike had to switch to `SetField`). B's output is
   also not reproducible: it uses random uuids, and mm → nm rounding gives `130.169999` where A writes
   `130.17`.

A's costs are the ones #9 anticipated: footprint library resolution, pad → net mapping, uuid/path linking
and file format versions. The spike solved each of them and checked the result against KiCad (see below).

## Evidence

Everything below is reproduced by `spike/pcb/run.sh [work dir]`. It copies the fixture, runs both
options, the round trip, the KiCad 9 net syntax, the zone fill and the sync scenario, and prints each
`kicad-cli` verdict.

### Input: the usb-attiny85 eval schematic

`/tmp/kc/complex-1/usb_attiny.kicad_sch` (+ `.kicad_pro`) is now the fixture
`packages/kicad-bridge/sidecar/tests/fixtures/usb_attiny/`.

| Check | Result |
|---|---|
| `kicad-cli sch erc --severity-all` | 0 violations |
| every symbol has a footprint | **no:** the two `power:PWR_FLAG`s were annotated `FLG1`/`FLG2` |

A power symbol whose reference does not start with `#` is a real part to KiCad. It enters the netlist
without a footprint, and parity reports `missing_footprint` for FLG1 and FLG2. The fixture renames them
to `#FLG01`/`#FLG02` (4 lines, what KiCad's annotator produces). After that: ERC 0, 15 components all
with footprints, 13 nets. `tests/test_netlist.py::test_usb_attiny_fixture_is_ready_for_a_board` keeps it
that way.

Root cause: the model passed `reference="FLG1"` and `Schematic.add_symbol` accepted it for a power
symbol. Follow-ups: `add_symbol` should force the `#` prefix for power symbols; #10's pre-sync check
reports any on-board symbol without a footprint.

### Parity: both options

`kicad-cli pcb drc --schematic-parity --severity-all --format json` (the project's schematic sits next to the board):

| | footprints | parity issues | DRC violations | unconnected |
|---|---|---|---|---|
| A, `spike/pcb/option_a.py` (KiCad 10 syntax) | 15 | **0** | 0 | 39 (unrouted) |
| A, KiCad 8/9 syntax (`--kicad9`, numbered nets) | 15 | **0** | 0 | 36 (with filled GND pour) |
| B, `spike/pcb/option_b.py` (pcbnew SWIG) | 15 | **0** | 0 | 39 (unrouted) |

`spike/pcb/compare.py` on A and B reports the same references, footprint ids, symbol paths and pad → net
map (52 pads, all with a net). In KiCad 10, parity findings are **warnings** by default.
`missing_footprint` and `footprint_symbol_field_mismatch` both showed up as warnings during the spike.
So "0 errors" does not mean parity holds: the `schematic_parity` list must be empty.

Before the fixes, A's first run had 3 `footprint_symbol_field_mismatch` warnings. Library footprints that
already carry `Datasheet`/`Description` must get the symbol's values. Parity checks fields.

### A is byte-identical to KiCad's writer

```
cp usb_attiny.kicad_pcb resaved.kicad_pcb && kicad-cli pcb upgrade --force resaved.kicad_pcb
cmp usb_attiny.kicad_pcb resaved.kicad_pcb      # no output: identical
```

Getting there took four fixes, now in `option_a.instantiate`:
- emit footprints sorted by uuid (KiCad sorts on save);
- order properties as Reference, Value, Datasheet, Description, then the rest;
- drop the uuids some `.kicad_mod` files carry (the GCT USB-C receptacle does) and give every instance its own;
- give copied user fields a 0.15 pen, as KiCad does.

### The footprint link rule holds on KiCad's demos

New footprints get `(path "<sheet uuids>/<first unit's symbol uuid>")`. Comparing `netlist.read_netlist`
with the boards of the 16 demo projects in `/usr/share/kicad/demos` gives 3,901 of 3,906 footprints
linked by exactly this path, including hierarchical sheets (3,293 parts in sub-sheets) and 59 multi-unit
symbols. The 5 others (J4 and U4 in tinytapeout, P2 and J15 in vme-wren, JP101 in coldfire) are
multi-unit symbols whose footprint is linked to another unit's uuid, which KiCad's updater accepts.
Hence the matching rule below: the path of any unit. Reference matching is a fallback for symbols that
were deleted and re-created; KiCad offers it as "re-link by reference", and its parity check matches by
reference anyway. Reproduce with `spike/pcb/demo_paths.py`.

### Headless zone fill

On A's board with an unfilled GND zone on B.Cu:

| Command | Result |
|---|---|
| `kicad-cli pcb drc --schematic-parity --refill-zones` | unconnected 39 → 36 (THT shield pads join through the pour), file untouched |
| `… --refill-zones --save-board` | `Saved board`; `filled_polygon` added; of 25 top-level items only the zone changed; `.kicad_pro` untouched |

So zone edits (#11, #13's GND pour) write unfilled zones, and a `--refill-zones --save-board` step fills
them. Because A's text equals KiCad's writer, that save does not reformat the rest of the file.

### Incremental sync prototype (`spike/pcb/sync.py`, `sync_scenario.py`)

Run on the KiCad-saved board above (zone filled, plus a track on `/PB4_LED`):

| Step | Result |
|---|---|
| R1's `path` made stale, sync | `R1: relinked to its symbol by reference`; file byte-identical to before |
| sync, schematic unchanged | `changed: False`; file byte-identical |
| edit the schematic: R2 330 → 470, remove R5, add C4 (+3V3/GND), rename label PB4_LED → LED; sync | removed R5, added C4, `R2: Value`, `net /PB4_LED renamed to /LED`, the segment followed. Diff: R5 out, C4 in, one property line and three `(net …)` lines; the filled zone is untouched |
| sync again | `changed: False` |
| parity DRC | 0 parity issues; 1 warning (`track_dangling`, the deliberate 0.8 mm test stub) |

### Other facts the later phases need

- **Net syntax changed in KiCad 10.** 20241229 (KiCad 9) and older use a board-level `(net 0 "")` /
  `(net N "name")` table, `(net N "name")` on pads, `(net N)` on tracks and `(net N) (net_name "x")` on
  zones. 20260206 (KiCad 10) drops the table and codes: `(net "name")` everywhere.
- **Footprints changed in KiCad 10.** They gain `(units (unit (name "A") (pins "1" "2")))` and
  `(duplicate_pad_numbers_are_jumpers no)`.
- **Rotation.** In `(at x y θ)`, pad and text positions stay in unrotated footprint coordinates, but their
  angles are absolute: each pad/property/`fp_text` `at` gets `+θ`. Checked by rotating U2 by 90° in pcbnew.
- **Flip to the bottom side** changes every `F.*` layer to `B.*`, mirrors local geometry, adds
  `(justify mirror)` to texts and turns angles (R1 flipped: `(at … 180)`, pads `B.Cu B.Mask B.Paste`).
- **`kicad-cli` 10.0.7 has no Specctra DSN export or SES import.** `pcb export` lists gerbers, drill, pos,
  ipc2581, odb, step and others, but no Specctra. `pcbnew.ExportSpecctraDSN` works headlessly on A's
  board. Duplicate pad numbers come out as `U2-2@1`.
- **KiCad 10 default rules** (no `board` section in `.kicad_pro`, as in the fixture): Default net class
  clearance 0.2, track 0.2, via 0.6/0.3; minimum track 0.2, via 0.5, annular ring 0.1, through drill 0.3,
  hole clearance 0.25, hole to hole 0.25, copper to edge 0.5 (mm). These are safe for common 2-layer fabs.

## Design for #10 (and what #11–#14 rely on)

### Modules

| Module | Owner | Content |
|---|---|---|
| `netlist.py` | landed here | `read_netlist(cli, schematic) -> Netlist`, built from `kicad-cli sch export netlist --format kicadsexpr`. `NetlistComponent`: `reference`, `value`, `footprint`, `lib_id`, `path`, `unit_paths`, `sheet_name`, `sheet_file`, `fields`, `flags`, `fp_filters`, `units`, `pins` (number → `NetlistPin(net, function, type)`), `on_board`. `Netlist.nets`: `NetlistNet(name, code, net_class, nodes)`. |
| `lib_tables.py` | landed here | `LibTable("fp" \| "sym", project_dir, major).resolve("Lib:Name")`, `.libraries()`, `.problems` (see Footprint resolution). |
| `pcb.py` | #11 | Lossless board model on `sexpr.py` (contract below). |
| `pcb_sync.py` | #10 | `create_board`, `plan_sync`, `apply_sync`, `instantiate_footprint`; builds on `pcb.py`. |
| `tools.py` | #10 | registers `kicad_update_pcb` (only #10 registers tools). |

`spike/pcb/option_a.py` (`board_shell`, `stackup`, `instantiate`) and `spike/pcb/sync.py` are the reference
implementations to port. They are not wired into any tool.

#### What `pcb_sync.py` needs from `pcb.py` (#11)

- `Board.load(path)` / `Board.save()`: lossless. Untouched text is byte-identical, and new nodes are
  formatted by `sexpr.dumps`.
- `board.version`: the format date. `board.numbered_nets`: true when the board has a top-level net table.
- `board.footprints()`: views with `.node`, `.reference`, `.path`, `.lib_id`, `.uuid`, `.pads()`,
  `.property(name)`.
- `board.add_footprint(node)`: inserts at the uuid-sorted position among footprints (KiCad's save order).
  `board.remove(node)`.
- `board.net_node(name)`: a `(net …)` node in this board's syntax. `board.ensure_net(name)`: on numbered
  boards, appends `(net <next code> "name")` to the table. `board.rename_net(old, new)`: pads, tracks, arcs,
  vias, zones (`net_name` too) and the table.
- `board.outline()`: the Edge.Cuts bounding box, used to stage new parts.
- Footprint transforms for #11/#12 follow the rotation and flip rules in Evidence: pad/text angles absolute,
  positions local. Implement flip last and check it against a pcbnew round trip.

### Creating a board (`create_board(project_dir)`)

1. Write the stub `(kicad_pcb (version 20240108) (generator "dsh-kicad"))` to `<project>.kicad_pcb`, then
   run `KiCadCli.upgrade(path)` (`kicad-cli pcb upgrade --force`). 20240108 is KiCad 8's own format, so the
   stub works for every supported KiCad (8+). The result is the installed KiCad's empty board.
2. Insert the default 2-layer stackup into `(setup)`: 1.6 mm board, F/B.Cu 0.035, core 1.51 FR4
   (εr 4.5, tan δ 0.02), mask 0.01, silk and paste layers, `copper_finish "None"`. KiCad re-saves it
   unchanged.
3. Design rules stay in `.kicad_pro` (KiCad's place since v6). #10 does not write rules: KiCad's defaults
   above apply until #14's fab presets write `board.design_settings` (and, if needed, a `.kicad_dru`).
   #10 must not rewrite `.kicad_pro`.
4. Add an Edge.Cuts `gr_rect` around the staged parts (3 mm margin) so DRC has an outline. #11/#12 own the
   real outline.

### Footprint resolution

`LibTable("fp", project_dir, kicad_major)` resolves `Lib:Name` the way KiCad does:

1. the project `fp-lib-table` (`${KIPRJMOD}` = project dir);
2. the user's global table (`~/.config/kicad/<ver>/fp-lib-table`, the Flatpak config dir,
   `~/Library/Preferences/kicad/<ver>`, `%APPDATA%\kicad\<ver>`). KiCad 10 nests the stock libraries there
   through `(type "Table")`, which is followed;
3. the stock template table (`<share>/template/fp-lib-table`);
4. any `<share>/footprints/*.pretty` that no table lists.

The first table that names a nickname wins, and `(disabled)` rows are skipped. `${VAR}` comes from the
environment, then `kicad_common.json` `environment.vars`, then KiCad's defaults (`KICADn_FOOTPRINT_DIR`,
`KICADn_SYMBOL_DIR`, `KICADn_3DMODEL_DIR` → the installed libraries). Unreadable or missing rows go to
`.problems` instead of failing.

Follow-up for #10: `FootprintLibraries.libraries()` (used by `kicad_find_footprint`) still globs stock
dirs plus the project table. Switch it to `LibTable` so search and sync agree.

### Pre-sync check (before anything is written)

Report all of these together, then stop:
- an on-board symbol without a footprint (with a hint when it is a power symbol whose reference lacks `#`);
- a footprint id that does not resolve (list the tables searched);
- a schematic pin without a pad of that number. KiCad's parity reports "No pad found for pin X", unless the
  net is `unconnected-…` with pin type `no_connect`.

Numbered copper pads without a pin are fine: they stay netless, and parity only complains when such a pad
has a net.

### Instantiating a footprint (what KiCad's updater does)

From the parsed `.kicad_mod`:
- rename the root to `Lib:Name`; drop `version`, `generator`, `generator_version`;
- after `(layer)`, insert `(uuid)` and `(at x y [θ])`;
- set Reference and Value; set symbol fields over the library's (Datasheet, Description, user fields).
  Missing fields become hidden `F.Fab` properties at `(0 0 0)`, size 1.27, and user fields get a 0.15 pen;
- order the properties Reference, Value, Datasheet, Description, then the rest;
- add `(property ki_fp_filters "…")`, `(path …)`, `(sheetname …)`, `(sheetfile …)` and
  `(units (unit (name …) (pins …)) …)` before `(attr)`;
- map the symbol flags onto `(attr …)`: `dnp`, `exclude_from_bom`, `exclude_from_pos_files`. The spike
  copied the library's `attr`; the fixture has no flagged parts;
- give every property, graphic, text, pad and zone a fresh uuid, replacing library uuids;
- assign pad nets (next section).

Uuids are `uuid5(namespace, f"{symbol path}#{n}")`, so the same input gives the same file. This is what
makes golden tests and the byte-identity checks possible.

### Pad → net

- A pad with number *n* gets `component.pins[n].net`, plus `(pinfunction …)` and `(pintype …)` from the
  netlist. Every pad that shares the number gets the same net: the SOT-223 tab is pad 2 twice, the TL3342
  switch has two pads each for 1 and 2, the USB-C shield `SH` has 4 pads.
- A pad without a number, or with a number that is not a pin, gets no net.
- Net names are copied verbatim from the netlist. They are already escaped (`{slash}`), and
  `unconnected-(U1-ADJ-Pad1)` nets are kept as is.
- Syntax follows the board: `(net "name")` when the board has no net table (KiCad 10); otherwise
  `(net <code> "name")`, with codes from the board's table and new nets appended with the next code.

### Linking footprints to symbols

- A new footprint's `path` is `NetlistComponent.path`.
- Matching an existing footprint follows KiCad's updater:
  1. its `path` is in `unit_paths` (any unit of the symbol);
  2. otherwise its reference matches a component that is not linked yet. Rewrite the path and report
     "relinked";
  3. otherwise it is extra.
- Footprints with `(attr board_only)` are never extra.

### Format and version

- **New boards:** the native format of the installed KiCad, via the upgrade stub. Library content comes
  from the installed libraries, so it matches.
- **Existing boards:** keep the board's version and syntax.
  - Newer than the installed KiCad's native version (`kicad-cli pcb upgrade` reports what it writes):
    refuse.
  - Older (for example a KiCad 8 board opened with KiCad 10): run `kicad-cli pcb upgrade` first, as one
    reported change, then edit. KiCad would upgrade it on the next save anyway, and footprints from the
    installed libraries may use tokens the old version string does not cover.
- **Never** run `upgrade` on an already-native board as part of an edit: it rewrites the whole file.

### Incremental update and idempotency (`kicad_update_pcb`)

`plan_sync(board, netlist, libs) -> SyncPlan` is pure and doubles as the dry run. `apply_sync(plan)`
edits the tree. Change kinds:

| Change | Edit |
|---|---|
| `add` | instantiate; stage in a column right of the outline (#12 places it); insert in uuid order |
| `remove` | delete the footprint (KiCad's "delete extra footprints"); its tracks remain and DRC reports them |
| `relink` | rewrite `(path …)` |
| `update_field` | Reference, Value, symbol fields, `sheetname`/`sheetfile`, attr flags: one atom each |
| `update_pad` | `(net …)`, `(pinfunction …)`, `(pintype …)` of one pad |
| `rename_net` | when every pad of an old board net now sits on one new schematic net; tracks, arcs, vias and zones follow |
| `swap_footprint` | footprint id changed: re-instantiate and keep `at`, rotation, side, `locked`, uuid and path; the user's text positions are not kept |

Rules:
- Edits rewrite only the atoms or nodes they change. A second run on unchanged inputs produces no changes
  and no write (verified).
- Locked footprints keep their placement but still get field and net updates.
- The tool is a write tool: dsh approval, writes confined to the working directory.
- After applying, run `kicad-cli pcb drc --schematic-parity`. Return the change list plus the parity
  counts: missing, extra, net and field mismatches must all be 0. Count `schematic_parity` entries, not
  errors.
- When zones exist, follow with `--refill-zones --save-board` (or leave it to #11/#13's fill step).

### What #13 (routing) needs

- From `pcb.py`: absolute pad geometry (apply the rotation and flip rules), pad shapes and layers, nets
  with net classes, the outline, and the rules from `.kicad_pro`. Then `board.add_track(…)` /
  `board.add_via(…)` / `add_zone(…)`.
- Specctra:
  - `kicad-cli` cannot export DSN or import SES (10.0.7).
  - Main path: a stdlib `specctra.py`. The DSN writer covers structure (layers, boundary, rules, via
    padstack), placement, library images and padstacks, and network with classes. The SES reader turns
    wires and vias into `segment`/`via` nodes. Duplicate pad numbers need KiCad's `pin@n` naming.
  - Fallback and test oracle: `pcbnew.ExportSpecctraDSN` / `ImportSpecctraSES`, run in a subprocess by
    the KiCad Python that `doctor` finds: `python3` where it imports pcbnew, KiCad's bundled interpreter on
    macOS/Windows, `flatpak run --command=python3 org.kicad.KiCad`. The sidecar core stays stdlib-only.
- Freerouting needs Java 17+ (`java -version` here: OpenJDK 25). `doctor` detects both; download only
  after user confirmation, never with sudo.
- The GND pour is an unfilled zone plus `--refill-zones --save-board`.

### What #14 (fab output) needs

- A board whose re-save is byte-stable (done), a stackup in `(setup)` (written by `create_board`), and an
  outline.
- Fab presets write rules into `.kicad_pro` `board.design_settings` and the net classes, the place KiCad
  reads them from. #10 leaves `.kicad_pro` alone, so presets are the only writer.
- Gate before export: parity 0, unconnected 0, DRC errors 0, with zones refilled first
  (`--refill-zones`).
- Footprint `attr` flags (`dnp`, `exclude_from_bom`, `exclude_from_pos_files`) come from the symbols via
  sync, so the BOM and position files follow the schematic.

## Open risks

- **KiCad 8/9 not tested end to end.** Only KiCad 10.0.7 is installed. The numbered-net path was checked
  by having KiCad 10 read a 20241229 board (parity 0, identical nets after upgrade), not with KiCad 8/9
  themselves. The upgrade-stub shell avoids the KiCad 8 layer-numbering difference.
- **Undocumented format.** Field ordering, pen defaults and uuid ordering were matched empirically. A
  KiCad point release can change them. Keep the byte-identity check (`kicad-cli pcb upgrade --force` +
  `cmp`) as a test in #10 so a drift shows up as a test failure, not as diff noise for users.
- **Footprint swap and flip** are designed but were not prototyped.
- **Specctra without pcbnew** means writing a DSN/SES codec. If #13 judges that too costly, routing works
  only where `doctor` finds a pcbnew-capable Python.
- **Schematic annotation:** the eval produced non-`#` power-flag references. Until `add_symbol` is fixed,
  #10's pre-sync check is what catches it.
