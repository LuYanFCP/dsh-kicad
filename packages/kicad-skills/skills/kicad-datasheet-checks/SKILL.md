---
name: kicad-datasheet-checks
description: Read each part's datasheet with kicad_datasheet and turn what the schematic must meet into unit-test-like checks with kicad_check_design that quote the datasheet (voltages, required capacitors, pull-ups, LED current, regulator dropout), then make every check pass.
---

# Datasheet checks: unit tests for a schematic

A part's datasheet, not memory, sets its limits and the parts around it. Read it with `kicad_datasheet`, write each requirement the schematic must meet as a `kicad_check_design` check that quotes the datasheet, and let the tool judge the checks on KiCad's netlist. Treat them like unit tests: write them with the block, expect them to fail until the schematic meets them, and keep them. They live in `design-checks.json` next to the schematic and re-run after every schematic edit.

## When

- Every IC, regulator, module, interface chip, LED and crystal: read its datasheet before wiring its block.
- Passives get their values from the part they serve. A regulator's output capacitor is a check on the regulator.
- Values set by a standard or by the user (USB-C CC pull-downs, an I²C pull-up value, a target LED current) come from the user's spec. Write them in `design-brief.md` and cite that file, never your memory.

## 1. Read the datasheet

1. `kicad_datasheet {path, reference: "U1"}` follows the symbol's Datasheet link; before placing a part, use `lib_id`.
   - No link, or a link to a web page or a zip: find the PDF (`web_search` "<part> datasheet pdf", the maker's site) and pass `url`.
   - Or ask the user for the PDF and pass `pdf` (a file in the workspace).
2. The result indexes the pages of the usual sections. Read them with `query` ("absolute maximum", "output capacitor", "dropout", "decoupling", "pull-up", "forward current") or with `pages` (at most 4).

What to take, by part type (each line is one or more checks):

| Part | Checks |
|---|---|
| Linear regulator | input below its absolute maximum (`max_voltage`); input minus output at least the dropout (`voltage_difference`); input and output capacitance (`capacitance` min, sometimes max) |
| Switching regulator | input range; the capacitors in its application table |
| MCU or module | each supply pin in the operating range (`voltage_range`); decoupling (`capacitance`); reset or enable pull-up (`resistance`); strapping pins (also `kicad_check_mcu`) |
| LED | Vf and maximum forward current (`led_current`) |
| Interface IC (USB-UART, CAN, RS-485) | supply range; required capacitors; pull-ups and terminations |
| Pins tied together (exposed pad to GND, both VCC pins) | `same_net` |

## 2. Write the checks

`kicad_check_design {path, checks: [...]}` saves the checks and runs them all. Each check has an `id`, a `rule` and the rule's fields, plus a `source` whose `quote` the bound comes from. A value takes an SI prefix (`"22u"`, `"4.7k"`, `"20m"`); a pin is `"REF:PIN"` by number or name.

```json
{"id": "U1-vin", "rule": "max_voltage", "part": "U1", "pin": "U1:VI", "max": 15,
 "source": {"part": "U1", "page": 2, "quote": "Input Voltage 15V"}}
{"id": "U1-cout", "rule": "capacitance", "part": "U1", "pin": "U1:VO", "min": "22u",
 "source": {"part": "U1", "page": 4, "quote": "The addition of 22µF solid tantalum on the output will ensure stability for all operating conditions."}}
{"id": "U1-dropout", "rule": "voltage_difference", "part": "U1", "pin": "U1:VI", "minus": "U1:VO", "min": 1.3,
 "source": {"part": "U1", "quote": "The dropout voltage of the device is guaranteed maximum 1.3V"}}
{"id": "D1-current", "rule": "led_current", "led": "D1", "vf": 2.0, "min": "1m", "max": "5m",
 "source": {"file": "design-brief.md", "quote": "Power LED: green, Vf 2.0 V, 1 mA to 5 mA"}}
```

Sources:
- `part` uses that part's datasheet link. `url` names a datasheet read with `kicad_datasheet`, `pdf` a workspace PDF, and `file` a workspace text file such as `design-brief.md`. A list of sources works when one check needs two quotes (Vf from one table, the current from another).
- Copy the quote word for word from the tool's text: a sentence, or a whole table row of at least 12 characters. It must contain every number the check uses.
  - A quote that is not in the source, or that does not state the bound, makes the check CANNOT VERIFY, however true the value may be.
  - For a table whose unit sits in the header, quote the row with its numbers ("VDD 3.0 3.3 3.6 V").
- Rails named by their voltage (`+3V3`, `+5V`, `+1V8`) are known; declare the others with `rails: {"VBUS": 5, "VBAT": 4.2}`.

Rule notes:
- `capacitance` adds up every capacitor between the two nets (default GND), so a rail's other decoupling capacitors count too.
- `resistance` passes when one resistor between the pin's net and `to` (a net or a `REF:PIN`) is in range or at `value` ± `tolerance` (default 5 %).
- `led_current` follows the LED through one series resistor to a rail on each side.

## 3. Make them pass

- After every schematic edit the result lists the checks that fail or cannot verify. `kicad_check_design {path}` re-runs them all.
- **FAIL**: fix the schematic (the value, the missing capacitor, the pull-up). If the user's spec chose the value, quote the datasheet to them and ask; do not change it silently. Never weaken a check to fit the schematic.
- **CANNOT VERIFY**: fix the source (an exact quote, the right page or URL) or declare the rail. If it still cannot be verified, report it as unverified; do not call it checked.
- Before handing back: no check fails, and the report lists the checks (how many passed, and every one that could not be verified, with the reason).
