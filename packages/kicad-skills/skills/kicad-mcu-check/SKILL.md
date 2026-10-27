---
name: kicad-mcu-check
description: Check how a microcontroller is wired with kicad_check_mcu (strapping pins, reserved flash pins, input-only GPIOs, EN, decoupling), verify that each signal sits on a GPIO the firmware can use, and for an ATtiny or a classic ESP32 run the user's firmware against the board with kicad_simulate_firmware; say plainly when an MCU or a firmware feature is not covered.
---

# Check the MCU wiring

ERC says the pins are connected; `kicad_check_mcu` says whether they are the *right* pins. It reads KiCad's netlist and a per-family pin table and judges the result itself. It is a static wiring check, not a firmware simulation: it cannot know what the firmware does with a pin.

## Workflow

1. **Before wiring**: turn what the board must do into requirements, one per signal. "Read the battery voltage while WiFi is on" → `{net: "VBAT_SENSE", needs: "adc1"}`; "drive a speaker with the DAC" → `{net: "AUDIO", needs: ["output", "dac"]}`; "a free-use GPIO" → `needs: "boot_free"`. Choose GPIOs that satisfy them: look at the table below, not at what was convenient to route.
2. **After wiring**: call `kicad_check_mcu {path, requirements}`. Fix every error with `kicad_edit_schematic` (the finding names the pin and the fix), rerun, and report the tool's verdict. Warnings: fix them or say why they are acceptable.
3. **CANNOT VERIFY** means no provider covers that MCU: tell the user the MCU's wiring was not checked, and what is covered. Never describe such a design as checked. A project can add a provider, `<family>.mcu.json` next to the schematic: copy a shipped one (`esp32.json`, `attiny85.json`, `atmega328p.json`) and take every value from the datasheet, not from memory.

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

Not covered (CANNOT VERIFY): ESP32-S2, S3, C3, C6 and ESP8266, whose strapping and reserved pins differ.

### ATtiny25/45/85 (8-pin AVR)

Peripherals sit on fixed pins, so state them as requirements (`i2c_sda`, `i2c_scl`, `spi_*`, `pwm`, `adc`, `int0`) before wiring: PB0 MOSI/SDA/PWM · PB1 MISO/PWM · PB2 SCK/SCL/ADC1/INT0 · PB3 ADC3/XTAL1 · PB4 ADC2/PWM/XTAL2 · PB5 RESET/ADC0 (a GPIO only with the RSTDISBL fuse, which disables ISP). RESET wants 10 kΩ to the supply; VCC 100 nF. Other ATtiny parts: CANNOT VERIFY.

### ATmega48/88/168/328 and Arduino Nano/UNO

Pins: PB0-PD7 on the chip, D0-D13 / A0-A7 on Nano/UNO module symbols. Fixed functions: PWM on PD6, PD5, PB1-PB3, PD3 (D6, D5, D9-D11, D3); ADC0-5 on PC0-PC5 (A0-A5), ADC6/7 analog only (A6/A7 on the Nano); I²C on PC4/PC5 (A4/A5); SPI SS/MOSI/MISO/SCK on PB2-PB5 (D10-D13); UART on PD0/PD1 (D0/D1: the module's USB serial, keep free); INT0/INT1 on PD2/PD3 (D2/D3). The chip also wants AVCC tied to VCC even without the ADC, 100 nF on AREF (never a rail), RESET pulled up, load capacitors on a crystal.


## Firmware against the board (ATtiny25/45/85, classic ESP32)

`kicad_check_mcu` is static. When the user has a firmware image (`.hex` or `.elf` from avr-gcc, PlatformIO or Arduino for the ATtiny; for the ESP32 see below), `kicad_simulate_firmware` runs it on a simulated chip wired as the schematic says, and judges what the board does. You never build, write or invent firmware: no image, no verdict; say so.

1. Turn the user's requirement into a scenario: what happens (`stimuli`: `press` / `release` / `toggle` a switch, or `drive` a net) and what must hold (`assertions`). "Pressing the button lights the LED within 20 ms" → stimulus `{at: "30ms", press: "SW1", name: "press"}`, assertion `{led: "D2", is: "on", after: "press", within: "20ms"}`; "the LED is off until then" → `{led: "D2", is: "off", from: "0ms", to: "29ms"}`; "PB0 blinks at 100 Hz" → `{pin: "PB0", level: "high", at: "5ms"}` and `low` at `15ms`. Name the switches and LEDs by reference (the error message lists them).
2. Read the verdict and the hazards. A hazard is a bug even when every assertion passes: a floating input (button without a pull-up: enable the internal pull-up or add a resistor), an output fighting a switch (overcurrent: fix the firmware or the wiring).
3. **Stopped at …** means the firmware uses something that is not simulated (USI two-wire/I²C, dead-time generators, forced output compares, Timer0 mode 5). Report that, and that anything after that moment is unverified: do not call it a pass. A `CANNOT VERIFY` is never `PASSED`.
4. Analog inputs: the ADC reads the voltage the network puts on the pin (a divider from a battery, a pull-up against a switch), single-ended or differential (`V * 1024 / Vref`, floored; bipolar two's complement), plus the bandgap and the temperature sensor (`{at: "50ms", temperature: 85}`). To test a battery monitor, `drive` the battery net to a voltage (`{at: "10ms", drive: "VBAT", level: 7.4}`) and assert the pin or LED the firmware sets. The analog comparator (AIN0/AIN1) follows the nets too. An analog pin left unconnected is reported as floating.
5. PWM: Timer0's OC0A/OC0B (PB0/PB1) and Timer1's OC1A/OC1B (PB1/PB4, with /OC1A on PB0 and /OC1B on PB3), in fast, phase-correct or toggle mode, are a duty cycle and a frequency. Assert them directly (`{pin: "PB0", duty: 0.25, tol: 0.02}`, `{pin: "PB0", freq: 490, tol_pct: 2}`) or through what they drive: an LED on a PWM pin is lit that fraction of the time (`{led: "D2", min: 0.2, max: 0.3}`, brightness 0-1; `is: on` fails for a dimmed LED), a net's average voltage is `duty * Vcc`. New compare values take effect at TOP/BOTTOM, so allow a period before asserting a duty after a write. A fade is a sequence of assertions at different times.
6. Resets, EEPROM and the USI: a switch from the RESET net (PB5) to ground resets the chip (it restarts 64 ms later, the default start-up fuses; `startup_ms` changes it; `rstdisbl: true` makes PB5 a GPIO). The watchdog resets or interrupts. Assert them as events: `{reset: "watchdog", after: "0ms", within: "20ms"}`, `{resets: 0, at: "5s"}` (no unexpected restart), `{eeprom: 0, is: 3, at: "250ms"}` (EEPROM writes take 3.4 ms and persist across resets; `eeprom: {"0": 7}` seeds it, an ELF's `.eeprom` section is loaded), `{usi: "tx", nth: 1, is: 165, by: "5ms"}` (SPI bytes; `usi_input: [18, 52]` is what a slave shifts in).
7. The board is a DC network: transistors, ICs and other parts on the pins' nets are treated as open and are listed in the result: if the requirement depends on them, say it is not covered. `clock_hz` defaults to 1 MHz (the factory 8 MHz RC with the divide-by-8 fuse): set it to the clock the firmware was built for (`F_CPU`), or timing assertions are wrong.
8. Keep the scenario with the project: once the assertions are right, run once more with `save_scenario: true`. It writes `<schematic name>.fw.json`; later `kicad_simulate_firmware {path}` and the user's `/mcu-sim` use it, so rerun it after every change and report which requirement broke.

### ESP32

The classic ESP32 runs its real flash image on Espressif's QEMU, so ESP-IDF and Arduino-ESP32 builds work as they are.

- Firmware: the merged flash image (`esptool.py --chip esp32 merge_bin -o flash.bin @flash_args` in the ESP-IDF build folder; Arduino's `.merged.bin`) or the build folder's `flasher_args.json`.
- Pins are `GPIO2`. The firmware starts after the boot (about 0.2 s, MicroPython about 2 s, varying by tens of ms): put the stimuli after the timeline shows its pin set-up.
- GPIO0 low at power-on (a pressed BOOT button in `initial`) starts the serial bootloader: the firmware does not run.
- **Stopped at …** and `not_emulated`: report them; whatever depends on them is unverified. LEDC PWM pads take `{pin, duty}`, `{pin, freq}` and LED brightness assertions. The ADCs read the net's voltage as in step 4.
