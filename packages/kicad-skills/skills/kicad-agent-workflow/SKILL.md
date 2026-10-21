---
name: kicad-agent-workflow
description: Step-by-step loop for changing a KiCad schematic with the kicad_* tools — read, plan, one atomic edit batch, KiCad ERC verdict, iterate, render to check visually.
---

# KiCad agent workflow

Use this loop for any schematic change. KiCad, not you, decides whether the result is electrically correct.

1. **Locate the design.** The prompt context lists the KiCad files in the working directory. The root schematic has the same name as the `.kicad_pro`.
2. **Read.** `kicad_read_schematic` for the inventory (references, values, lib_ids, positions, labels, power nets). `kicad_list_nets` shows what is actually connected. `kicad_get_symbol_pins` gives exact pin positions and names before you wire.
3. **Pick parts.** `kicad_search_symbols` with plain keywords (`"ldo 3.3"`, `"usb c receptacle"`, `"ne555"`). Use the returned `lib_id` verbatim. Set a footprint when the user cares about the board.
4. **Plan placement.** Place new parts in free space near what they connect to: keep 10–15 mm between parts, everything on the 1.27 mm grid (multiples of 2.54 mm are tidiest). Y grows downward.
5. **Edit once.** Put the whole change in one `kicad_edit_schematic` call — it is atomic. Use `"R?"` references to auto-number. Connect with `connect_pin_to_net` (labels and power symbols) rather than long `connect_pins` wires that cross other parts. Mark intentionally unused pins with `no_connect_pin`.
6. **Read the verdict.** The edit result ends with an automatic KiCad ERC. If it failed, fix the reported items (see the `kicad-erc-triage` skill) with another batch. Never claim success while ERC reports errors.
7. **Check visually when layout matters.** `kicad_render` writes SVG (and PNG for image-capable models) under `.dsh-kicad/render/`; the user sees it in the KiCad sidebar tab.
8. **Board work.** `kicad_drc` on the `.kicad_pcb`, with `schematic_parity: true` after schematic changes.

Report to the user: what changed (from the edit result's change list), the final ERC verdict, and anything left for them (footprint choices, layout).
