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
    adc = run(tb, path, "uses_adc", duration="10ms", assertions=[{"led": "D1", "is": "off", "at": "5ms", "name": "after the ADC use"}])
    assert adc["aborted"]["what"] == "ADC" and "the ADC is not simulated" in adc["aborted"]["reason"]
    assert adc["assertions"][0]["passed"] is None and "cannot verify" in adc["assertions"][0]["reason"] and adc["passed"] is None
    pwm = run(tb, path, "uses_pwm", duration="10ms", assertions=[{"pin": "PB0", "level": "low", "at": "5ms"}])
    assert pwm["aborted"]["what"] == "Timer0" and "PWM mode" in pwm["aborted"]["reason"] and pwm["passed"] is None


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
        ({"stimuli": [{"at": "1ms", "drive": "BTN", "level": "dim"}]}, "level: high, low or release"),
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
    path = str(tmp_path / "esp.kicad_sch")
    tb.call("create_schematic", {"path": path})
    tb.call("edit_schematic", {"path": path, "operations": [{"op": "add_symbol", "lib_id": "RF_Module:ESP32-WROOM-32", "x": 127, "y": 88.9, "reference": "U1", "value": "ESP32-WROOM-32"}]})
    with pytest.raises(ToolError, match="no MCU with a firmware simulator.*only the ATtiny25/45/85"):
        tb.call("simulate_firmware", {"path": path, "firmware": path})
