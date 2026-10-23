---
name: kicad-mcu-check
description: Check how a microcontroller is wired with kicad_check_mcu (strapping pins, reserved flash pins, input-only GPIOs, EN, decoupling) and verify that each signal sits on a GPIO with the capability the firmware needs; say plainly when an MCU is not covered.
---

# Check the MCU wiring

ERC says the pins are connected; `kicad_check_mcu` says whether they are the *right* pins. It reads KiCad's netlist and a per-family pin table and judges the result itself. It is a static wiring check, not a firmware simulation: it cannot know what the firmware does with a pin.

## Workflow

1. **Before wiring**: turn what the board must do into requirements, one per signal. "Read the battery voltage while WiFi is on" → `{net: "VBAT_SENSE", needs: "adc1"}`; "drive a speaker with the DAC" → `{net: "AUDIO", needs: ["output", "dac"]}`; "a free-use GPIO" → `needs: "boot_free"`. Choose GPIOs that satisfy them: look at the table below, not at what was convenient to route.
2. **After wiring**: call `kicad_check_mcu {path, requirements}`. Fix every error with `kicad_edit_schematic` (the finding names the pin and the fix), rerun, and report the tool's verdict. Warnings: fix them or say why they are acceptable.
3. **CANNOT VERIFY** means no provider covers that MCU: tell the user the MCU's wiring was not checked, and what is covered. Never describe such a design as checked. A project can add a provider: `<family>.mcu.json` next to the schematic (`id`, `name`, `match {lib_id, value}`, `gpio_pin_pattern`, `gpios {number: {reserved | input_only | strapping {internal, avoid, severity, why} | adc | dac | touch}}`); copy the shipped `esp32.json` structure and take every value from the datasheet, not from memory.

## Classic ESP32 (the provider that ships)

| GPIO | What matters |
|---|---|
| 0 | Strapping, low at reset = serial bootloader. Never tie to GND; a BOOT button to GND is fine. |
| 2 | Strapping, must be low or floating for automatic download. No strong pull-up. |
| 12 | Strapping (MTDI): high at reset selects 1.8 V flash, the chip may not boot. No pull-up, no 3V3. |
| 5, 15 | Strapping, defaults high; 15 low silences the boot log. |
| 6-11 | Connected to the SPI flash: leave unconnected (the SDx / CMD / CLK pads of a module). |
| 16, 17 | Reserved on PICO, WROVER and the -R2 modules (flash / PSRAM). |
| 34-39 | Input only, no internal pull-up or pull-down: a button needs an external 10 kΩ. |
| 32-39 | ADC1: usable with WiFi. The other ADC pins are ADC2, unusable while WiFi is on. |
| 25, 26 | The two DACs. |
| EN | 10 kΩ to the supply and about 1 µF to ground. |
| Supply | At least 10 µF plus 100 nF close to the module. |

Not covered: ESP32-S2, S3, C3, C6 and ESP8266 (their strapping and reserved pins differ): they come back as CANNOT VERIFY.
