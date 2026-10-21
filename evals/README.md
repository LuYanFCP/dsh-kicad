# Agent evals

End-to-end tasks for the KiCad agent. Each directory holds the user prompt (`prompt.md`)
and a checker that judges the result only with KiCad (`kicad-cli` ERC + netlist), never
with the model. Usable from dsh, Claude Code (sidecar MCP server) or an RL environment.

| Eval | Task | Last run (2026-10-21, dsh 0.2.1-rc.2, DeepSeek-V4.1-Flash, EDA preset) |
|---|---|---|
| `novice-button-led` | One beginner sentence via `/kicad-design`; simulated novice picks every Recommended option. Checker judges intent (USB-C + CC pulldowns, MCU + programming interface, button to an MCU pin, LED via resistor), ERC, footprints, brief, overlaps, wiring (at least half the signal nets drawn with wires, not only labels) | run 1: 4 questions + confirmation, 70 steps, 13 m 19 s, 6.3M tok; 12/12. run 2 (after adding kicad_library_symbol / kicad_search_footprints): 25 steps, 3 m 28 s, 1.1M tok, 7 approvals; 12/12. Both runs predate the wiring check and fail it (2 of 10 signal nets wired: every other pin ended in its own label). Known gap: text/label collisions are not checked yet |
| `usb-attiny85` | Blank project → USB-C power, CC pulldowns, AMS1117-3.3, power LED, ATtiny85 with decoupling and reset pull-up, button, LED, AVR-ISP-6, footprints | 35 steps, ~4 min, 9 approved edit batches; ERC 0/0; 21/21 requirements; no overlapping symbols |

Run one: create the blank project (`python -m dsh_kicad_sidecar --call create_schematic --args '{"path":".../usb_attiny.kicad_sch"}'`),
give the agent `prompt.md`, then `python evals/usb-attiny85/verify.py packages/kicad-bridge/sidecar/src .../usb_attiny.kicad_sch`.
