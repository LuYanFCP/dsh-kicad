"""Firmware against the board: the compiled test programs (tests/fixtures/avr) on ATtiny85 circuits built with KiCad's own symbols."""
import os

import pytest

from dsh_kicad_sidecar import mcusim
from dsh_kicad_sidecar.mcusim import rail_volts, solve
from dsh_kicad_sidecar.tools import ToolError, Toolbox

from conftest import needs_kicad_cli, needs_symbols

FIX = os.path.join(os.path.dirname(__file__), "fixtures", "avr")
fw = lambda name: os.path.join(FIX, name + ".hex")

# ATtiny85: 1 ~RESET/PB5, 2 PB3, 3 PB4, 4 GND, 5 PB0, 6 PB1, 7 PB2, 8 VCC
# Device:LED pins: 1 = K, 2 = A; Switch:SW_Push pins 1 and 2


def circuit(tmp_path, extra=(), pullup=False, led_low=False, rail="+5V", name="board"):
    tb = Toolbox(roots=[str(tmp_path)])
    path = str(tmp_path / f"{name}.kicad_sch")
    tb.call("create_schematic", {"path": path})
    ops = [
        {"op": "add_symbol", "lib_id": "MCU_Microchip_ATtiny:ATtiny85-20S", "x": 127, "y": 88.9, "reference": "U1", "value": "ATtiny85-20S"},
        {"op": "add_symbol", "lib_id": "Switch:SW_Push", "x": 50.8, "y": 76.2, "reference": "SW1", "value": "BTN"},
        {"op": "add_symbol", "lib_id": "Device:R", "x": 76.2, "y": 38.1, "reference": "R1", "value": "330"},
        {"op": "add_symbol", "lib_id": "Device:LED", "x": 76.2, "y": 63.5, "reference": "D1", "value": "LED"},
        {"op": "add_symbol", "lib_id": "Device:R", "x": 152.4, "y": 63.5, "reference": "R2", "value": "10k"},
        {"op": "connect_pin_to_net", "pin": "U1:8", "net": rail, "kind": "power"},
        {"op": "connect_pin_to_net", "pin": "U1:4", "net": "GND", "kind": "power"},
        {"op": "connect_pin_to_net", "pin": "R2:1", "net": rail, "kind": "power"},
        {"op": "connect_pin_to_net", "pin": "R2:2", "net": "RST", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "U1:1", "net": "RST", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "SW1:1", "net": "BTN", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "SW1:2", "net": "GND", "kind": "power"},
        {"op": "connect_pin_to_net", "pin": "U1:2", "net": "BTN", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "U1:3", "net": "LEDDRV", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "R1:1", "net": "LEDDRV", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "R1:2", "net": "LEDMID", "kind": "label"},
    ]
    if led_low:  # active low: anode on the rail, cathode through the resistor to the pin
        ops += [{"op": "connect_pin_to_net", "pin": "D1:1", "net": "LEDMID", "kind": "label"}, {"op": "connect_pin_to_net", "pin": "D1:2", "net": rail, "kind": "power"}]
    else:
        ops += [{"op": "connect_pin_to_net", "pin": "D1:2", "net": "LEDMID", "kind": "label"}, {"op": "connect_pin_to_net", "pin": "D1:1", "net": "GND", "kind": "power"}]
    if pullup:
        ops += [{"op": "add_symbol", "lib_id": "Device:R", "x": 38.1, "y": 50.8, "reference": "R3", "value": "10k"},
                {"op": "connect_pin_to_net", "pin": "R3:1", "net": rail, "kind": "power"}, {"op": "connect_pin_to_net", "pin": "R3:2", "net": "BTN", "kind": "label"}]
    tb.call("edit_schematic", {"path": path, "operations": [*ops, *extra]})
    return tb, path


def run(tb, path, firmware, **kw):
    """The firmware has to be inside the project (the sidecar only reads below its roots): copy it next to the schematic."""
    import shutil

    local = os.path.join(os.path.dirname(path), firmware + ".hex")
    if not os.path.exists(local):
        shutil.copy(fw(firmware), local)
    return tb.call("simulate_firmware", {"path": path, "firmware": local, **kw})


PRESS = [{"at": "30ms", "press": "SW1", "name": "press"}, {"at": "70ms", "release": "SW1", "name": "release"}]


def verdicts(result):
    return [a["passed"] for a in result["assertions"]]


# ---- the resistive network -------------------------------------------------------------------
def test_solve_a_divider_a_pullup_and_a_floating_net():
    nets = ["VCC", "GND", "MID", "PIN", "FLOAT", "ISLAND"]
    volts = solve(nets, {"VCC": 5.0, "GND": 0.0}, [("VCC", "MID", 1000), ("MID", "GND", 3000), ("FLOAT", "ISLAND", 100)], [("PIN", 5.0, 35_000)])
    assert volts["MID"] == pytest.approx(3.75) and volts["PIN"] == pytest.approx(5.0)
    assert volts["FLOAT"] is None and volts["ISLAND"] is None  # no path to any voltage
    # a pull-up fighting a closed switch (50 mΩ to ground): the pin sits at ground
    pressed = solve(["VCC", "GND", "PIN"], {"VCC": 5.0, "GND": 0.0}, [("PIN", "GND", 0.05)], [("PIN", 5.0, 35_000)])
    assert pressed["PIN"] < 0.001
    # an output driving 5 V into ground through a closed switch: 125 mA through the 40 Ω driver
    shorted = solve(["GND", "PIN"], {"GND": 0.0}, [("PIN", "GND", 0.05)], [("PIN", 5.0, 40.0)])
    assert (5.0 - shorted["PIN"]) / 40.0 == pytest.approx(0.1248, abs=0.001)


def test_rail_voltages_from_names():
    assert [rail_volts(n) for n in ("+3V3", "+5V", "3.3V", "+3.3V", "VCC", "3V3_ESP", "/sheet/+5V")] == [3.3, 5.0, 3.3, 3.3, None, 3.3, 5.0]


# ---- the scenarios ---------------------------------------------------------------------------
@needs_kicad_cli
@needs_symbols
def test_a_button_lights_the_led(tmp_path):
    tb, path = circuit(tmp_path)
    result = run(tb, path, "button_poll", stimuli=PRESS, assertions=[
        {"led": "D1", "is": "off", "at": "20ms"},
        {"led": "D1", "is": "on", "after": "press", "within": "1ms", "name": "LED lights within 1 ms of the press"},
        {"led": "D1", "is": "on", "from": "35ms", "to": "69ms"},
        {"led": "D1", "is": "off", "after": "release", "within": "1ms"},
        {"pin": "PB4", "level": "high", "at": "50ms"}, {"net": "BTN", "level": "low", "at": "50ms"}, {"net": "BTN", "level": "high", "at": "80ms"},
        {"net": "LEDMID", "min": 4.5, "at": "50ms"}])
    assert result["passed"] is True and verdicts(result) == [True] * 8, result["assertions"]
    assert result["aborted"] is None and result["simulated_to"] == pytest.approx(0.1, abs=1e-5)
    assert not [h for h in result["hazards"] if h["severity"] != "info"]
    lit = next(e for e in result["timeline"] if e["leds"].get("D1"))
    assert 0.03 < lit["t"] < 0.0301 and lit["pins"]["PB4"] == "out-high" and lit["switches"] == ["SW1"]
    assert result["pins"]["PB3"] == "BTN" and result["switches"] == ["SW1"] and result["leds"] == ["D1"]


@needs_kicad_cli
@needs_symbols
def test_a_wrong_requirement_fails_with_the_reason(tmp_path):
    tb, path = circuit(tmp_path)
    result = run(tb, path, "button_poll", stimuli=PRESS, assertions=[
        {"led": "D1", "is": "on", "at": "20ms", "name": "LED on at start (wrong)"},
        {"led": "D1", "is": "on", "from": "35ms", "to": "80ms", "name": "LED on until the end (wrong)"},
        {"led": "D1", "is": "on", "after": "release", "within": "5ms", "name": "LED lights after the release (wrong)"}])
    assert verdicts(result) == [False, False, False] and result["passed"] is False
    first, second, third = result["assertions"]
    assert "it was off at 20 ms, expected on" in first["reason"]
    assert "it was off from 70" in second["reason"] and "expected on throughout" in second["reason"]
    assert "never on in that window" in third["reason"]


@needs_kicad_cli
@needs_symbols
def test_an_active_low_led_and_a_3v3_rail(tmp_path):
    tb, path = circuit(tmp_path, led_low=True, rail="+3V3")
    result = run(tb, path, "button_poll", stimuli=PRESS, assertions=[
        {"led": "D1", "is": "on", "at": "20ms"}, {"led": "D1", "is": "off", "at": "50ms"}, {"net": "LEDMID", "min": 3.0, "at": "50ms"}, {"net": "LEDMID", "max": 0.5, "at": "20ms"}])
    assert result["vcc"] == 3.3 and verdicts(result) == [True, True, True, True]


@needs_kicad_cli
@needs_symbols
def test_a_button_without_any_pull_floats_and_the_run_says_so(tmp_path):
    tb, path = circuit(tmp_path)
    result = run(tb, path, "button_nopull", stimuli=PRESS, assertions=[{"led": "D1", "is": "off", "at": "20ms", "name": "LED off while the button is released"}])
    hazard = next(h for h in result["hazards"] if h["rule"] == "floating_input")
    assert hazard["pin"] == "PB3" and hazard["severity"] == "warning" and "PORTB |= 1 << PB3" in hazard["fix"]
    assert result["passed"] is False  # the floating pin reads low, so the LED is on while the button is released
    # an external pull-up makes the same firmware correct, without the hazard
    tb, path = circuit(tmp_path / "fixed", pullup=True)
    fixed = run(tb, path, "button_nopull", stimuli=PRESS, assertions=[{"led": "D1", "is": "off", "at": "20ms"}, {"led": "D1", "is": "on", "at": "50ms"}])
    assert fixed["passed"] is True and not [h for h in fixed["hazards"] if h["rule"] == "floating_input"]


@needs_kicad_cli
@needs_symbols
def test_an_output_fighting_a_button_is_an_overcurrent_error(tmp_path):
    tb, path = circuit(tmp_path)
    result = run(tb, path, "contention", stimuli=[{"at": "20ms", "press": "SW1"}], assertions=[{"pin": "PB3", "level": "high", "at": "10ms"}])
    hazard = next(h for h in result["hazards"] if h["rule"] == "overcurrent")
    assert hazard["severity"] == "error" and hazard["pin"] == "PB3" and "125 mA" in hazard["message"] and hazard["t"] == pytest.approx(0.02)
    assert result["passed"] is False and verdicts(result) == [True]  # the assertion holds; the board is still wrong
    quiet = run(tb, path, "contention", assertions=[{"pin": "PB3", "level": "high", "at": "10ms"}])
    assert quiet["passed"] is True and not [h for h in quiet["hazards"] if h["severity"] != "info"]


@needs_kicad_cli
@needs_symbols
def test_timing_delay_loop_and_timer(tmp_path):
    tb, path = circuit(tmp_path)
    blink = run(tb, path, "blink_delay", duration="60ms", assertions=[
        {"pin": "PB0", "level": "high", "at": "5ms"}, {"pin": "PB0", "level": "low", "at": "15ms"}, {"pin": "PB0", "level": "high", "at": "25ms"},
        {"pin": "PB0", "level": "high", "from": "11ms", "to": "19ms", "name": "never high 11-19 ms (wrong)"}])
    assert verdicts(blink) == [True, True, True, False]
    timer = run(tb, path, "timer_ctc", duration="60ms", assertions=[
        {"pin": "PB0", "level": "low", "at": "4ms"}, {"pin": "PB0", "level": "high", "at": "12ms"}, {"pin": "PB0", "level": "low", "at": "20ms"},
        {"pin": "PB0", "level": "high", "after": "0ms", "within": "9ms"}])
    assert verdicts(timer) == [True, True, True, True]  # an 8 ms period from OCR0A = 124 at clk/64
    ovf = run(tb, path, "timer_ovf", duration="30ms", assertions=[{"pin": "PB1", "level": "high", "at": "12ms"}, {"pin": "PB1", "level": "low", "at": "20ms"}])
    assert verdicts(ovf) == [True, True]  # bit 2 of the overflow count, one overflow per 2.048 ms


@needs_kicad_cli
@needs_symbols
def test_sleeping_firmware_wakes_on_a_pin_change_and_costs_nothing(tmp_path):
    tb, path = circuit(tmp_path)
    result = run(tb, path, "pcint_sleep", duration="300ms", stimuli=[
        {"at": "50ms", "press": "SW1", "name": "p1"}, {"at": "100ms", "release": "SW1"}, {"at": "150ms", "press": "SW1", "name": "p2"}],
        assertions=[{"led": "D1", "is": "off", "at": "40ms"}, {"led": "D1", "is": "on", "after": "p1", "within": "1ms"}, {"led": "D1", "is": "on", "at": "120ms"},
                    {"led": "D1", "is": "off", "after": "p2", "within": "1ms"}, {"led": "D1", "is": "off", "at": "250ms"}])
    assert result["passed"] is True and verdicts(result) == [True] * 5
    assert result["instructions"] < 400 and result["cycles"] == 300_000  # 300 ms at 1 MHz, almost all of it asleep


@needs_kicad_cli
@needs_symbols
def test_power_down_sleep_wakes_on_int0_and_an_external_drive(tmp_path):
    tb, path = circuit(tmp_path, [{"op": "connect_pin_to_net", "pin": "U1:7", "net": "INT0", "kind": "label"}])
    result = run(tb, path, "int0_powerdown", duration="50ms", stimuli=[{"at": "10ms", "drive": "INT0", "level": "low"}], assertions=[
        {"led": "D1", "is": "off", "at": "5ms"}, {"net": "INT0", "level": "high", "at": "5ms"}, {"led": "D1", "is": "on", "after": "0ms", "within": "20ms"}])
    assert result["passed"] is True and verdicts(result) == [True, True, True], result["assertions"]
    nothing = run(tb, path, "int0_powerdown", duration="50ms", assertions=[{"led": "D1", "is": "off", "from": "0ms", "to": "50ms"}])
    assert nothing["passed"] is True  # no edge, no wake-up


@needs_kicad_cli
@needs_symbols
def test_what_is_not_simulated_stops_the_run_and_nothing_after_it_is_passed(tmp_path):
    tb, path = circuit(tmp_path)
    adc = run(tb, path, "uses_acme", duration="10ms", assertions=[{"led": "D1", "is": "off", "at": "5ms", "name": "after the ADC use"}])
    assert adc["aborted"]["what"] == "ADC" and "ACME" in adc["aborted"]["reason"]
    assert adc["assertions"][0]["passed"] is None and "cannot verify" in adc["assertions"][0]["reason"] and adc["passed"] is None
    timer1 = run(tb, path, "uses_timer1_foc", duration="10ms", assertions=[{"pin": "PB0", "level": "low", "at": "5ms"}])
    assert timer1["aborted"]["what"] == "Timer1" and timer1["passed"] is None
    mode5 = run(tb, path, "uses_mode5", duration="10ms", assertions=[{"pin": "PB0", "level": "low", "at": "5ms"}])
    assert mode5["aborted"]["what"] == "Timer0" and "waveform mode 5" in mode5["aborted"]["reason"] and mode5["passed"] is None


@needs_kicad_cli
@needs_symbols
def test_unmodelled_parts_are_listed(tmp_path):
    tb, path = circuit(tmp_path, [{"op": "add_symbol", "lib_id": "Transistor_BJT:2N3904", "x": 177.8, "y": 63.5, "reference": "Q1", "value": "2N3904"},
                                  {"op": "connect_pin_to_net", "pin": "Q1:2", "net": "LEDDRV", "kind": "label"}])
    result = run(tb, path, "button_poll", assertions=[{"led": "D1", "is": "off", "at": "10ms"}])
    assert "Q1" in next(h for h in result["hazards"] if h["rule"] == "unmodelled_parts")["message"]


@needs_kicad_cli
@needs_symbols
def test_bad_arguments_name_the_fix(tmp_path):
    tb, path = circuit(tmp_path)
    for kw, message in (
        ({"stimuli": [{"at": "10ms", "press": "SW9"}]}, "no switch SW9 .switches: SW1"),
        ({"stimuli": [{"at": "10ms"}]}, "give exactly one of press"),
        ({"stimuli": [{"at": "500ms", "press": "SW1"}]}, "after the end of the simulation"),
        ({"stimuli": [{"at": "1ms", "drive": "NOWHERE", "level": "low"}]}, "no net named NOWHERE"),
        ({"stimuli": [{"at": "1ms", "drive": "BTN", "level": "dim"}]}, "drive needs level"),
        ({"assertions": [{"led": "D9", "is": "on", "at": "1ms"}]}, "no LED D9 in the circuit .LEDs: D1"),
        ({"assertions": [{"led": "D1", "at": "1ms", "is": "dim"}]}, "must be on or off"),
        ({"assertions": [{"pin": "PB4", "level": "medium", "at": "1ms"}]}, "level must be high or low"),
        ({"assertions": [{"pin": "PB7", "level": "high", "at": "1ms"}]}, "use PB0-PB5"),
        ({"assertions": [{"pin": "PB4", "level": "high"}]}, "say when"),
        ({"assertions": [{"pin": "PB4", "level": "high", "within": "5ms"}]}, "within needs after"),
        ({"assertions": [{"pin": "PB4", "level": "high", "at": "900ms"}]}, "raise duration"),
        ({"duration": "10s"}, "duration must be between"),
        ({"clock_hz": 0}, "clock_hz must be between"),
        ({"initial": {"SW9": "closed"}}, "no switch SW9"),
        ({"initial": {"SW1": "pushed"}}, "open or closed"),
    ):
        with pytest.raises(ToolError, match=message):
            run(tb, path, "button_poll", **kw)
    with pytest.raises(ToolError, match="does not exist"):
        tb.call("simulate_firmware", {"path": path, "firmware": str(tmp_path / "missing.hex")})
    (tmp_path / "junk.hex").write_text("not hex")
    with pytest.raises(ToolError, match="not an Intel HEX record"):
        tb.call("simulate_firmware", {"path": path, "firmware": str(tmp_path / "junk.hex")})
    with pytest.raises(ToolError, match="there is no U9"):
        run(tb, path, "button_poll", reference="U9")


@needs_kicad_cli
@needs_symbols
def test_initial_switch_state_and_a_toggle(tmp_path):
    tb, path = circuit(tmp_path)
    result = run(tb, path, "button_poll", initial={"SW1": "closed"}, stimuli=[{"at": "20ms", "toggle": "SW1"}], assertions=[
        {"led": "D1", "is": "on", "at": "10ms"}, {"led": "D1", "is": "off", "at": "30ms"}])
    assert verdicts(result) == [True, True]


@needs_kicad_cli
@needs_symbols
def test_only_simulable_mcus_are_accepted(tmp_path):
    tb = Toolbox(roots=[str(tmp_path)])
    path = str(tmp_path / "stm.kicad_sch")
    tb.call("create_schematic", {"path": path})
    tb.call("edit_schematic", {"path": path, "operations": [{"op": "add_symbol", "lib_id": "MCU_ST_STM32F1:STM32F103C8Tx", "x": 127, "y": 88.9, "reference": "U1", "value": "STM32F103C8Tx"}]})
    with pytest.raises(ToolError, match="no MCU with a firmware simulator.*the ATtiny25/45/85 and the classic ESP32"):
        tb.call("simulate_firmware", {"path": path, "firmware": path})


def divider(tmp_path, name="adc"):
    """A 100k/47k divider from a VBAT net to ADC3 (PB3, the BTN net with its switch to ground)."""
    return circuit(tmp_path, [
        {"op": "add_symbol", "lib_id": "Device:R", "x": 38.1, "y": 38.1, "reference": "R4", "value": "100k"},
        {"op": "add_symbol", "lib_id": "Device:R", "x": 38.1, "y": 63.5, "reference": "R5", "value": "47k"},
        {"op": "connect_pin_to_net", "pin": "R4:1", "net": "VBAT", "kind": "label"}, {"op": "connect_pin_to_net", "pin": "R4:2", "net": "BTN", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "R5:1", "net": "BTN", "kind": "label"}, {"op": "connect_pin_to_net", "pin": "R5:2", "net": "GND", "kind": "power"}], name=name)


@needs_kicad_cli
@needs_symbols
def test_a_battery_monitor_follows_the_divider_the_adc_sees(tmp_path):
    tb, path = divider(tmp_path)
    result = run(tb, path, "adc_threshold", duration="100ms", stimuli=[
        {"at": "10ms", "drive": "VBAT", "level": 7.4, "name": "weak"}, {"at": "30ms", "drive": "VBAT", "level": 9.0, "name": "full"},
        {"at": "60ms", "press": "SW1", "name": "short"}], assertions=[
        {"net": "BTN", "min": 2.3, "max": 2.4, "at": "20ms", "name": "7.4 V through the divider is 2.37 V"},
        {"pin": "PB0", "level": "low", "at": "25ms", "name": "weak battery: LED off"},
        {"pin": "PB0", "level": "high", "after": "full", "within": "5ms", "name": "full battery: LED on within 5 ms"},
        {"pin": "PB0", "level": "low", "after": "short", "within": "5ms", "name": "the input shorted to ground reads zero"}])
    assert result["passed"] is True and verdicts(result) == [True] * 4, result["assertions"]
    assert not [h for h in result["hazards"] if h["severity"] != "info"]


@needs_kicad_cli
@needs_symbols
def test_the_adc_on_an_unconnected_input_is_a_floating_hazard(tmp_path):
    tb, path = circuit(tmp_path)  # BTN has only the open switch: it floats
    result = run(tb, path, "adc_threshold", duration="20ms", assertions=[{"pin": "PB0", "level": "high", "at": "15ms", "name": "LED on (wrong: nothing is measured)"}])
    hazard = next(h for h in result["hazards"] if h["rule"] == "floating_input")
    assert hazard["pin"] == "PB3" and result["passed"] is False


@needs_kicad_cli
@needs_symbols
def test_an_adc_interrupt_program_costs_almost_nothing(tmp_path):
    tb, path = divider(tmp_path)
    result = run(tb, path, "adc_irq", duration="200ms", stimuli=[{"at": "1ms", "drive": "VBAT", "level": 9.0}], assertions=[{"net": "BTN", "min": 2.8, "at": "100ms"}])
    assert result["passed"] is True and result["instructions"] < 10_000 and result["aborted"] is None


def pwm_led(tmp_path, name="pwm"):
    """A second LED with its resistor on PB0 (the PWM output PWMOUT)."""
    return circuit(tmp_path, [
        {"op": "add_symbol", "lib_id": "Device:R", "x": 101.6, "y": 38.1, "reference": "R6", "value": "330"},
        {"op": "add_symbol", "lib_id": "Device:LED", "x": 101.6, "y": 63.5, "reference": "D2", "value": "LED"},
        {"op": "connect_pin_to_net", "pin": "U1:5", "net": "PWMOUT", "kind": "label"}, {"op": "connect_pin_to_net", "pin": "R6:1", "net": "PWMOUT", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "R6:2", "net": "PWMLED", "kind": "label"}, {"op": "connect_pin_to_net", "pin": "D2:2", "net": "PWMLED", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "D2:1", "net": "GND", "kind": "power"}], name=name)


@needs_kicad_cli
@needs_symbols
def test_fast_pwm_duty_frequency_average_voltage_and_led_brightness(tmp_path):
    tb, path = pwm_led(tmp_path)
    result = run(tb, path, "pwm_fast", duration="40ms", assertions=[
        {"pin": "PB0", "duty": 0.254, "tol": 0.005, "at": "30ms"}, {"pin": "PB0", "freq": 61.04, "tol_pct": 1, "at": "30ms"},
        {"pin": "PB1", "duty": 0.25, "tol": 0.005, "at": "30ms", "name": "OC0B is inverting"},
        {"led": "D2", "min": 0.24, "max": 0.27, "at": "30ms", "name": "the LED is lit a quarter of the time"},
        {"net": "PWMOUT", "min": 1.2, "max": 1.35, "at": "30ms", "name": "the average voltage is a quarter of 5 V"},
        {"led": "D2", "is": "on", "at": "30ms", "name": "on (wrong: it is dimmed)"},
        {"pin": "PB0", "level": "high", "at": "30ms", "name": "high (wrong: it is PWM)"},
        {"pin": "PB0", "duty": 0.254, "tol": 0.005, "at": "5ms", "name": "before the first wrap the old compare value is still in effect (wrong)"}])
    assert verdicts(result) == [True] * 5 + [False, False, False], result["assertions"]
    assert "dim 25%" in result["assertions"][5]["reason"] and "pwm 25% at 61 Hz" in result["assertions"][6]["reason"]
    assert result["timeline"][-1]["pwm"]["PB0"]["duty"] == pytest.approx(0.2539, abs=1e-4) and "pwm 25% 61Hz" in result["timeline"][-1]["pins"]["PB0"]


@needs_kicad_cli
@needs_symbols
def test_phase_correct_and_toggle_waveforms(tmp_path):
    tb, path = pwm_led(tmp_path)
    pc = run(tb, path, "pwm_pc", duration="10ms", assertions=[{"pin": "PB0", "duty": 0.502, "tol": 0.003, "at": "5ms"}, {"pin": "PB0", "freq": 245.1, "tol_pct": 1, "at": "5ms"},
                                                           {"led": "D2", "min": 0.49, "max": 0.51, "at": "5ms"}])
    assert verdicts(pc) == [True] * 3
    toggle = run(tb, path, "pwm_ctc_toggle", duration="10ms", assertions=[{"pin": "PB0", "duty": 0.5, "tol": 0.001, "at": "5ms"}, {"pin": "PB0", "freq": 62.5, "tol_pct": 0.1, "at": "5ms"}])
    assert verdicts(toggle) == [True] * 2


@needs_kicad_cli
@needs_symbols
def test_a_fade_brightens_over_time_with_the_overflow_interrupt(tmp_path):
    tb, path = pwm_led(tmp_path)
    result = run(tb, path, "pwm_fade", duration="600ms", assertions=[
        {"led": "D2", "max": 0.03, "at": "3ms", "name": "dark at the start"},
        {"led": "D2", "min": 0.16, "max": 0.22, "at": "100ms"}, {"led": "D2", "min": 0.53, "max": 0.60, "at": "300ms"},
        {"led": "D2", "min": 0.95, "at": "580ms", "name": "full at the end"},
        {"led": "D2", "min": 0.9, "after": "0ms", "within": "600ms", "name": "it reaches 90 % brightness"}])
    assert result["passed"] is True and verdicts(result) == [True] * 5, result["assertions"]


@needs_kicad_cli
@needs_symbols
def test_the_arduino_millis_pattern_keeps_time(tmp_path):
    tb, path = circuit(tmp_path, [{"op": "connect_pin_to_net", "pin": "U1:7", "net": "BLINK", "kind": "label"}])
    result = run(tb, path, "millis_blink", duration="400ms", assertions=[
        {"pin": "PB2", "level": "low", "at": "50ms"}, {"pin": "PB2", "level": "high", "at": "120ms"}, {"pin": "PB2", "level": "low", "at": "220ms"}, {"pin": "PB2", "level": "high", "at": "310ms"}])
    assert verdicts(result) == [True] * 4, result["assertions"]


@needs_kicad_cli
@needs_symbols
def test_pwm_assertion_arguments(tmp_path):
    tb, path = pwm_led(tmp_path)
    with pytest.raises(ToolError, match="use pin"):
        run(tb, path, "pwm_fast", assertions=[{"net": "PWMOUT", "duty": 0.5, "at": "1ms"}])
    with pytest.raises(ToolError, match="on or off .or give min/max"):
        run(tb, path, "pwm_fast", assertions=[{"led": "D2", "is": "dim", "at": "1ms"}])
    steady = run(tb, path, "button_poll", duration="10ms", assertions=[{"pin": "PB4", "duty": 0.0, "at": "5ms", "name": "a steady low pin has duty 0"}, {"pin": "PB4", "freq": 100, "at": "5ms"}])
    assert verdicts(steady) == [True, False]  # a steady pin has no frequency


# ---- the rest of the ATtiny85 on the board --------------------------------------------------
def with_reset_button(tmp_path, name="board"):
    return circuit(tmp_path, [
        {"op": "add_symbol", "lib_id": "Device:R", "x": 101.6, "y": 38.1, "reference": "R6", "value": "330"},
        {"op": "add_symbol", "lib_id": "Device:LED", "x": 101.6, "y": 63.5, "reference": "D2", "value": "LED"},
        {"op": "connect_pin_to_net", "pin": "U1:5", "net": "PWMOUT", "kind": "label"}, {"op": "connect_pin_to_net", "pin": "R6:1", "net": "PWMOUT", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "R6:2", "net": "PWMLED", "kind": "label"}, {"op": "connect_pin_to_net", "pin": "D2:2", "net": "PWMLED", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "D2:1", "net": "GND", "kind": "power"},
        {"op": "add_symbol", "lib_id": "Switch:SW_Push", "x": 38.1, "y": 88.9, "reference": "SW2", "value": "RESET"},
        {"op": "connect_pin_to_net", "pin": "SW2:1", "net": "RST", "kind": "label"}, {"op": "connect_pin_to_net", "pin": "SW2:2", "net": "GND", "kind": "power"}], name=name)


@needs_kicad_cli
@needs_symbols
def test_a_reset_button_restarts_the_program_after_the_startup_delay(tmp_path):
    tb, path = with_reset_button(tmp_path)
    result = run(tb, path, "reset_boots", duration="300ms", stimuli=[{"at": "30ms", "press": "SW2", "name": "reset"}, {"at": "50ms", "release": "SW2", "name": "let go"}],
                 assertions=[{"led": "D2", "is": "on", "at": "20ms", "name": "running"},
                             {"reset": "external", "after": "reset", "within": "1ms"},
                             {"led": "D2", "is": "on", "after": "reset", "within": "1ms", "name": "on (wrong: the reset made every pin an input)"},
                             {"led": "D2", "is": "off", "from": "35ms", "to": "50ms", "name": "held in reset"},
                             {"net": "RST", "max": 0.5, "at": "40ms"}, {"net": "RST", "min": 4.0, "at": "60ms"},
                             {"led": "D2", "is": "off", "at": "100ms", "name": "still starting: the 64 ms delay"},
                             {"led": "D2", "is": "on", "at": "120ms", "name": "restarted"},
                             {"resets": 1, "at": "300ms"}])
    assert verdicts(result) == [True, True, False, True, True, True, True, True, True], result["assertions"]
    assert result["resets"] == [{"t": pytest.approx(0.03, abs=1e-4), "cause": "external"}]
    # a 4 ms start-up fuse setting restarts much earlier than the default 64 ms
    quick = run(tb, path, "reset_boots", duration="120ms", startup_ms=4, stimuli=[{"at": "30ms", "press": "SW2"}, {"at": "50ms", "release": "SW2"}],
                assertions=[{"led": "D2", "is": "on", "at": "60ms"}])
    assert quick["passed"] is True


@needs_kicad_cli
@needs_symbols
def test_rstdisbl_turns_the_reset_pin_into_a_gpio(tmp_path):
    tb, path = with_reset_button(tmp_path)
    result = run(tb, path, "reset_boots", duration="100ms", rstdisbl=True, stimuli=[{"at": "30ms", "press": "SW2"}], assertions=[{"resets": 0, "at": "90ms"}])
    assert result["passed"] is True and result["resets"] == []


@needs_kicad_cli
@needs_symbols
def test_a_watchdog_resets_a_firmware_that_does_not_feed_it(tmp_path):
    tb, path = pwm_led(tmp_path)
    result = run(tb, path, "wdt_reset", duration="400ms", assertions=[
        {"reset": "watchdog", "after": "0ms", "within": "20ms", "name": "the first reset comes after 16 ms"},
        {"reset": "external", "from": "0ms", "to": "400ms", "name": "no external reset (wrong: it is a watchdog reset)"},
        {"resets": 5, "at": "400ms"}, {"led": "D2", "is": "on", "at": "5ms"}, {"led": "D2", "is": "off", "at": "30ms", "name": "dark while the chip restarts"},
        {"led": "D2", "is": "on", "at": "90ms"}])
    assert verdicts(result) == [True, False, True, True, True, True], result["assertions"]
    info = next(h for h in result["hazards"] if h["rule"] == "resets")
    assert "5 time(s)" in info["message"] and "watchdog at 16.0 ms" in info["message"] and "64 ms" in info["message"]
    fed = run(tb, path, "wdt_fed", duration="300ms", assertions=[{"resets": 0, "at": "300ms"}])
    assert fed["passed"] is True


@needs_kicad_cli
@needs_symbols
def test_eeprom_state_is_judged_and_persists_across_resets(tmp_path):
    tb, path = pwm_led(tmp_path)
    result = run(tb, path, "eeprom_counter", duration="300ms", assertions=[
        {"eeprom": 0, "is": 255, "at": "1ms", "name": "erased at the start"}, {"eeprom": 0, "is": 1, "at": "10ms"}, {"eeprom": 0, "is": 3, "at": "250ms"},
        {"eeprom": 0, "is": 2, "at": "250ms", "name": "2 (wrong)"}, {"resets": 2, "at": "300ms"}, {"led": "D2", "is": "on", "at": "250ms", "name": "done: PB0 high"}])
    assert verdicts(result) == [True, True, True, False, True, True], result["assertions"]
    assert "held 3 (0x03)" in result["assertions"][3]["reason"] and result["eeprom"]["changed"] == {0: 3} and len(result["eeprom"]["writes"]) == 3
    seeded = run(tb, path, "eeprom_counter", duration="100ms", eeprom={"0": 7}, assertions=[{"eeprom": 0, "is": 8, "at": "20ms"}, {"resets": 0, "at": "100ms"}])
    assert seeded["passed"] is True  # the counter started at 7: no restart
    with pytest.raises(ToolError, match="outside the device's 512 bytes"):
        run(tb, path, "eeprom_counter", assertions=[{"eeprom": 600, "is": 1, "at": "10ms"}])
    with pytest.raises(ToolError, match="address 700 is outside"):
        run(tb, path, "eeprom_counter", eeprom={"700": 1})


@needs_kicad_cli
@needs_symbols
def test_eeprom_contents_come_from_an_elf_file(tmp_path):
    import shutil

    tb, path = pwm_led(tmp_path)
    shutil.copy(os.path.join(FIX, "eeprom_initial.elf"), tmp_path / "eeprom_initial.elf")
    result = tb.call("simulate_firmware", {"path": path, "firmware": str(tmp_path / "eeprom_initial.elf"), "duration": "5ms",
                                           "assertions": [{"led": "D2", "is": "on", "at": "4ms"}, {"eeprom": 1, "is": 0x34, "at": "1ms"}]})
    assert result["passed"] is True


@needs_kicad_cli
@needs_symbols
def test_watchdog_interrupt_wakes_a_power_down_chip(tmp_path):
    tb, path = pwm_led(tmp_path)
    result = run(tb, path, "wdt_interrupt", duration="1100ms", assertions=[
        {"led": "D2", "is": "off", "at": "200ms"}, {"led": "D2", "is": "on", "at": "300ms"}, {"led": "D2", "is": "off", "at": "600ms"}, {"resets": 0, "at": "1100ms"}])
    assert result["passed"] is True and result["instructions"] < 300  # asleep between the wake-ups


@needs_kicad_cli
@needs_symbols
def test_timer1_pwm_and_the_complementary_pair_on_the_board(tmp_path):
    tb, path = pwm_led(tmp_path)
    result = run(tb, path, "timer1_pwm", duration="20ms", assertions=[
        {"pin": "PB1", "duty": 0.25, "tol": 0.002, "at": "10ms"}, {"pin": "PB1", "freq": 20000, "tol_pct": 1, "at": "10ms"}, {"pin": "PB4", "duty": 0.5, "tol": 0.002, "at": "10ms"}])
    assert verdicts(result) == [True] * 3
    pair = run(tb, path, "timer1_complementary", duration="20ms", clock_hz=8_000_000, assertions=[
        {"pin": "PB1", "duty": 0.248, "tol": 0.002, "at": "10ms"}, {"led": "D2", "min": 0.74, "max": 0.76, "at": "10ms", "name": "the LED on /OC1A is lit 75 % of the time"}])
    assert verdicts(pair) == [True, True], pair["assertions"]


@needs_kicad_cli
@needs_symbols
def test_timer1_interrupts_on_the_board(tmp_path):
    tb, path = pwm_led(tmp_path)
    result = run(tb, path, "timer1_ctc", duration="60ms", assertions=[
        {"pin": "PB0", "level": "low", "at": "2ms"}, {"pin": "PB0", "level": "high", "at": "5ms"}, {"pin": "PB0", "level": "high", "at": "10ms"},
        {"pin": "PB0", "level": "low", "at": "14ms"}, {"pin": "PB0", "level": "high", "at": "22ms"}])  # toggles at 3.9 ms, then every 8 ms
    assert result["passed"] is True, result["assertions"]
    ovf = run(tb, path, "timer1_ovf", duration="100ms", assertions=[{"pin": "PB1", "freq": 30.5, "tol_pct": 1, "at": "50ms"}])
    assert ovf["passed"] is True


def comparator_circuit(tmp_path):
    return circuit(tmp_path, [{"op": "connect_pin_to_net", "pin": "U1:5", "net": "AIN0", "kind": "label"}, {"op": "connect_pin_to_net", "pin": "U1:6", "net": "AIN1", "kind": "label"}])


@needs_kicad_cli
@needs_symbols
def test_the_analog_comparator_follows_the_nets_and_interrupts_on_a_rising_output(tmp_path):
    tb, path = comparator_circuit(tmp_path)
    result = run(tb, path, "comparator_irq", duration="60ms", stimuli=[
        {"at": "0ms", "drive": "AIN1", "level": 3.0}, {"at": "0ms", "drive": "AIN0", "level": 2.0},
        {"at": "10ms", "drive": "AIN0", "level": 4.0, "name": "rise"}, {"at": "20ms", "drive": "AIN0", "level": 1.0, "name": "fall"},
        {"at": "30ms", "drive": "AIN0", "level": 4.0, "name": "rise again"}],
        assertions=[{"led": "D1", "is": "off", "at": "9ms"}, {"led": "D1", "is": "on", "after": "rise", "within": "1ms"}, {"led": "D1", "is": "on", "from": "11ms", "to": "29ms", "name": "a fall does nothing"},
                    {"led": "D1", "is": "off", "after": "rise again", "within": "1ms"}])
    assert result["passed"] is True and verdicts(result) == [True] * 4, result["assertions"]
    assert not [h for h in result["hazards"] if h["rule"] == "floating_input"]
    floating = run(tb, path, "comparator_irq", duration="20ms", assertions=[{"led": "D1", "is": "off", "at": "10ms"}])
    assert {h["pin"] for h in floating["hazards"] if h["rule"] == "floating_input"} == {"PB0", "PB1"}  # nothing drives the comparator inputs


@needs_kicad_cli
@needs_symbols
def test_the_comparator_bandgap_reference_and_didr0(tmp_path):
    tb, path = comparator_circuit(tmp_path)
    result = run(tb, path, "comparator_poll", duration="40ms", stimuli=[{"at": "0ms", "drive": "AIN1", "level": 0.8}, {"at": "20ms", "drive": "AIN1", "level": 1.5}],
                 assertions=[{"led": "D1", "is": "on", "at": "10ms", "name": "AIN1 below 1.1 V"}, {"led": "D1", "is": "off", "at": "30ms", "name": "AIN1 above 1.1 V"}])
    assert result["passed"] is True
    buffered = run(tb, path, "didr_pullup", duration="10ms", assertions=[{"led": "D1", "is": "off", "at": "5ms"}])
    assert buffered["passed"] is True  # the buffer is off: PB3 reads zero although the pull-up is on


@needs_kicad_cli
@needs_symbols
def test_usi_spi_transfers_are_logged_and_judged(tmp_path):
    tb, path = circuit(tmp_path, [{"op": "connect_pin_to_net", "pin": "U1:7", "net": "USCK", "kind": "label"}])
    result = run(tb, path, "usi_spi_master", duration="5ms", usi_input=[0x12, 0x34], assertions=[
        {"usi": "tx", "nth": 1, "is": 0xA5, "by": "5ms"}, {"usi": "rx", "nth": 2, "is": 0x34, "by": "5ms"}, {"usi": "tx", "nth": 2, "is": 0x3C, "by": "5ms"},
        {"usi": "tx", "nth": 3, "is": 0, "by": "5ms", "name": "a third transfer (wrong: there are two)"}, {"usi": "rx", "nth": 1, "is": 0x99, "by": "5ms", "name": "wrong byte"}])
    assert verdicts(result) == [True, True, True, False, False], result["assertions"]
    assert "only 2 USI transfer(s)" in result["assertions"][3]["reason"] and "was 0x12, expected 0x99" in result["assertions"][4]["reason"]
    assert [(x["tx"], x["rx"]) for x in result["usi_transfers"]] == [(0xA5, 0x12), (0x3C, 0x34)]
    with pytest.raises(ToolError, match="usi must be tx or rx"):
        run(tb, path, "usi_spi_master", usi_input=[1], assertions=[{"usi": "bits", "is": 1, "by": "1ms"}])


@needs_kicad_cli
@needs_symbols
def test_an_attiny25_gets_its_own_memory_sizes(tmp_path):
    tb = Toolbox(roots=[str(tmp_path)])
    path = str(tmp_path / "t25.kicad_sch")
    tb.call("create_schematic", {"path": path})
    tb.call("edit_schematic", {"path": path, "operations": [
        {"op": "add_symbol", "lib_id": "MCU_Microchip_ATtiny:ATtiny25-20S", "x": 127, "y": 88.9, "reference": "U1", "value": "ATtiny25-20S"},
        {"op": "connect_pin_to_net", "pin": "U1:8", "net": "+5V", "kind": "power"}, {"op": "connect_pin_to_net", "pin": "U1:4", "net": "GND", "kind": "power"}]})
    import shutil

    shutil.copy(os.path.join(FIX, "button_poll_t25.hex"), tmp_path / "button_poll_t25.hex")
    result = tb.call("simulate_firmware", {"path": path, "firmware": str(tmp_path / "button_poll_t25.hex"), "duration": "5ms", "assertions": [{"pin": "PB4", "level": "low", "at": "4ms"}]})
    assert result["device"] == "attiny25" and result["passed"] is True
    shutil.copy(os.path.join(FIX, "button_poll.hex"), tmp_path / "button_poll.hex")  # built for the ATtiny85: its stack starts above an ATtiny25's RAM
    crashed = tb.call("simulate_firmware", {"path": path, "firmware": str(tmp_path / "button_poll.hex"), "duration": "5ms", "assertions": [{"pin": "PB4", "level": "low", "at": "4ms"}]})
    assert crashed["aborted"]["what"] == "fault" and "outside the attiny25's memory" in crashed["aborted"]["reason"] and crashed["passed"] is None


@needs_kicad_cli
@needs_symbols
def test_the_scenario_file_is_saved_loaded_and_overridden(tmp_path):
    import json
    import shutil

    tb, path = circuit(tmp_path)
    shutil.copy(os.path.join(FIX, "button_poll.hex"), tmp_path / "button_poll.hex")
    spec = tmp_path / "board.fw.json"
    assertions = [{"led": "D1", "is": "off", "at": "20ms"}, {"led": "D1", "is": "on", "after": "press", "within": "1ms"}]
    saved = tb.call("simulate_firmware", {"path": path, "firmware": str(tmp_path / "button_poll.hex"), "duration": "60ms", "stimuli": PRESS[:1], "assertions": assertions, "save_scenario": True})
    assert saved["passed"] is True and saved["scenario"] == {"path": str(spec), "loaded": [], "saved": True}
    on_disk = json.loads(spec.read_text())
    assert on_disk["firmware"] == "button_poll.hex" and on_disk["assertions"] == assertions and on_disk["duration"] == "60ms"
    again = tb.call("simulate_firmware", {"path": path})
    assert again["passed"] is True and again["scenario"]["loaded"] == ["assertions", "duration", "firmware", "stimuli"] and again["scenario"]["saved"] is False
    changed = tb.call("simulate_firmware", {"path": path, "assertions": [{"led": "D1", "is": "on", "at": "20ms"}]})
    assert changed["passed"] is False  # the call's assertions replace the file's
    spec.write_text("{not json")
    with pytest.raises(ToolError, match="not valid JSON"):
        tb.call("simulate_firmware", {"path": path})
    spec.write_text('{"firmwares": []}')
    with pytest.raises(ToolError, match="unknown key.*firmwares"):
        tb.call("simulate_firmware", {"path": path})
    spec.unlink()
    with pytest.raises(ToolError, match="give firmware"):
        tb.call("simulate_firmware", {"path": path})
    with pytest.raises(ToolError, match="give assertions"):
        tb.call("simulate_firmware", {"path": path, "firmware": str(tmp_path / "button_poll.hex"), "save_scenario": True})
