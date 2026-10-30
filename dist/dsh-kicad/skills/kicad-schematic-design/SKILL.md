---
name: kicad-schematic-design
description: Schematic conventions for drawing or tidying a KiCad schematic — functional blocks in titled frames built block by block, reference designators, power and ground symbols, decoupling, net naming, connectors, readability.
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
- One 100 nF decoupling capacitor per IC power pin, placed next to the IC, plus bulk capacitance (1–10 µF) per rail. Where the datasheet asks for more (a regulator's output capacitor, a module's bulk capacitor), its value wins: read it with `kicad_datasheet` and keep it as a `kicad_check_design` check.

**Nets**
- Name meaningful nets with labels: `UART_TX`, `I2C_SDA`, `SPI_SCK`, `EN`, `nRESET` (active-low with an `n` prefix).
- Local `label` inside one sheet; `global_label` across sheets; `hierarchical_label` for sheet pins.
- Pull-ups/pull-downs: state the value and the rail (e.g. 10k to +3V3 on I2C lines, 4k7 for fast mode).

**Readability**
- Signal flow left → right, supplies at the top, ground at the bottom.
- Draw wires between parts that work together (`connect_pins`): a sheet where every pin ends in its own label is hard to read. Labels are for long distances and for connections between blocks.
- Keep 2.54 mm multiples between pins and wires; avoid wires crossing symbols; turn parts so wired pins face each other.
- Mark every intentionally unused IC pin with a no-connect flag.

**Organise by function (every design that does more than one job)**
- Split the design into functional blocks, each in its own titled dashed frame. A block holds one job: the IC plus its decoupling, pull-ups, LEDs, buttons and connector for that job.
- Title each block with its job and main part, so the sheet reads like a reference design: `USB-C POWER IN`, `3V3 LDO — AMS1117-3.3`, `MCU — ESP32-S3-WROOM-1`, `USB-TO-UART — CH340C`, `BATTERY CHARGING — TP4056`, `ISP HEADER`. Short notes inside a block (`add_text`) explain the choices a reader would ask about: `Straps: EN 10k pull-up (R1)`, `CC1/CC2: 5.1k pull-downs (sink)`, `RESET: 10k pull-up (R3)`.
- Blocks talk to each other only through net labels (`global_label` for signals such as `TXD`, `RESET`, `SDA/IO4`) and power symbols. No wire crosses a frame.
- Inside a block, wire the parts together (`connect_pins`); anything leaving the block ends in a label or power symbol.
- Page: `set_page` with `A3` for 4+ blocks (A4 for small designs) and a title. Plan a grid of blocks inside the drawable area that `kicad_read_schematic` reports (`page.drawable`; the bottom-right corner is the title block): e.g. on A3 a top row of 2–3 large blocks (power entry, power supply, MCU) and a bottom row of 3–4 small ones (connectors, sensors, charging), 10 mm gaps between frames. Power flows left → right, the MCU sits in the largest block.
- Build block by block, one `kicad_edit_schematic` call per block: place its parts in its area with explicit references (`U1`, `R1`, `C1`…) so the same call can wire them, wire and label them, and make `add_block{title, references}` the call's last operation (the frame encloses their wiring and labels). A block too big for one call (~20 operations) takes two; frame it in the second. Or draw the frame first with `add_block{title,x,y,width,height}` and place parts inside.
- After a batch that places or moves parts, the edit result's `Functional blocks:` line names the parts outside every block. `kicad_read_schematic` lists `blocks` (title, frame, parts inside) and `outside_blocks` (parts in no frame: all of them while the sheet has no block).
- In an existing schematic keep its organisation: put new parts in the block they belong to (`move_block` makes room). Turn an unframed sheet into blocks only when the user asks (below).

**Reorganising an existing messy schematic**
1. `kicad_read_schematic` + `kicad_list_nets`; assign every part to a block and write the plan (block → parts → target area) before editing.
2. Cut wires that run between blocks: `disconnect_pin` on one end, then `connect_pin_to_net` on both pins with the net's name (`kind: "global_label"`, or `power` for rails). Keep the net names KiCad already uses so connectivity does not change.
3. Move each block's parts together with `move_symbols{references,dx,dy}`: their wires, labels and power symbols travel along. It refuses (and names the pin pair) if a wire still leads to a part outside the group — cut that wire first (step 2) or add the part to the group.
4. Frame each group with `add_block{title, references}`; reposition a finished block with `move_block{title, x, y}`.
5. Compare `kicad_list_nets` with step 1 (same nets, same pins) and check ERC and a render.

**Before handing back**
- ERC passes (or remaining warnings are explained).
- The design checks pass (`kicad_check_design`); any that cannot verify are named.
- In a design you drew, every part sits in a titled block (no `outside_blocks`), frames do not overlap (`add_block` reports `overlaps`), and `kicad_render` shows nothing sticking out of a frame.
- BOM (`kicad_export` kind `bom`) has values and footprints for all board parts.
