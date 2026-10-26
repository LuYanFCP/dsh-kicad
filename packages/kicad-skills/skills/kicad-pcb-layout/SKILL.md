---
name: kicad-pcb-layout
description: Take a design from a schematic that passes ERC to a board ready to order — sync, rules, outline and placement by functional block, critical nets by hand, GND pour, autoroute, DRC triage, fab files — with KiCad's numbers (schematic parity, unrouted, DRC errors, the fab gate) as the verdict at every step.
---

# From schematic to an orderable board

The goal is a board KiCad passes: **schematic parity 0, 0 unrouted connections, 0 DRC errors**, then the fab files. Every step ends with those numbers from KiCad; never call a step done from your own geometry, and never edit `.kicad_pcb` text with shell or file tools.

Start only when the schematic passes ERC and every symbol that goes on the board has a footprint (the `kicad-agent-workflow` skill, "Handing over to the board"). Draw the schematic in titled functional blocks first (`add_block{`, the `kicad-schematic-design` skill): placement follows them.

## 1. Sync

`kicad_update_pcb {schematic}`. A new board is `<schematic name>.kicad_pcb`, 2 copper layers (`copper_layers: 4` for four), parts packed in rows inside a placeholder outline. It refuses, writing nothing, with every `REF:PIN` that cannot go on the board (no footprint, a footprint in no library, a pin without a pad): fix those in the schematic (`set_footprint{`) and run it again.

Done when the result says `Schematic parity (KiCad DRC): 0 issues.` Run it again after every schematic change: placed parts keep their place, new ones are staged right of the outline for you to place.

## 2. Rules

When the user named a fab house, adopt its limits now, so routing and DRC use them: `kicad_fab_preset {path, preset: "jlcpcb" | "pcbway"}`. Wider tracks for the supply rails (GND gets the pour): `kicad_edit_pcb` `set_net_class{name: "Power", nets: ["+5V", "+3V3"], track_width: 0.5}`. A fixed board size from the user: `set_board_outline{width, height, corner_radius?}`, and `add_mounting_hole{x, y}`, before placing.

## 3. Placement

`kicad_edit_pcb` `auto_place{}`: each block stays together, connectors sit on the board edge facing out, decoupling capacitors at their IC's power pins, crystals at their IC. The outline is sized to fit unless you drew one, which the parts must then fit.

Check: the result's placement line (and `kicad_read_pcb`'s) must show no courtyard overlaps and nothing outside the outline. Look with `kicad_render {path, view: "3d"}`. Fine-tune with `move_footprint{reference, x, y, rotation?}` or `place_block{title, x, y}`, and `lock_footprint{reference}` what the user placed (connectors at a panel, LEDs under a window).

## 4. Critical nets by hand, locked

Before autorouting, draw what needs care: `add_track{points: ["J1:A5", [x, y], "R4:1"], width?, locked: true}` and `add_via{x, y, net, locked: true}`. That means power from the regulator (wide), USB data pairs (short, side by side), crystal traces (short, no vias), high-current paths. Locked copper stays exactly as drawn through every later step.

## 5. GND pour

`add_zone{net: "GND", layers: ["F.Cu", "B.Cu"], connect_pads: "solid"}`. Solid connections avoid `starved_thermal` errors on a crowded 2-layer board. Other pours (a power plane on 4 layers) the same way.

## 6. Autoroute

`kicad_autoroute {pcb}` routes everything else with Freerouting, keeps all existing copper, refills the pours and returns KiCad's unrouted count and DRC. `nets` / `exclude_nets` route a subset. If it says Freerouting or Java is missing, give the user its install guidance (`/kicad-install freerouting`); never install anything yourself.

Done when unrouted is 0. For leftover connections, either:

- route them by hand and run it again (everything on the board is kept); or
- give the parts room: `remove_tracks{}`, `auto_place{outline: "fit", gap: 2, group_gap: 4}`, redraw the pour (`remove_item{uuid}` on the zone, then `add_zone{`), and route again.

## 7. DRC

Every edit's result ends with the automatic DRC; `kicad_drc {path, schematic_parity: true}` gives the full report. Triage it with the `kicad-drc-triage` skill, in its order. Done when there are 0 errors, 0 unrouted and no `schematic_parity` items; name any warnings left and why they are acceptable.

## 8. Fab files

`kicad_export_fab {pcb, preset?}` writes Gerbers, drill, position and BOM files in one zip, with 3D previews. KiCad gates it: it refuses (nothing written) while DRC has errors, connections are unrouted, parity disagrees or the board breaks the preset's limits. Fix what it lists and export again. Pass `force: true` only when the user explicitly asks; the result then records that the gate was overridden.

## Report

Give the numbers:

- parity, unrouted, DRC errors and warnings;
- board size and layers;
- the zip path and the preset.

Then say what you routed by hand and what the router did, and which warnings remain and why.

Stop and ask when the next fix is a design decision: a bigger board, 4 layers instead of 2, a looser rule, another footprint, moving a part the user placed.
