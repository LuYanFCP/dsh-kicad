# Agent evals

End-to-end tasks for the KiCad agent. Each directory holds the user prompt (`prompt.md`)
and a checker that judges the result only with KiCad (`kicad-cli` ERC + netlist, and for
boards DRC with schematic parity), never with the model. Usable from dsh, Claude Code
(sidecar MCP server) or an RL environment.

| Eval | Task | Last run (2026-10-21, dsh 0.2.1-rc.2, DeepSeek-V4.1-Flash, EDA preset) |
|---|---|---|
| `novice-button-led` | One beginner sentence via `/kicad-design`; simulated novice picks every Recommended option. Checker judges intent (USB-C + CC pulldowns, MCU + programming interface, button to an MCU pin, LED via resistor), ERC, footprints, brief, overlaps, wiring (at least half the signal nets drawn with wires, not only labels) | run 1: 4 questions + confirmation, 70 steps, 13 m 19 s, 6.3M tok; 12/12. run 2 (after adding kicad_library_symbol / kicad_search_footprints): 25 steps, 3 m 28 s, 1.1M tok, 7 approvals; 12/12. Both runs predate the wiring check and fail it (2 of 10 signal nets wired: every other pin ended in its own label). Known gap: text/label collisions are not checked yet |
| `usb-attiny85` | Blank project → USB-C power, CC pulldowns, AMS1117-3.3, power LED, ATtiny85 with decoupling and reset pull-up, button, LED, AVR-ISP-6, footprints. **Second turn** (`prompt-board.md`, once ERC passes): the board — 2 layers, JLCPCB rules, placement by functional block, GND pour on both sides, routed, JLCPCB fab zip; `verify.py --pcb` judges both turns | Schematic: 35 steps, ~4 min, 9 approved edit batches; ERC 0/0; 21/21 requirements; no overlapping symbols. The checker has since gained a 22nd requirement, the MCU wiring check, and a 23rd, the schematic drawn in titled functional blocks (2+ frames, none crossing, every part inside one). The framed fixture `usb_attiny_blocks` meets both; the unframed `usb_attiny` meets every requirement except the blocks (22/23). Not rerun with an agent. Board: not run with an agent yet; the checker passes the board the tools make from `usb_attiny_blocks` (sync, JLCPCB preset, `auto_place`, GND pour, Freerouting 2.5.0, export: 23/23 and 11/11) |
| `usb-power-blocks` | Blank project → USB-C power input (CC pulldowns), AMS1117-3.3 with 10 µF in and out, a power LED: 8 parts doing three jobs. The prompt never mentions blocks. Besides ERC and the circuit, the checker requires the layout the working rules ask for: the schematic drawn in titled functional blocks (`block_check.py`, shared with `usb-attiny85`) | 2026-10-30, dsh 0.2.1-rc.2 headless, deepseek-flash (reasoning high), default preset: 20 steps, 2 min 37 s, 0.91M tokens (0.86M of them cache reads). 9 edit batches, 2 of them refused atomically and redone; one `add_block` per block, each with a note. ERC 0/0; 12/12 ([the schematic](../docs/images/eval-usb-power-blocks.png)). The LED block's note landed just below its frame (notes are not checked) |
| `usb-power-datasheet` | Blank project → the same supply, but the regulator's capacitors are left to the AMS1117 datasheet. It asks for 22 µF on the output for stability, where habit gives 10 µF. The checker wants the datasheet's values (input ≥ 10 µF, output ≥ 22 µF) and a 1-3 mA power LED. It also re-runs the agent's own `design-checks.json` (`kicad_check_design`, offline): at least two checks on the regulator must pass quoting its datasheet, and none may fail. The layout must be in titled blocks | 2026-10-30, dsh 0.2.1-rc.2 headless, deepseek-flash (reasoning high), default preset: 33 steps, 3 min 47 s, 1.85M tokens (1.76M of them cache reads). The agent loaded `kicad-datasheet-checks` and read the AMS1117 datasheet 7 times. It wrote `design-brief.md`, drew three titled blocks and put 22 µF on the output, from the datasheet. It saved 6 checks: 3 quoting the datasheet's pages 1, 2 and 4, and 3 quoting its brief. All pass, and they re-ran by themselves after its later edits. 14/14 ([the schematic](../docs/images/eval-usb-power-datasheet.png)). Two block titles run past their frame's right edge, which is not checked yet |
| `pcb-from-existing-sch` | The finished `usb_attiny_blocks` schematic (`input/`, drawn in functional blocks, ERC 0) → only the board, same requirements as the second turn above. The checker also confirms with KiCad's netlist that the schematic was left as given | Not run with an agent yet; the checker passes the board the tools make from `input/` (13/13) and fails an unrouted board, a hole smaller than JLCPCB drills, a zip without the outline, a zip older than the board and a track below the board's minimum width |
| `led-resistor-sim` | 5 V supply, series resistor and LED chosen so the current is 8-12 mA, proved with `kicad_simulate`. The checker runs its own SPICE assertions through ngspice after ERC | not run with an agent yet; the checker was exercised against a hand-built 330 Ω circuit (9.4 mA) |

Run one: create the blank project (`python -m dsh_kicad_sidecar --call create_schematic --args '{"path":".../usb_attiny.kicad_sch"}'`),
give the agent `prompt.md`, then `python evals/usb-attiny85/verify.py packages/kicad-bridge/sidecar/src .../usb_attiny.kicad_sch`.
For the board, send `prompt-board.md` in the same session once the schematic passes, then run the checker again with `--pcb`
(the board is `usb_attiny.kicad_pcb` next to the schematic; `--pcb=path` names another). For `pcb-from-existing-sch`, copy
`input/` into an empty workspace, give the agent `prompt.md`, then `python evals/pcb-from-existing-sch/verify.py
packages/kicad-bridge/sidecar/src .../usb_attiny_blocks.kicad_sch`. Routing needs Java 25+ and Freerouting (`/kicad-install freerouting`).
`usb-power-blocks` and `usb-power-datasheet` run like the schematic turn of `usb-attiny85`, with `usb_power.kicad_sch` and their own `verify.py`.

Without a browser: install the plugin into a headless profile (`dsh plugin --profile headless add <packed dist/dsh-kicad>`;
a separate `DSH_HOME` keeps it apart from your own profiles). That profile ignores saved sign-ins, so add rows to its
`cordis.patch.yml` that set `disabled: false` on `credentials`, `authorization` and `deepseek-account`, and pick the model
with `agent-default-model`. Then, in the workspace, run `dsh --profile headless --json "$(cat evals/<eval>/prompt.md)" > events.jsonl`.
Schematic edits inside the workspace need no approval in its default workspace-write mode.

**Board checks** (`board_check.py`, shared): KiCad's DRC with schematic parity and the zones refilled (parity 0, 0 unrouted,
0 errors), JLCPCB's limits (KiCad's DRC on a copy with the fab's rules, as the export's gate does), 2 copper layers, a GND
pour, and the fab zip as KiCad wrote it: the Gerber X2 file functions of both copper,
solder mask and silkscreen layers and the outline, Excellon drill hits equal to the board's plated holes (vias, through-hole
pads) and non-plated holes, and a zip not older than the board. Placement quality (connectors on the edge, the board's size) is
not judged.

Record per turn, for the table: steps, wall time, tokens and approvals (dsh's session log has them), and the checker's score.
