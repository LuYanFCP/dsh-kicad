---
name: kicad-simulate
description: Verify that a schematic meets its requirements (rail voltages, LED current, filter cutoff, timing) with kicad_simulate: add sources and SPICE models, write one assertion per requirement, read the tool's verdict, fix and rerun.
---

# Verify behaviour with SPICE

ERC says the schematic is wired correctly; `kicad_simulate` says whether it **behaves** as required. The tool runs ngspice and judges every assertion on the numbers. Report its verdict, never your own estimate.

## Workflow

1. Turn each requirement into a number: "3.3 V rail" → `V(3V3)` between 3.2 and 3.4; "LED about 10 mA" → `I(D1)` between 5 m and 15 m; "low-pass at 1 kHz" → `lowpass_cutoff_hz` = 1000 ± 5 %.
2. Make the circuit simulable (below), then call `kicad_simulate` with one assertion per requirement.
3. Read the verdict. On a failure, change the circuit (value, part, connection) with `kicad_edit_schematic`, then run again. Stop when every assertion holds, or ask the user when the requirement itself looks wrong.
4. If ngspice is missing the tool says so: give the user the install command from `kicad_doctor`; do not install it yourself.

## Making the circuit simulable

- **Ground**: SPICE needs a reference node: a `power:GND` symbol on the circuit's ground net.
- **Sources** (library `Simulation_SPICE`), set the value with `set_property` on `Sim.Params`:
  - `VDC`: a supply, `Sim.Params` `dc=5`.
  - `VSIN`: `dc=0 ampl=1 f=1k ac=1`; the `ac=1` makes it usable for ac sweeps.
  - `VPULSE`: `y1=0 y2=3.3 td=0 tr=1n tf=1n tw=5m per=10m` (a button press, a clock).
  - `IDC`: a current load.
- **R, C, L**: simulated from their Value (`10k`, `100n`, `4.7u`).
- **Diode and LED**: set the hidden property `Sim.Device` = `D` (`set_property` with `hide: true`); for an LED also `Sim.Params` = `is=1e-18 n=2 rs=3` (about 2 V at 10 mA). Without `Sim.Device` the tool refuses, because KiCad would wire the diode backwards.
- **Regulators, op-amps, transistors, ICs**: they need a vendor model: set `Sim.Library` (a `.lib`/`.mod` file) and `Sim.Name` (its model). Parts without any model are left out of the circuit and listed in the result; a requirement that depends on them cannot be verified: say so.
- Connectors and test points need nothing. Mark parts you do not simulate clearly in your answer.

## Assertions

`{probe, min?, max?, equals?+tol|tol_pct, name?, analysis?, measure?, at?, from?, to?, ref?, abs?}`; numbers accept `10k`, `100n`, `20m`.

| Requirement | Analysis | Assertion |
|---|---|---|
| Rail voltage | `op` | `{probe: "V(3V3)", min: 3.2, max: 3.4}` |
| Divider ratio | `op` | `{probe: "V(MID)", equals: 2.5, tol_pct: 2}` |
| Current through a part | `op` | `{probe: "I(R1)", equals: "10m", tol_pct: 10, abs: true}` |
| Supply current | `op` | `{probe: "I(V1)", max: "50m", abs: true}` (ngspice: a supplying source reads negative) |
| Power-up / step response | `tran {stop: "10m"}` | `{probe: "V(OUT)", analysis: "tran", measure: "final", min: 3.2}`; `measure: "max"` for overshoot, `measure: "at"` with `at: "1m"` for the value at a time |
| Ripple | `tran` | `{probe: "V(OUT)", measure: "pp", from: "5m", max: "50m"}` |
| Filter cutoff | `ac {start: 10, stop: "1Meg"}` | `{probe: "V(OUT)", analysis: "ac", measure: "lowpass_cutoff_hz", equals: 1000, tol_pct: 10}` (`highpass_cutoff_hz` for a high-pass) |
| Gain at a frequency | `ac` | `{probe: "V(OUT)", analysis: "ac", measure: "gain_db", at: "1k", ref: "V(IN)", min: -3.5, max: -2.5}` |

Net names are the names on the schematic (`V(3V3)`, not `/3V3`); `V(a,b)` is the difference; `I()` works for R, C, L, D and V parts. Run `tran` and `ac` together by listing both in `analyses`; then name the `analysis` in each assertion.

## When it fails to run

| Message | Fix |
|---|---|
| no ground | add a `power:GND` symbol to the circuit |
| no SPICE model / `Sim.Device` | set it as above |
| singular matrix / no DC path | a net has no DC path to ground (a capacitor-only net, a floating pin): connect it or add a large resistor to ground |
| unknown subcircuit/model | the part's `Sim.Library` / `Sim.Name` is wrong or missing |
| did not finish in time | `tran` with a tiny step over a long time: raise `step` or shorten `stop` |

Limits to state honestly: SPICE models ideal parts unless given a vendor model; it says nothing about firmware, signal integrity, EMC or heat.
