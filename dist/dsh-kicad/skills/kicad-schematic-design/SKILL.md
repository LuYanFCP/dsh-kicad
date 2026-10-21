---
name: kicad-schematic-design
description: Schematic design conventions for KiCad work — reference designators, power and ground symbols, decoupling, net naming, connectors, layout readability.
---

# Schematic design conventions

Apply these unless the project already follows different conventions (read it first and stay consistent).

**References and values**
- Standard prefixes: R, C, L, D, Q, U, J (connectors), SW, TP, FB, Y (crystals). Let the tool auto-number with `R?`.
- Values in engineering notation without units where conventional: `10k`, `4k7`, `100n`, `10u`, `1M`.
- Give every part that goes on the board a footprint (`set_footprint`), e.g. `Resistor_SMD:R_0603_1608Metric`, `Capacitor_SMD:C_0603_1608Metric`.

**Power**
- Use power symbols (`power:GND`, `power:+3V3`, `power:+5V`, `power:VBUS`) via `connect_pin_to_net` with `kind: "power"`; do not draw global labels for supply rails.
- Every supply net needs a source: a regulator output, a connector, or a `power:PWR_FLAG`. Otherwise ERC reports `power_pin_not_driven`.
- One 100 nF decoupling capacitor per IC power pin, placed next to the IC, plus bulk capacitance (1–10 µF) per rail.

**Nets**
- Name meaningful nets with labels: `UART_TX`, `I2C_SDA`, `SPI_SCK`, `EN`, `nRESET` (active-low with an `n` prefix).
- Local `label` inside one sheet; `global_label` across sheets; `hierarchical_label` for sheet pins.
- Pull-ups/pull-downs: state the value and the rail (e.g. 10k to +3V3 on I2C lines, 4k7 for fast mode).

**Readability**
- Signal flow left → right, supplies at the top, ground at the bottom.
- Keep 2.54 mm multiples between pins and wires; avoid wires crossing symbols; prefer labels over long wires.
- Mark every intentionally unused IC pin with a no-connect flag.

**Before handing back**
- ERC passes (or remaining warnings are explained).
- BOM (`kicad_export` kind `bom`) has values and footprints for all board parts.
