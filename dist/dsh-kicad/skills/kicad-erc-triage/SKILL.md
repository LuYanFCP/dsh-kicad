---
name: kicad-erc-triage
description: How to read KiCad ERC violations (pin_not_connected, power_pin_not_driven, label_dangling, pin_to_pin, ...) and the edit operations that fix each one.
---

# Triage KiCad ERC results

KiCad's ERC report is the source of truth. Each violation has a `type`, a description, and items with positions (mm). Fix errors first; warnings may be acceptable but say so explicitly.

| type | Meaning | Typical fix (kicad_edit_schematic ops) |
|---|---|---|
| `pin_not_connected` | A pin touches nothing | Connect it (`connect_pin_to_net`, `connect_pins`) or, if unused on purpose, `no_connect_pin` |
| `power_pin_not_driven` | A power-input pin's net has no power source | Add `power:PWR_FLAG` on that net (e.g. `add_symbol` PWR_FLAG then `connect_pin_to_net` its pin 1 to the net with `kind: power`), or connect a real regulator/connector output |
| `label_dangling` / `isolated_pin_label` | A label connects to nothing / to only one pin | Attach the label to a pin, or give the net a second member |
| `wire_dangling` | A wire end is open | Remove or extend it to a pin; prefer redrawing with `connect_pins` |
| `pin_to_pin` | Incompatible pin types share a net (e.g. two outputs) | Re-check the circuit; insert a resistor/buffer or move one pin to another net — ask the user when intent is unclear |
| `no_connect_connected` | A no-connect flag sits on a connected pin | Remove the conflicting connection or the flag |
| `multiple_net_names` | One net carries two label names | Rename one label so the net has a single name |
| `similar_labels` | Labels differ only in case | Make the spelling consistent |
| `lib_symbol_issues` / `lib_symbol_mismatch` | Cached symbol differs from the library | Usually harmless after library updates; mention it, do not "fix" by editing text |
| `endpoint_off_grid` | Something is off the 1.27 mm grid | Move the symbol (`move_symbol` snaps to grid) |

Workflow:

1. Group violations by type; fix the most common type first in one batch.
2. Use the reported positions with `kicad_get_symbol_pins` to identify the exact pin.
3. Re-run: the edit result already contains the new ERC verdict.
4. Stop when ERC passes, or when the remaining items need a design decision — then ask the user.
