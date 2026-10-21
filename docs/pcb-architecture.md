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
| `pcb.py` | #11 | Lossless board model on `sexpr.py` (what the sync uses: below). |
| `pcb_sync.py` | #10 (landed) | `create_board`, `plan_sync`, `apply_sync`, `instantiate_footprint`, `update_pcb` (the tool); builds on `pcb.py`. |
| `tools.py` | #10 (landed) | registers `update_pcb` (`kicad_update_pcb` on the TS side). |

`spike/pcb/option_a.py` and `spike/pcb/sync.py` were the reference implementations; `pcb_sync.py` ports them.

#### What `pcb_sync.py` uses from `pcb.py`

The plan above was written before #11 landed; `pcb.py` is the contract now. The sync uses `Board(path, text=…)`
(lossless, `save()` writes the board and only writes the `.kicad_pro` when rules changed, which the sync never
does), `version`, `numbered_nets`, `footprints()` / `Footprint` (`reference`, `lib_id`, `uuid`, `at`, `side`,
`locked`, `pads()`, `courtyard()`), `ensure_net`, `net_nodes`, `outline()`, `copper_layers()`, `remove_item`,
`insert_item` and `_place` (rotation and flip of a swapped footprint). #10 added to `pcb.py`, with tests:

- `Board.rename_net(old, new)`: pads, tracks, arcs, vias, zones (`net_name` too) and the net table of
  numbered boards; when `new` exists the nets merge (numbered: the old code's items move to the new code).
- `insert_item` puts footprints where KiCad saves them. KiCad's order is `BOARD_ITEM::ptr_cmp`: by layer
  first (front footprints, then back ones), then by uuid, not by uuid alone.
- `attr_flags` / `set_attr_flags`: footprint attributes in KiCad's order (`smd`/`through_hole`, `board_only`,
  `exclude_from_pos_files`, `exclude_from_bom`, `allow_missing_courtyard`, `dnp`, `allow_soldermask_bridges`).
- `add_mounting_hole` marks holes `board_only`. Without it, a hole added by `kicad_edit_pcb` is an
  `extra_footprint` to the parity check, and the sync would flag it.

`sexpr.prettify` / `sexpr.kicad_layout` port KiCad's writer layout (`Prettify` in
`common/io/kicad/kicad_io_utils.cpp`): a token list wraps at its first space past column 72, `(xy …)` runs share
a line up to column 99. `sexpr.dumps` alone keeps long lists on one line, so a 48-pin part's
`(pins "1" … "48")` or a long `fp_poly` would be rewrapped by KiCad's next save. Every node the sync adds is
laid out with it. It is a fixed point on every KiCad-saved board and schematic tested (KiCad 9 and 10 formats).

### Creating a board (`create_board(cli, path, copper_layers)`)

1. Write the stub `(kicad_pcb (version 20240108) (generator "dsh-kicad"))` in a scratch directory, then
   run `KiCadCli.upgrade(path)` (`kicad-cli pcb upgrade --force`). 20240108 is KiCad 8's own format, so the
   stub works for every supported KiCad (8+). The result is the installed KiCad's empty board. Four copper
   layers: the stub carries format 20240108's full layer table with `In1.Cu`/`In2.Cu`, and KiCad converts it
   to its own numbering (10.0.7: the 2-layer table plus `(4 "In1.Cu" signal)`, `(6 "In2.Cu" signal)`).
2. Insert the default stackup into `(setup)`, KiCad's `BOARD_STACKUP::BuildDefaultStackupList`: 1.6 mm board,
   35 µm copper, 10 µm mask, and FR4 (εr 4.5, tan δ 0.02) dielectrics sharing the rest evenly: one 1.51 mm core
   for 2 layers; core / prepreg / core of 0.48 mm for 4. Silk and paste layers, `copper_finish "None"`. KiCad
   re-saves it unchanged.
3. Design rules stay in `.kicad_pro` (KiCad's place since v6). #10 does not write rules: KiCad's defaults
   above apply until #14's fab presets write `board.design_settings` (and, if needed, a `.kicad_dru`).
   #10 must not rewrite `.kicad_pro`.
4. Pack the footprints in rows by reference (row width max(50 mm, 1.5 × √area), 2 mm gaps, courtyard and
   fab extents) and add an Edge.Cuts `gr_rect` around them (3 mm margin) so DRC has an outline. #11/#12 own
   the real outline and placement.
5. Hook: `Toolbox.board_created(board)` runs after a new board is written. #14's `fab.apply_preset` plugs in
   there; until then it does nothing.

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

`FootprintLibraries.libraries()` (`kicad_search_footprints`, `add_mounting_hole`) now uses `LibTable` too
(#10), so search and sync agree on which footprints exist.

### Pre-sync check (before anything is written)

Report all of these together, then stop (`SyncRefused`; the tool lists the `REF:PIN`s):
- an unannotated symbol (`R?`);
- an on-board symbol without a footprint (with a hint when it is a power symbol whose reference lacks `#`);
- a footprint id that does not resolve (the message names the tables searched);
- a schematic pin without a pad of that number. KiCad's parity reports "No pad found for pin X" for every such
  pin, `no_connect` pins on `unconnected-…` nets included: the CM5 demo's J701 M2–M4 are exactly that, and
  parity lists them. (The plan's exception for them was wrong.)

A footprint already on the board with the symbol's footprint id is checked against its own pads, not the
library's: KiCad keeps a placed footprint as it is, and its library may not be installed.

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
- map the symbol flags onto `(attr …)`: `dnp`, `exclude_from_bom`, `exclude_from_pos_files` (all three are in
  the netlist; parity checks `dnp` and `exclude_from_bom`);
- give every property, graphic, text, pad, zone, group, dimension and point a fresh uuid, replacing library
  uuids; group members follow their items' new uuids;
- assign pad nets (next section).

What the implementation adds, each found by a KiCad re-save that changed bytes:
- **KiCad loads the library first.** The footprints a sync places are re-saved by `kicad-cli fp upgrade
  --force` in a scratch directory (one call per sync). That is the content KiCad itself would put on the board:
  `point` items before pads, `(duplicate_pad_numbers_are_jumpers no)`, retired tokens of older files dropped
  (`(tenting …)` on pads of a 9.99-era project library). If it fails, the library text is used as it is.
- **Board-only details.** Pads with `(remove_unused_layers yes)` get `(zone_layer_connections)`; inner copper
  layers the board lacks are dropped from pads and footprint zones (`In1.Cu` … `In30.Cu` on a 2-layer board),
  and a zone left on one layer is written `(layer …)`. A zone left on no layer (the SODIMM card edge's
  inner-layer keepouts) is not placed: KiCad would write it as `(layer "UNDEFINED")`, and `kicad-cli` 10.0.7
  crashes (SIGSEGV) reading that back. Footprint zones are then ordered by priority and layer ids, KiCad's
  `cmp_zones` keys, keeping the library's order otherwise.
- **Order.** The body follows KiCad's writer: settings and `attr`, graphics, points, pads, zones, groups,
  embedded files, models. The library file is in KiCad's order already, but KiCad breaks some ties by uuid:
  identical items, text boxes / dimensions / barcodes / tables on one layer, groups over the same layers.
  Those runs are re-sorted by the new uuids. A dimension's text repeats the dimension's uuid.
- **Fields.** Library fields the symbol lacks (`KiLib_Generator`, on 12,045 stock footprints) are dropped,
  as KiCad's updater drops footprint fields not on the symbol.
- The whole footprint is laid out with `kicad_layout` at depth 1.

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
- Footprints with `(attr board_only)` take no part: never linked, never extra (mounting holes from
  `kicad_edit_pcb`).

### Format and version

- **New boards:** the native format of the installed KiCad, via the upgrade stub. Library content comes
  from the installed libraries, so it matches.
- **Existing boards:** keep the board's version and syntax.
  - Newer than the installed KiCad's native version (the upgraded stub's version, cached): refuse.
  - Older (for example a KiCad 9 board opened with KiCad 10): plan on an upgraded copy (`kicad-cli pcb
    upgrade` in a scratch directory). If the sync changes something, the upgrade is the first reported change
    and the upgraded, synced board is written; if not, the file is left alone (no write, a note says KiCad
    upgrades it on its next save). KiCad would upgrade it on the next save anyway, and footprints from the
    installed libraries use tokens the old version string does not cover.
  - `plan_sync`/`apply_sync` called directly keep an older board's format (numbered nets, no `units`); a test
    has KiCad 10 judge such a 20241229 board: parity 0.
- **Never** run `upgrade` on an already-native board as part of an edit: it rewrites the whole file.

### Incremental update and idempotency (`kicad_update_pcb`)

`plan_sync(board, netlist, libraries, delete_removed, cli) -> SyncPlan` only reads (the board, the netlist,
the libraries, and `fp upgrade` in a scratch directory) and doubles as the dry run. Each `Change` has a kind,
a line of text and the edit; `apply_sync(plan)` runs the edits in order. `update_pcb(cli, schematic, pcb?, …)`
is the tool: it creates or loads the board, plans, applies, saves, then runs KiCad's DRC with schematic parity.
Change kinds:

| Kind | Edit |
|---|---|
| `created` / `upgraded` | a new board / an older board upgraded first |
| `added` | instantiate; on a board with neither footprints nor outline, packed in rows inside a placeholder outline; otherwise staged in a column 5 mm right of the outline and of every part (#12 places it); inserted in KiCad's save order |
| `removed` | only with `delete_removed`: delete the footprint (KiCad's "delete extra footprints"); its tracks remain and DRC reports them. Without it the footprint is listed in `flagged` and parity reports `extra_footprint`. Locked ones stay either way |
| `relinked` | rewrite (or add) `(path …)` |
| `field` | Reference, Value, symbol fields (added hidden on Fab when missing), `ki_fp_filters`, `sheetname`/`sheetfile`, the KiCad 10 unit/pin map: one atom or node each |
| `attr` | `dnp`, `exclude_from_bom`, `exclude_from_pos_files` from the symbol |
| `pad` | `(net …)`, `(pinfunction …)`, `(pintype …)` of one pad, written where KiCad writes them |
| `net_renamed` | when every pad of an old board net now sits on one new schematic net and the old name is gone; tracks, arcs, vias and zones follow |
| `swapped` | footprint id changed: re-instantiate and keep `at`, rotation, side, `locked`, uuid and path; the user's text positions are not kept (checked against KiCad's pad positions on a rotated, flipped, locked part) |

Fields on the board that the symbol lacks are kept on existing footprints: parity ignores them, and they may be
the user's (StickHub's footprints carry `MPN`, `USD_per_1` that its symbols do not).

Rules:
- Edits rewrite only the atoms or nodes they change. A second run on unchanged inputs produces no changes
  and no write (verified).
- Locked footprints keep their placement but still get field and net updates.
- The tool is a write tool: dsh approval, writes confined to the working directory.
- After applying, run `kicad-cli pcb drc --schematic-parity`. Return the change list plus the parity
  counts: missing, extra, net and field mismatches must all be 0. Count `schematic_parity` entries, not
  errors. `KiCadCli.drc(…, schematic_parity=True)` returns that count as `parity`, the tool returns
  `parity: {total, by_type}` and the report, and the policy's automatic DRC reuses the report instead of a
  second run ("…, 39 unrouted, 0 schematic parity issue(s)").
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

## Placement (#12)

`placement.py` gets a synced board from rows of parts to an initial placement ready for routing, without the
model computing coordinates. Two operations of `kicad_edit_pcb` (atomic with the rest of the batch, then the
policy's automatic DRC):

| Operation | What it does |
|---|---|
| `auto_place{groups?, references?, outline?, gap?=1, group_gap?=2.5, margin?=1}` | Lays out every unlocked footprint, or only `references` (parts `kicad_update_pcb` staged) around the others. `outline`: `fit` sizes a rectangle to the parts (default when the board has no outline or only the sync's placeholder, recognised by its uuid), `keep` places inside the current outline (default otherwise) and refuses, writing nothing, with the size the parts need when they do not fit. `groups:[{title, references}]` overrides the schematic's blocks. |
| `place_block{title \| references, x, y, width?, height?, face?}` | Lays out one block with its box's top-left corner at x, y, or inside that rectangle (laid out again to fit, refused with the needed size otherwise). A block holding a connector faces `face` (default: the nearest outline side) and sits against that side of the rectangle. Overlaps with parts outside the block are reported, not refused. |

Python API for #13 and the PCB eval (#15): `auto_place(board, …)`, `place_block(board, …)`,
`check_placement(board)` and `ratsnest_length(board)` on a `pcb.Board`; `placement.apply(board, op)` runs an op
dict. `kicad_read_pcb` returns `check_placement` as `placement` (its text adds a "Placement:" line), and
`kicad_render{view: "3d"}` renders `kicad-cli pcb render` (top or bottom) so an image-capable model can look at
the result.

**Groups.** The schematic paired with the board (`<board name>.kicad_sch`, sub-sheets too) supplies its
functional blocks: `Schematic.blocks()`, the `add_block` frames and the parts inside them. Parts outside every
block are grouped by sheet when the design has several, otherwise by connectivity: every IC and connector
gathers the parts wired to it through signal nets (a pull-up joins the part it pulls up, not the rail), then
through any net but ground; decoupling capacitors and crystals go with their IC.

**Layout.** One greedy packer at two levels. Inside a group the first part goes first (the IC with most pads;
in a group holding a connector, its connectors in a row whose edges lie on one line, facing down), then
repeatedly the part most tied to what is placed goes, in the best of four rotations, to the free spot touching
a placed part (or centred where its connections pull it) with the lowest cost: for each pad, the weighted
distance to the nearest placed pad on its net, plus pulls between specific pads, plus 0.6 × the growth of
the bounding box's half perimeter. Net weights: 1 for nets of up to 3 pads, 2/(n−1) above, × 0.5 on power
rails and × 0.3 on ground (poured later). A final pass re-places every part once the others are known. Then
the groups are placed the same way as rigid blocks: inner groups grow from the one most wired to the
others, groups holding a connector go on the board edge (every side tried, sliding along it), and inner
groups are re-placed once the edges are claimed. Gaps: 1 mm between courtyards in a group, 2.5 mm between
groups, +1 mm around power parts.

**Heuristics.**
- *Connectors on the edge, facing out.* A connector's mating side is its footprint's "PCB Edge" mark
  (a `Dwgs.User`/`Cmts.User` line next to a "PCB Edge" text, as the USB-C and micro-B footprints draw), which
  is put exactly on the board edge; the courtyard beyond the mark overhangs the board, as the library intends
  (0.5 mm for the GCT USB4125). Without a mark, the side where the courtyard reaches ≥ 1.5 mm beyond the
  pads and ≥ 1 mm more than on any other side (right-angle headers, barrel jacks, USB-B, side-entry JST)
  faces out, its body flush with the edge and its pads at least the copper-to-edge clearance inside
  (`min_copper_edge_clearance` of the board, else KiCad's 0.5 mm). Vertical headers lie along the edge.
- *Decoupling.* A capacitor between an IC's power rail and ground belongs to that IC: the smallest values
  first, a bulk capacitor (≥ 1 µF) on a regulator's output to the regulator, the others to the parts that
  draw from the rail, spread over ICs with the fewest capacitors so far. It is pulled to the IC's pins on
  that rail (weight 4) and on ground (2), and placed right after its IC.
- *Crystal.* A crystal (`Y…`, `Crystal`/`Oscillator` libraries) is pulled to the IC sharing its signal nets
  (4), its load capacitors to it (3).
- *Power parts* (a `power_out` pin, TO-220/252/263, D(2)PAK, SOT-223, PowerPAK…, inductors ≥ 16 mm²) keep
  1 mm more room.
- *Mounting holes.* The first four unlocked holes go to the corners of a fitted outline, which grows until
  they are free; more are packed like other parts. Inside a kept outline holes stay where they are.

**Outline.** `fit`: every side is the outermost part plus `margin`, except a side with connectors, which runs
along their edge marks (groups there are moved out onto it); the board's top-left corner stays where the old
outline's was (the sync puts it at (97, 97)). `keep`: the layout is redone for the outline's aspect, with more
compaction, then 0.6× and 0.35× the gaps (noted in the result) until it fits; it is centred and the connector
groups are moved onto the outline's edges. Failing that, the groups are packed inside the outline directly
(connector groups first); locked parts and the `references` mode always take that path. Polygon outlines are
fitted by their bounding box and checked corner by corner.

**Silkscreen.** Parts are packed by courtyard plus silkscreen (footprint artwork such as a cathode "K"
included). References and values shown on silkscreen that land on a pad, other silkscreen or off the board are
moved next to their part (horizontal first, then vertical, on its body last), so KiCad's `silk_over_copper`
and `silk_overlap` stay clear; when no spot is free they move off pads only.

**Checks and metric.** `check_placement`: courtyard overlaps (boxes, same side), footprints outside the
outline (courtyard boxes; KiCad's DRC reports neither a part fully outside the board nor one half outside
without copper there), connectors overhanging by design (`overhang`), reference text over pads, and the
ratsnest. `ratsnest_length`: per net, the minimum spanning tree over its pad centres (what KiCad draws before
routing), summed in mm. Measured with KiCad 10.0.7 (`tests/test_placement.py` holds the usb-attiny85 numbers;
random = mean of footprints dropped at random positions and rotations inside the same outline):

| Board | Parts | Sync's rows | Random | `auto_place` | KiCad DRC after (besides unrouted) |
|---|---|---|---|---|---|
| usb_attiny_blocks (5 blocks) | 15 | 411.8 mm | 345 mm | 214.4 mm | none |
| usb_attiny (no blocks) | 15 | 411.8 mm | 347 mm | 212.2 mm | none |
| ecc83-pp demo | 15 | 503.1 mm | 420 mm | 247.5 mm | none |
| StickHub demo | 94 | 3143.7 mm | 2392 mm | 974.7 mm | none |
| complex_hierarchy demo | 68 | 3186.4 mm | 3745 mm | 1124.6 mm | 2 `silk_overlap` |
| pic_programmer demo (+ 6 mounting holes) | 63 | 5212.3 mm | 5297 mm | 1563.8 mm | 1 `clearance` inside JP1 (on the unplaced board too) |

189 footprints place in 2.7 s. On usb-attiny85 both variants give 0 courtyard overlaps, every footprint inside
the outline, the USB-C's edge mark on the board edge, 0 parity issues and the same 39 unrouted connections.

**What #13 gets.** A board with an outline, parts at least 1 mm apart (2.5 mm between blocks) and at least
`margin` from the edge, connectors on it, everything still on its side (placement never flips), positions on a
0.05 mm grid when the outline was fitted. Placement and routing are independent: `auto_place` ignores existing tracks (they are left
where they were, so place before routing), and `ratsnest_length` measures pads only.

**Placement risks.**
- The metric is straight-line and ignores routability: 1 mm gaps suit two-layer boards of small parts; dense
  boards may need `gap`/`group_gap` raised before routing.
- Connector faces come from the "PCB Edge" mark or the body's reach; a footprint with neither (screw
  terminals) lies along the edge but may face inward.
- Inside a block the first IC keeps rotation 0 and the rest is greedy: good, not optimal. Blocks are turned
  but never mirrored, and nothing goes to the back side.
- Silkscreen text extents are estimated (0.9 × size per character), not measured with KiCad's font.
- Rotated footprints are reordered by KiCad's next save (see Open risks); content is unchanged.

## Open risks

- **KiCad 8/9 not tested end to end.** Only KiCad 10.0.7 is installed. The numbered-net path was checked
  by having KiCad 10 read a 20241229 board (parity 0, identical nets after upgrade), not with KiCad 8/9
  themselves. The upgrade-stub shell avoids the KiCad 8 layer-numbering difference; the 4-layer stub's
  layer table is format 20240108's.
- **Undocumented format.** Field ordering, pen defaults and uuid ordering were matched empirically. A
  KiCad point release can change them. `tests/test_pcb_sync.py` keeps the byte-identity check
  (`kicad-cli pcb upgrade --force` + compare) on usb_attiny, the 4-layer board, four demo projects and a
  resync, so a drift shows up as a test failure, not as diff noise for users.
- **Item order inside rotated or flipped footprints.** KiCad sorts a footprint's graphics by absolute
  geometry when it saves, so a footprint rotated or flipped after placement (`kicad_edit_pcb`
  `move_footprint`, or a sync swapping a footprint that sits rotated or on the back) gets its graphics
  reordered by KiCad's next save. The content is the same; only the order changes. New and staged footprints
  sit at 0° on the front and are not affected.
- **Swap** is implemented and checked against KiCad's pad positions; text positions the user changed on the
  old footprint are not carried over.
- **Specctra without pcbnew** means writing a DSN/SES codec. If #13 judges that too costly, routing works
  only where `doctor` finds a pcbnew-capable Python.
- **Schematic annotation:** the eval produced non-`#` power-flag references. `add_symbol` now gives power
  symbols the library's `#` prefix (`#FLG`, `#PWR`) and adds `#` to a given reference that lacks it (#10);
  the pre-sync check still names any other non-`#` power symbol.
