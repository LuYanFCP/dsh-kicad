# Agent evals

End-to-end tasks for the KiCad agent. Each directory holds the user prompt (`prompt.md`)
and a checker that judges the result only with KiCad (`kicad-cli` ERC + netlist, and for
boards DRC with schematic parity), never with the model. Usable from dsh, Claude Code
(sidecar MCP server) or an RL environment.

| Eval | Task | Last run (2026-10-21, dsh 0.2.1-rc.2, DeepSeek-V4.1-Flash, EDA preset) |
|---|---|---|
| `novice-button-led` | One beginner sentence via `/kicad-design`; simulated novice picks every Recommended option. Checker judges intent (USB-C + CC pulldowns, MCU + programming interface, button to an MCU pin, LED via resistor), ERC, footprints, brief, overlaps, wiring (at least half the signal nets drawn with wires, not only labels) | run 1: 4 questions + confirmation, 70 steps, 13 m 19 s, 6.3M tok; 12/12. run 2 (after adding kicad_library_symbol / kicad_search_footprints): 25 steps, 3 m 28 s, 1.1M tok, 7 approvals; 12/12. Both runs predate the wiring check and fail it (2 of 10 signal nets wired: every other pin ended in its own label). Known gap: text/label collisions are not checked yet |
| `usb-attiny85` | Blank project → USB-C power, CC pulldowns, AMS1117-3.3, power LED, ATtiny85 with decoupling and reset pull-up, button, LED, AVR-ISP-6, footprints. **Second turn** (`prompt-board.md`, once ERC passes): the board — 2 layers, JLCPCB rules, placement by functional block, GND pour on both sides, routed, JLCPCB fab zip; `verify.py --pcb` judges both turns | Schematic: 35 steps, ~4 min, 9 approved edit batches; ERC 0/0; 21/21 requirements; no overlapping symbols (the checker has since gained a 22nd, the MCU wiring check, which the shipped fixture satisfies; not rerun with an agent). Board: not run with an agent yet; the checker passes the board the tools make from the shipped fixture (sync, JLCPCB preset, `auto_place`, GND pour, Freerouting 2.5.0, export: 22/22 and 11/11) |
| `pcb-from-existing-sch` | The finished `usb_attiny_blocks` schematic (`input/`, drawn in functional blocks, ERC 0) → only the board, same requirements as the second turn above. The checker also confirms with KiCad's netlist that the schematic was left as given | Not run with an agent yet; the checker passes the board the tools make from `input/` (13/13) and fails an unrouted board, a hole smaller than JLCPCB drills, a zip without the outline, a zip older than the board and a track below the board's minimum width |
| `led-resistor-sim` | 5 V supply, series resistor and LED chosen so the current is 8-12 mA, proved with `kicad_simulate`. The checker runs its own SPICE assertions through ngspice after ERC | not run with an agent yet; the checker was exercised against a hand-built 330 Ω circuit (9.4 mA) |

Run one: create the blank project (`python -m dsh_kicad_sidecar --call create_schematic --args '{"path":".../usb_attiny.kicad_sch"}'`),
give the agent `prompt.md`, then `python evals/usb-attiny85/verify.py packages/kicad-bridge/sidecar/src .../usb_attiny.kicad_sch`.
For the board, send `prompt-board.md` in the same session once the schematic passes, then run the checker again with `--pcb`
(the board is `usb_attiny.kicad_pcb` next to the schematic; `--pcb=path` names another). For `pcb-from-existing-sch`, copy
`input/` into an empty workspace, give the agent `prompt.md`, then `python evals/pcb-from-existing-sch/verify.py
packages/kicad-bridge/sidecar/src .../usb_attiny_blocks.kicad_sch`. Routing needs Java 25+ and Freerouting (`/kicad-install freerouting`).

**Board checks** (`board_check.py`, shared): KiCad's DRC with schematic parity and the zones refilled (parity 0, 0 unrouted,
0 errors), JLCPCB's limits (KiCad's DRC on a copy with the fab's rules, as the export's gate does), 2 copper layers, a GND
pour, and the fab zip as KiCad wrote it: the Gerber X2 file functions of both copper,
solder mask and silkscreen layers and the outline, Excellon drill hits equal to the board's plated holes (vias, through-hole
pads) and non-plated holes, and a zip not older than the board. Placement quality (connectors on the edge, the board's size) is
not judged.

Record per turn, for the table: steps, wall time, tokens and approvals (dsh's session log has them), and the checker's score.
