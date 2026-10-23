---
name: kicad-mcu-check
description: Check how a microcontroller is wired with kicad_check_mcu (strapping pins, reserved flash pins, input-only GPIOs, EN, decoupling), verify that each signal sits on a GPIO the firmware can use, and for an ATtiny run the user's firmware against the board with kicad_simulate_firmware; say plainly when an MCU or a firmware feature is not covered.
---

# Check the MCU wiring

ERC says the pins are connected; `kicad_check_mcu` says whether they are the *right* pins. It reads KiCad's netlist and a per-family pin table and judges the result itself. It is a static wiring check, not a firmware simulation: it cannot know what the firmware does with a pin.

## Workflow

1. **Before wiring**: turn what the board must do into requirements, one per signal. "Read the battery voltage while WiFi is on" → `{net: "VBAT_SENSE", needs: "adc1"}`; "drive a speaker with the DAC" → `{net: "AUDIO", needs: ["output", "dac"]}`; "a free-use GPIO" → `needs: "boot_free"`. Choose GPIOs that satisfy them: look at the table below, not at what was convenient to route.
2. **After wiring**: call `kicad_check_mcu {path, requirements}`. Fix every error with `kicad_edit_schematic` (the finding names the pin and the fix), rerun, and report the tool's verdict. Warnings: fix them or say why they are acceptable.
3. **CANNOT VERIFY** means no provider covers that MCU: tell the user the MCU's wiring was not checked, and what is covered. Never describe such a design as checked. A project can add a provider: `<family>.mcu.json` next to the schematic (`id`, `name`, `match {lib_id, value}`, `gpio_pin_pattern`, `enable {pin_pattern, ...}`, `supply {pins, min_uf}`, `gpios {number: {reserved | input_only | strapping {internal, avoid, severity, why} | adc | dac | touch | caps [..]}}`); copy the shipped `esp32.json` or `attiny85.json` structure and take every value from the datasheet, not from memory.

## Providers that ship

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

### ATtiny25/45/85 (8-pin AVR)

Peripherals sit on fixed pins, so state them as requirements (`i2c_sda`, `i2c_scl`, `spi_mosi`, `spi_miso`, `spi_sck`, `pwm`, `adc`, `int0`) before wiring:

| Pin | Fixed functions |
|---|---|
| PB0 (pin 5) | MOSI / DI / SDA, PWM (OC0A) |
| PB1 (pin 6) | MISO / DO, PWM (OC0B, OC1A) |
| PB2 (pin 7) | SCK / SCL, ADC1, INT0 |
| PB3 (pin 2) | ADC3, XTAL1 |
| PB4 (pin 3) | ADC2, PWM (OC1B), XTAL2 |
| PB5 (pin 1) | RESET, ADC0: a GPIO only with the RSTDISBL fuse, which disables ISP |

RESET wants 10 kΩ to the supply (the ISP header wiring); VCC wants 100 nF close to the chip. Other AVR parts (ATmega, ATtiny with other pinouts) come back as CANNOT VERIFY.


## Firmware against the board (ATtiny25/45/85 only)

`kicad_check_mcu` is static. When the user has a firmware image (`.hex` or `.elf` from avr-gcc, PlatformIO or Arduino), `kicad_simulate_firmware` runs it on a simulated ATtiny85 wired as the schematic says, and judges what the board does. You never build, write or invent firmware: no image, no verdict; say so.

1. Turn the user's requirement into a scenario: what happens (`stimuli`: `press` / `release` / `toggle` a switch, or `drive` a net) and what must hold (`assertions`). "Pressing the button lights the LED within 20 ms" → stimulus `{at: "30ms", press: "SW1", name: "press"}`, assertion `{led: "D2", is: "on", after: "press", within: "20ms"}`; "the LED is off until then" → `{led: "D2", is: "off", from: "0ms", to: "29ms"}`; "PB0 blinks at 100 Hz" → `{pin: "PB0", level: "high", at: "5ms"}` and `low` at `15ms`. Name the switches and LEDs by reference (the error message lists them).
2. Read the verdict and the hazards. A hazard is a bug even when every assertion passes: a floating input (button without a pull-up: enable the internal pull-up or add a resistor), an output fighting a switch (overcurrent: fix the firmware or the wiring).
3. **Stopped at …** means the firmware uses something that is not simulated (differential ADC, Timer1, USI/I²C, PWM, EEPROM, the watchdog). Report that, and that anything after that moment is unverified: do not call it a pass. A `CANNOT VERIFY` is never `PASSED`.
4. Analog inputs: the ADC reads the voltage the network puts on the pin (a divider from a battery, a pull-up against a switch). To test a battery monitor, `drive` the battery net to a voltage (`{at: "10ms", drive: "VBAT", level: 7.4}`) and assert the pin or LED the firmware sets; the reading is `V * 1024 / Vref`, floored. An ADC pin left unconnected is reported as floating.
5. The board is a DC network: transistors, ICs and other parts on the pins' nets are treated as open and are listed in the result: if the requirement depends on them, say it is not covered. `clock_hz` defaults to 1 MHz (the factory 8 MHz RC with the divide-by-8 fuse): set it to the clock the firmware was built for (`F_CPU`), or timing assertions are wrong.
