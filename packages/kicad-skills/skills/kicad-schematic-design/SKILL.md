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

**Organise by function (any design with more than ~8 parts)**
- Split the design into functional blocks, each in its own titled dashed frame: e.g. `USB-TO-UART`, `PWR SUPPLY`, `MCU`, `BATTERY`, `BATTERY CHARGING`, `DISPLAY`, `GAS SENSOR`. A block holds one job: the IC plus its decoupling, pull-ups, LEDs, buttons and connector for that job.
- Blocks talk to each other only through net labels (`global_label` for signals such as `TXD`, `RESET`, `SDA/IO4`) and power symbols. No wire crosses a frame.
- Inside a block, short wires between neighbouring parts are fine; anything leaving the block ends in a label or power symbol.
- Page: `set_page` with `A3` for 4+ blocks (A4 for small designs) and a title. Plan a grid of blocks inside the drawable area that `kicad_read_schematic` reports (`page.drawable`; the bottom-right corner is the title block): e.g. on A3 a top row of 2–3 large blocks (power entry, power supply, MCU) and a bottom row of 3–4 small ones (connectors, sensors, charging), 10 mm gaps between frames. Power flows left → right, the MCU sits in the largest block.
- Build: place each block's parts in its area, wire and label them, then `add_block{title, references}` frames them (it encloses their wiring and labels). Or draw the frame first with `add_block{title,x,y,width,height}` and place parts inside.
- `kicad_read_schematic` lists `blocks` (title, frame, parts inside) and `outside_blocks` (parts not in any frame). Before handing back, `outside_blocks` is empty, frames do not overlap (`add_block` reports `overlaps`), and `kicad_render` shows nothing sticking out of a frame.

**Reorganising an existing messy schematic**
1. `kicad_read_schematic` + `kicad_list_nets`; assign every part to a block and write the plan (block → parts → target area) before editing.
2. Cut wires that run between blocks: `disconnect_pin` on one end, then `connect_pin_to_net` on both pins with the net's name (`kind: "global_label"`, or `power` for rails). Keep the net names KiCad already uses so connectivity does not change.
3. Move each block's parts together with `move_symbols{references,dx,dy}`: their wires, labels and power symbols travel along. It refuses (and names the pin pair) if a wire still leads to a part outside the group — cut that wire first (step 2) or add the part to the group.
4. Frame each group with `add_block{title, references}`; reposition a finished block with `move_block{title, x, y}`.
5. Compare `kicad_list_nets` with step 1 (same nets, same pins) and check ERC and a render.

**Before handing back**
- ERC passes (or remaining warnings are explained).
- BOM (`kicad_export` kind `bom`) has values and footprints for all board parts.
