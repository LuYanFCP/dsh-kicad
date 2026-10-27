# Beginner demo: a USB light that one press turns on and the next turns off

**Audience**: someone who has never designed a circuit. They need no parts, values or KiCad, and they write or compile no program.

**What it shows**: a one-sentence idea becomes a board you can order. Every step ends with something you can see, and KiCad and the simulators decide whether it is right, never the AI itself.

**Time**: 20–30 minutes; the AI's drawing and routing times vary. Run it once in full before a live demo.

## Before you start

1. Install dsh with the dsh-kicad plugin (see the repository [README](../../README.md), "Install") and KiCad 10.
2. Install the autorouter: type `/kicad-install freerouting` in dsh. It needs Java 25; if Java is missing, the install guidance says how to get it.
3. Open an **empty folder** as the session's workspace.
4. Copy `firmware/button_light.hex` from this folder into the workspace. It is the prepared program: a button on PB3 toggles the light on PB4, with 20 ms of debouncing. The AI never writes firmware, and the tools only read files inside the workspace.
5. Keep **Follow agent** on in the sidebar: whatever the AI creates or edits opens on the right and updates live.

## The script

Each step lists what to **type**, what you will **see**, and what to **say**. The prompts are the Chinese ones the demo was written for; English works the same.

### 0. Check the setup

- **Type**: `/kicad-doctor`
- **See**: an environment card with KiCad, Python and Freerouting green.
- **Say**: drawing, checking, routing and exporting all run locally in KiCad. The AI only drives the tools; KiCad judges every step.

### 1. Say the idea in one sentence

- **Type**: `/kicad-design 我想做一个 USB 供电的小灯：按一下按钮灯亮，再按一下就灭，以后还想改程序` (*a USB-powered light: one press turns it on, the next turns it off; I want to reprogram it later*)
- **See**:
  - 2–3 multiple-choice questions, such as how it is powered and how it will be reprogrammed, each with a recommended option. Pick the recommended ones.
  - `design-brief.md`: a numbered list of parts and connections, plus the assumptions it made, in plain words.
  - Finally **Build this / Change something**: pick "Build this".
- **Say**: you do not need to know which chip or which resistor. The AI completes the idea from proven circuit blocks (USB-C power, a 3.3 V regulator, an ATtiny85 microcontroller, the button, the LED, a programming header), and you only confirm.

### 2. Watch the schematic grow

- **See**:
  - The schematic opens on the right, and parts and wires appear step by step.
  - The sheet is laid out in titled blocks (USB INPUT, PWR SUPPLY, MCU, ISP, UI).
  - Every edit card reads **Automatic ERC · passed**.
- **Say**: after every change KiCad's electrical rules check runs; done means 0 errors.

### 3. Check that the chip is wired right

- **Type**: `帮我检查一下芯片接得对不对` (*check that the chip is wired right*)
- **See**: the ATtiny85 checked, 0 errors.
- **Say**: this check knows the microcontroller: is the reset pin pulled up, is the supply decoupled, is each function on a pin that can do it.

### 4. Try it before it exists

- **Type**: `我准备好了一个程序 button_light.hex（按钮在 PB3、灯在 PB4）。帮我仿真：1 秒时按一下按钮，灯要亮，松开后保持亮；2 秒时再按一下，灯要灭；并把这个测试保存下来。` (*here is a program; simulate it: a press at 1 s turns the light on and it stays on after release, another press at 2 s turns it off; save this test*)
- **See**:
  - **Firmware simulation PASSED**, every requirement ticked.
  - On the timeline the light comes on about 20 ms after the press: the program's debouncing.
- **Say**:
  - The program runs on a simulated chip, and the button and light are the two parts of the schematic.
  - Once saved, `/mcu-sim` reruns the test after any change, without the AI.
- **Optional: a failure on purpose**.
  - **Type**: `再加一条要求：按下后 10 ms 内灯就要亮` (*add a requirement: the light comes on within 10 ms of the press*)
  - **See**: that requirement **fails**: "never on in that window", because the program debounces for 20 ms first.
  - **Say**: the verdict comes from the simulation, not from the AI.
- **If the light never comes on**: the AI put the button or the light on other pins. Tell it `按钮改接 PB3，灯改接 PB4，然后重新仿真` (*move the button to PB3 and the light to PB4, then simulate again*).

### 5. Make a board you can order

- **Type**: `把它做成可以在嘉立创下单的电路板` (*make it a board I can order from JLCPCB*)
- **See** a sequence of cards while the board opens on the right:
  1. **Update PCB from schematic**: parity 0, the board matches the schematic.
  2. **Board edit**: parts placed by functional block, GND poured on both sides, each card with the **automatic DRC**.
  3. **Autoroute**: **0 unrouted**, DRC 0 errors.
  4. **Fab output**: **exported**, with **Download zip** and the **3D preview**.
- Click **3D** on the right and drag to turn the finished board.
- **Say**: the zip holds everything the factory needs (Gerbers, drill, placement, BOM); upload it to JLCPCB to order. KiCad gates the export: with DRC errors, unrouted connections or a mismatch with the schematic, nothing is exported.

## Check the result (for the presenter)

One command confirms the result, all of it by KiCad:

```sh
python demo/button-light/check.py packages/kicad-bridge/sidecar/src <the demo's workspace folder>
```

**The schematic** uses the beginner eval's checks:

- USB-C power with its CC pull-downs;
- a microcontroller with a programming header;
- a button that reaches the microcontroller, and a light it drives through a resistor;
- ERC at 0 errors, footprints, the written brief, no overlaps.

**The board** uses the board checks:

- parity 0, 0 unrouted, 0 DRC errors;
- within JLCPCB's limits;
- 2 layers with a GND pour;
- a complete, up-to-date Gerber and drill set in the zip.

## When something goes wrong on stage

- **The AI stalls or draws something odd**: continue steps 3–5 from the same circuit, already drawn, in `packages/kicad-bridge/sidecar/tests/fixtures/usb_attiny_blocks/`. Copy it into the workspace with `button_light.hex` next to it.
- **Routing says Java or Freerouting is missing**: install them as the card says, and repeat step 5.
- **Short on time**: do steps 1–2 beforehand and start live at step 3.

## The program

The source is `firmware/button_light.c`; `firmware/build.sh` rebuilds it (needs avr-gcc). It runs on the ATtiny85's factory 1 MHz clock. The repository's tests run step 4's simulation on the reference schematic, so the demo keeps working.
