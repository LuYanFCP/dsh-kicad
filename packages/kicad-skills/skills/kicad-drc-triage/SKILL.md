---
name: kicad-drc-triage
description: How to read KiCad DRC results for a .kicad_pcb (clearance, courtyards_overlap, unconnected_items, track_width, hole_clearance, silk_over_copper, schematic parity, ...) and the board edits that fix each one.
---

# Triage KiCad DRC results

KiCad's DRC (`kicad_drc`, i.e. `kicad-cli pcb drc`) is the source of truth for a board; never call a board done from your own geometry. Run it with `schematic_parity: true` whenever the schematic changed.

Start from `kicad_read_pcb`: footprints (position, side, locked, courtyard box, pad nets), zones with uuids, rules, net classes and DRC's unrouted count; `include_items: true` adds tracks, vias, texts and outline shapes with uuids. Fixes are `kicad_edit_pcb` operations, one atomic batch per group; its result carries the automatic DRC. Never edit `.kicad_pcb` text with shell or file tools.

## Reading the report

Every entry has `type`, `severity`, `description` (rule and actual value, e.g. `netclass 'Default' clearance 0.2000 mm; actual 0.1824 mm`) and `items` (net in brackets, `pos` in mm, `uuid`: `Pad 2 [GND] of C3 on F.Cu`). `by_type` counts them; `unrouted` counts unrouted connections.

- no `category`: geometry and rule violations.
- `category: unconnected`: connections still to route (`unconnected_items`), always errors.
- `category: schematic_parity`: board and schematic disagree. KiCad reports these as **warnings**, but the board is only in sync when this list is empty ("parity 0").

Zones: `kicad_drc` and the automatic DRC refill zones in memory when the board has any (kicad-cli `--refill-zones`; the file is not changed). With `refill_zones: false` DRC checks the stale stored fill: false `clearance`, `unconnected_items` or `isolated_copper`.

Work in this order, because each stage changes the next: parity → outline → placement → unrouted → clearance and sizes → silkscreen → library warnings.

## Schematic parity (fix the schematic, then sync; never fake it with copper)

Sync is `kicad_update_pcb` when this session has it; otherwise ask the user to run Update PCB from Schematic (F8) in KiCad.

| type | Meaning | Fix |
|---|---|---|
| `missing_footprint` | A symbol has no footprint on the board | Give the symbol a footprint (`set_footprint` in `kicad_edit_schematic`), then sync |
| `extra_footprint` | A footprint has no symbol | Mounting holes and logos are fine board-only; otherwise `remove_item{uuid}` (uuid from the DRC item) or add the symbol |
| `duplicate_footprints` | Two footprints share a reference | Fix the annotation in the schematic, `remove_item` the stray copy, sync |
| `net_conflict` | A pad's net differs from the schematic (`No pad found for pin 1 (GND)`) | Pin numbers and pad names differ: pick a footprint whose pads match (`kicad_search_footprints` with pads), then sync |
| `footprint_symbol_mismatch` / `footprint_symbol_field_mismatch` / `footprint_filters_mismatch` | Footprint id, attributes or fields differ from the symbol | Sync (the schematic wins); field-only differences are usually harmless |

## Outline and placement

| type | Meaning | Fix |
|---|---|---|
| `invalid_outline` | Edge.Cuts missing or not closed (`gap 46.2 mm`) | `set_board_outline{width,height,corner_radius?}` or `{points:[[x,y],...]}` |
| `copper_edge_clearance` | Copper too close to the board edge | `move_footprint` inward; reroute the track; re-add the zone with a smaller `outline` |
| `courtyards_overlap` | Two footprints' courtyards overlap | `move_footprint{reference,x,y}` one (courtyard boxes from `kicad_read_pcb`) or `move_footprints{references,dx,dy}` a group; locked parts need `lock_footprint{reference,locked:false}` first |
| `pth_inside_courtyard` / `npth_inside_courtyard` | A hole lies inside another part's courtyard | Move one of the footprints |
| `items_not_allowed` / `item_on_disabled_layer` | Item inside a keepout (`add_keepout`) / on a layer the stackup lacks | Move or `remove_item` it |
| `missing_courtyard` / `malformed_courtyard` / `footprint_type_mismatch` / `padstack` | Footprint library problem | Report it; choose another footprint if it blocks the board |

## Connectivity

| type | Meaning | Fix |
|---|---|---|
| `unconnected_items` | A connection is not routed (both pads and the net are listed) | `kicad_autoroute` (keeps existing tracks), or `add_track{points:["R1:2","U1:5"],net,layer}` (pad endpoints snap to the pad), `add_via{x,y,net}` to change layer; GND/power can be joined by `add_zone{net,layer}` (outline defaults to the board). Many long or crossing connections mean placement is wrong: move parts first |
| `shorting_items` | Copper joins two nets | `remove_item{uuid}` the offending track or via and reroute; never rename nets to hide it |
| `tracks_crossing` | Tracks of different nets cross on one layer | Remove one, reroute it on the other layer with vias |
| `track_dangling` / `via_dangling` | A track end or via connects to nothing | `remove_item` the leftover |
| `starved_thermal` | Too few thermal spokes reach the zone | Clear what blocks the spokes, `add_track` from the pad into the zone, or re-add the zone with `connect_pads: "solid"` |
| `zones_intersect` / `zone_has_empty_net` | Zones overlap with equal priority / a zone has no net | `remove_item` and re-add with `add_zone{net,priority}` or a distinct `outline` |
| `isolated_copper` | A zone island connects to nothing | Warning; usually fine, or stitch it with `add_via` to its net |

## Clearance and sizes

Fix the geometry, not the rule. Change rules (`set_design_rules{min_clearance,min_track_width,...}`, `set_net_class`) only to match what the user's fab can really make; ask which fab when it matters.

| type | Meaning | Fix |
|---|---|---|
| `clearance` | Copper of different nets too close | Reroute the track with a detour (`remove_item` + `add_track`), move the via or footprint |
| `hole_clearance` | Copper too close to a drilled hole | Reroute the track or move the via/footprint away from the hole |
| `hole_to_hole` / `holes_co_located` | Drills too close / on top of each other | Move the via or footprint |
| `track_width` | Track narrower than the board or net-class minimum | Re-add with a legal `width`; `set_net_class{name,nets,track_width,clearance,via_diameter,via_drill}` so those nets default to it |
| `connection_width` | A copper neck (often in a zone) is too narrow | Widen or reroute the track |
| `annular_width` / `drill_out_of_range` / `via_diameter` | Via or pad drill/ring outside the limits | `add_via{x,y,net,diameter,drill}` inside the limits; for footprint pads choose another footprint |
| `solder_mask_bridge` | One mask opening exposes pads of different nets | Usually fine-pitch footprints: report it; reroute if a track causes it |
| `length_out_of_range` / `skew_out_of_range` / `diff_pair_*` | Custom length or differential-pair rules | Advanced; report to the user |

## Silkscreen and library (warnings)

| type | Meaning | Fix |
|---|---|---|
| `silk_over_copper` / `silk_overlap` / `silk_edge_clearance` | Silk over exposed copper, other silk or the board edge | `set_reference_text{reference,x,y}` to move the designator, or move the footprint |
| `text_height` / `text_thickness` | Text below the fab minimum | `set_reference_text{reference,size,thickness}`; board text: `remove_item` + `add_text{...,size}` |
| `lib_footprint_issues` / `lib_footprint_mismatch` | Library not configured here / board copy differs from the library | Harmless after library updates: mention it, do not "fix" |

## Workflow

1. `kicad_drc` with `schematic_parity: true`; group by type and fix in the order above, the most common type first.
2. Locate items by `pos` and `kicad_read_pcb`. Uuids for `remove_item`: the DRC item's `uuid`, `zones`, or `include_items`.
3. Done when there are 0 errors, `unrouted` is 0 and there are no `schematic_parity` items; name any remaining warnings and why they are acceptable.
4. Stop and ask when the fix is a design decision: loosening a rule, changing a footprint, resizing the board.
