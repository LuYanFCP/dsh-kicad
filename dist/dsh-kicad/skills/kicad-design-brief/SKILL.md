---
name: kicad-design-brief
description: Turn a vague or beginner hardware request ("a USB-powered board where a button lights an LED") into a complete, numbered schematic spec with proven sub-circuits and part values, confirmed by the user before any drawing. Use before editing whenever the request does not already name parts, values and connections.
---

# Design brief: from one sentence to a buildable spec

Many users cannot write a schematic specification. Your job is to write it for them, using sensible beginner defaults, and to ask only what you cannot reasonably decide. Do **not** edit any schematic until the user has confirmed the brief.

## 1. Understand the goal

Restate the goal in one sentence in the user's language. Read the working directory first (the prompt context lists KiCad files): extend an existing design if there is one; otherwise plan a new `<name>.kicad_sch` (`kicad_create_schematic`).

## 2. Find the gaps

Check each item; anything the request leaves open is either a **default** (decide it, say so) or a **question**:

| Topic | Beginner default |
|---|---|
| Power input | USB-C power-only receptacle, 5 V |
| Logic voltage | 3.3 V from an AMS1117-3.3 LDO |
| Controller | ATtiny85-20S for ≤ 5 I/O; ATmega328P-A ("Arduino Uno chip") for more I/O or Arduino familiarity; RP2040 / ESP32-C3 module only if USB data or Wi-Fi is required |
| Programming | AVR-ISP-6 header for AVR; SWD header for ARM; USB for modules with native USB |
| Inputs / outputs | one push button to GND (internal pull-up), LEDs with series resistors |
| Assembly | SMD, 0603 passives (say "hand-solderable 0805" if the user mentions hand soldering) |
| Board / PCB | schematic only unless asked |

Ask **at most 3–4 questions**, all at once, with `ask_user_question` (multiple choice, the recommended option first and marked as recommended, plus the user's own answer). Good questions change the circuit: "How will it be powered?", "Do you want to program it like an Arduino (USB) or with a programmer?", "How many buttons/LEDs/sensors?". Never ask about values you can pick (resistor values, capacitor sizes, footprints). If the user says "you decide" or the request is already specific, skip the questions.

## 3. Write the brief

Group the spec by functional block (one heading per block, named for its job and main part such as `3V3 LDO — AMS1117-3.3`; these become the titled frames on the schematic). Write a numbered spec as precise as a datasheet-literate engineer would — every part with its `lib_id`-level identity, value, footprint size and every connection by net name. Use the proven blocks below. Then a short "assumptions I made" list in plain language, and the acceptance criteria (KiCad ERC 0 errors; every board part has a footprint; layout left-to-right, no overlaps; for a design that does more than one job, every part inside a titled functional block such as `USB-C POWER IN`, `3V3 LDO — AMS1117-3.3`, `MCU — ATtiny85`, parts within a block wired together and blocks joined only by labels).

Verify identities while writing, with tools rather than shell commands: `kicad_search_symbols` for lib_ids, `kicad_library_symbol` for pin names/numbers, `kicad_search_footprints` for footprint ids and pad names.

Save it as `design-brief.md` next to the schematic, show it to the user, and ask for confirmation (`ask_user_question`: "Build this" / "Change something"). Only after "Build this", follow the `kicad-agent-workflow` skill. Re-read `design-brief.md` before the final report and check every numbered item against `kicad_list_nets` and every heading against a titled block on the schematic.

## Proven blocks (use these values unless the user overrides)

- **USB-C power only** (`Connector:USB_C_Receptacle_PowerOnly_6P`): VBUS → +5V; CC1 and CC2 each through 5.1 kΩ to GND (without them a USB-C charger gives no power); GND and SHIELD to GND; PWR_FLAG on +5V and GND.
- **3.3 V LDO** (`Regulator_Linear:AMS1117-3.3`): VI ← +5V, VO → +3V3, GND; 10 µF on input and on output, placed next to the regulator.
- **Power LED**: +3V3 → 1 kΩ → LED → GND.
- **AVR minimum system**: VCC → +3V3 with 100 nF to GND at every VCC pin; RESET with 10 kΩ pull-up to +3V3; ATmega328P also needs AVCC → +3V3 (100 nF) and AREF 100 nF to GND; a 16 MHz crystal with 2 × 22 pF only if the user needs precise timing (otherwise internal 8 MHz).
- **AVR-ISP-6** (`Connector:AVR-ISP-6`): MISO/MOSI/SCK to the MCU's MISO/MOSI/SCK pins (ATtiny85: PB1/PB0/PB2), RST to RESET, VCC to +3V3, GND.
- **SWD header** (`Connector:Conn_ARM_SWD_TagConnect_TC2030` or a 2×5 1.27 mm header): SWDIO, SWCLK, NRST, VCC, GND.
- **Button**: GPIO → push button → GND; enable the internal pull-up in firmware (mention it).
- **LED output**: GPIO → 330 Ω → LED → GND (≈ 4 mA at 3.3 V).
- **I²C sensor/display**: SDA, SCL with 4.7 kΩ pull-ups to the logic rail; 100 nF at the module's VCC.
- **Unused MCU pins**: no-connect flag.

## Example

User: "想做个 USB 供电的小板，按一下按钮灯就亮，以后还能改程序。"
→ Questions (only these): power = USB-C (recommended) / battery; programming = AVR-ISP header (recommended, cheapest) / USB like Arduino (needs a bigger chip).
→ Brief (after "USB-C" + "ISP"): 1) USB-C power-only, CC 5.1 k pull-downs, VBUS = +5V; 2) AMS1117-3.3 with 10 µF in/out; 3) power LED 1 k; 4) ATtiny85-20S on +3V3, 100 nF, RESET 10 k pull-up; 5) PB3 button to GND (internal pull-up), PB4 → 330 Ω → LED; 6) AVR-ISP-6 to PB1/PB0/PB2/RESET; 7) 0603 SMD footprints, PWR_FLAGs; ERC 0 errors.
