import json

import pytest

from dsh_kicad_sidecar import mcu
from dsh_kicad_sidecar.mcu import Circuit, McuError
from dsh_kicad_sidecar.tools import ToolError, Toolbox

from conftest import needs_kicad_cli, needs_symbols

pytestmark = [needs_kicad_cli, needs_symbols]

# WROOM-32 pins: 1 GND, 2 VDD, 3 EN, 6 IO34, 8 IO32, 10 IO25, 14 IO12, 21 SDO/SD0, 24 IO2, 25 IO0


def build(tmp_path, extra=(), lib="RF_Module:ESP32-WROOM-32", value="ESP32-WROOM-32", base=True, name="board"):
    tb = Toolbox(roots=[str(tmp_path)])
    path = str(tmp_path / f"{name}.kicad_sch")
    tb.call("create_schematic", {"path": path})
    ops = [{"op": "add_symbol", "lib_id": lib, "x": 127, "y": 88.9, "reference": "U1", "value": value}]
    if base:
        ops += [
            {"op": "add_symbol", "lib_id": "Device:R", "x": 76.2, "y": 50.8, "reference": "R1", "value": "10k"},
            {"op": "add_symbol", "lib_id": "Device:C", "x": 63.5, "y": 50.8, "reference": "C1", "value": "1u"},
            {"op": "add_symbol", "lib_id": "Device:C", "x": 50.8, "y": 25.4, "reference": "C2", "value": "22u"},
            {"op": "connect_pin_to_net", "pin": "U1:2", "net": "+3V3", "kind": "power"},
            {"op": "connect_pin_to_net", "pin": "U1:1", "net": "GND", "kind": "power"},
            {"op": "connect_pin_to_net", "pin": "R1:1", "net": "+3V3", "kind": "power"},
            {"op": "connect_pin_to_net", "pin": "R1:2", "net": "EN", "kind": "label"},
            {"op": "connect_pin_to_net", "pin": "U1:3", "net": "EN", "kind": "label"},
            {"op": "connect_pin_to_net", "pin": "C1:1", "net": "EN", "kind": "label"},
            {"op": "connect_pin_to_net", "pin": "C1:2", "net": "GND", "kind": "power"},
            {"op": "connect_pin_to_net", "pin": "C2:1", "net": "+3V3", "kind": "power"},
            {"op": "connect_pin_to_net", "pin": "C2:2", "net": "GND", "kind": "power"},
        ]
    tb.call("edit_schematic", {"path": path, "operations": [*ops, *extra]})
    return tb, path


def rules(result, ref="U1"):
    mcu_ = next(m for m in result["mcus"] if m["reference"] == ref)
    return {(f["rule"], f["gpio"]): f for f in mcu_["findings"]}


def test_a_sound_wiring_has_no_errors_or_warnings(tmp_path):
    tb, path = build(tmp_path)
    result = tb.call("check_mcu", {"path": path})
    entry = result["mcus"][0]
    assert (entry["status"], entry["provider"], entry["errors"], entry["warnings"]) == ("checked", "esp32", 0, 0)
    assert result["passed"] is True


def test_gpio12_high_at_reset_is_an_error_whether_tied_or_pulled(tmp_path):
    tied = build(tmp_path / "a", [{"op": "connect_pin_to_net", "pin": "U1:14", "net": "+3V3", "kind": "power"}])
    f = rules(tied[0].call("check_mcu", {"path": tied[1]}))[("strapping_level", 12)]
    assert f["severity"] == "error" and "1.8 V flash" in f["message"] and f["net"] == "+3V3"
    for ohms, severity in (("10k", "error"), ("100k", "warning")):
        tb, path = build(tmp_path / ohms, [
            {"op": "add_symbol", "lib_id": "Device:R", "x": 152.4, "y": 63.5, "reference": "R2", "value": ohms},
            {"op": "connect_pin_to_net", "pin": "R2:1", "net": "+3V3", "kind": "power"},
            {"op": "connect_pin_to_net", "pin": "R2:2", "net": "MTDI", "kind": "label"},
            {"op": "connect_pin_to_net", "pin": "U1:14", "net": "MTDI", "kind": "label"}])
        f = rules(tb.call("check_mcu", {"path": path}))[("strapping_level", 12)]
        assert f["severity"] == severity and "R2" in f["message"]


def test_gpio0_to_ground_is_an_error_but_a_boot_button_is_fine(tmp_path):
    tb, path = build(tmp_path / "tied", [{"op": "connect_pin_to_net", "pin": "U1:25", "net": "GND", "kind": "power"}])
    assert rules(tb.call("check_mcu", {"path": path}))[("strapping_level", 0)]["severity"] == "error"
    tb, path = build(tmp_path / "button", [
        {"op": "add_symbol", "lib_id": "Switch:SW_Push", "x": 152.4, "y": 63.5, "reference": "SW1", "value": "BOOT"},
        {"op": "connect_pin_to_net", "pin": "SW1:1", "net": "IO0", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "SW1:2", "net": "GND", "kind": "power"},
        {"op": "connect_pin_to_net", "pin": "U1:25", "net": "IO0", "kind": "label"}])
    result = tb.call("check_mcu", {"path": path})
    f = rules(result)[("strapping_pin", 0)]
    assert f["severity"] == "info" and result["passed"] is True


def test_reserved_flash_pins_must_stay_unconnected(tmp_path):
    tb, path = build(tmp_path, [{"op": "connect_pin_to_net", "pin": "U1:21", "net": "SPARE", "kind": "label"},
                                {"op": "add_symbol", "lib_id": "Device:R", "x": 152.4, "y": 63.5, "reference": "R3", "value": "1k"},
                                {"op": "connect_pin_to_net", "pin": "R3:1", "net": "SPARE", "kind": "label"}])
    result = tb.call("check_mcu", {"path": path})
    f = rules(result)[("reserved_pin_used", 7)]
    assert f["severity"] == "error" and "SPI flash" in f["message"] and result["passed"] is False


def test_enable_pin_rules(tmp_path):
    tb, path = build(tmp_path / "open", base=False)
    result = tb.call("check_mcu", {"path": path})
    assert rules(result)[("enable_unconnected", None)]["severity"] == "error"
    tb, path = build(tmp_path / "nopull", [
        {"op": "add_symbol", "lib_id": "Device:C", "x": 63.5, "y": 25.4, "reference": "C5", "value": "1u"},
        {"op": "connect_pin_to_net", "pin": "U1:3", "net": "EN", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "C5:1", "net": "EN", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "C5:2", "net": "GND", "kind": "power"},
        {"op": "connect_pin_to_net", "pin": "U1:2", "net": "+3V3", "kind": "power"}], base=False, name="nopull")
    found = rules(tb.call("check_mcu", {"path": path}))
    assert found[("enable_no_pullup", None)]["severity"] == "warning"
    assert ("supply_decoupling", None) in found  # +3V3 has no bulk capacitor in this variant


def test_input_only_pins(tmp_path):
    tb, path = build(tmp_path, [
        {"op": "add_symbol", "lib_id": "Switch:SW_Push", "x": 152.4, "y": 63.5, "reference": "SW1", "value": "KEY"},
        {"op": "connect_pin_to_net", "pin": "SW1:1", "net": "KEY", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "SW1:2", "net": "GND", "kind": "power"},
        {"op": "connect_pin_to_net", "pin": "U1:6", "net": "KEY", "kind": "label"}])
    f = rules(tb.call("check_mcu", {"path": path}))[("input_only_no_pull", 34)]
    assert f["severity"] == "warning" and "no internal pull-up" in f["message"]


def test_requirements_are_judged_against_the_gpio_a_signal_sits_on(tmp_path):
    tb, path = build(tmp_path, [
        {"op": "connect_pin_to_net", "pin": "U1:6", "net": "VBAT_SENSE", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "U1:10", "net": "AUDIO", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "U1:24", "net": "LED", "kind": "label"},
        {"op": "add_symbol", "lib_id": "Device:R", "x": 152.4, "y": 63.5, "reference": "R9", "value": "1k"},
        {"op": "connect_pin_to_net", "pin": "R9:1", "net": "VBAT_SENSE", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "R9:2", "net": "GND", "kind": "power"}])
    reqs = [{"net": "VBAT_SENSE", "needs": "adc1"}, {"net": "VBAT_SENSE", "needs": "output"}, {"pin": "U1:IO25", "needs": ["output", "dac"]},
            {"net": "AUDIO", "needs": "adc1"}, {"net": "LED", "needs": "boot_free"}, {"net": "NOWHERE", "needs": "input"}]
    out = tb.call("check_mcu", {"path": path, "requirements": reqs})["requirements"]
    assert [r["passed"] for r in out] == [True, False, True, False, False, False]
    assert "input-only" in out[1]["reason"] and "ADC is adc2" in out[3]["reason"] and "ADC2 cannot be used while WiFi" in out[3]["reason"]
    assert "strapping pin" in out[4]["reason"] and "not connected to a GPIO" in out[5]["reason"]
    with pytest.raises(ToolError, match="unknown capability"):
        tb.call("check_mcu", {"path": path, "requirements": [{"net": "AUDIO", "needs": "warp"}]})
    with pytest.raises(ToolError, match="needs net"):
        tb.call("check_mcu", {"path": path, "requirements": [{"needs": "adc"}]})


def test_an_mcu_no_provider_covers_cannot_be_verified(tmp_path):
    tb, path = build(tmp_path, lib="RF_Module:ESP32-S3-WROOM-1", value="ESP32-S3-WROOM-1", base=False)
    result = tb.call("check_mcu", {"path": path, "requirements": [{"net": "X", "needs": "adc"}]})
    entry = result["mcus"][0]
    assert (entry["status"], entry["provider"]) == ("cannot_verify", None)
    assert "different strapping and reserved pins" in entry["reason"] and "ESP32 (classic" in entry["reason"]
    assert result["passed"] is None and result["requirements"][0]["passed"] is None  # not "passed", not "failed"
    stm = build(tmp_path / "stm", lib="MCU_ST_STM32F1:STM32F103C8Tx", value="STM32F103C8Tx", base=False)
    assert stm[0].call("check_mcu", {"path": stm[1]})["mcus"][0]["status"] == "cannot_verify"


def test_a_schematic_without_an_mcu_reports_nothing(tmp_path):
    tb, path = build(tmp_path, base=False, lib="Device:R", value="1k")
    assert tb.call("check_mcu", {"path": path}) == {"path": path, "mcus": [], "requirements": [], "passed": None,
                                                    "providers": ["arduino_nano", "arduino_uno", "atmega328p", "attiny85", "esp32"]}


def test_a_project_can_add_its_own_provider(tmp_path):
    (tmp_path / "attiny.mcu.json").write_text(json.dumps({
        "id": "attiny85", "name": "ATtiny85", "match": {"lib_id": ["MCU_Microchip_ATtiny:ATtiny85-*"]}, "gpio_pin_pattern": "PB(\\d)",
        "gpios": {"5": {"reserved": "RESET pin: needs the high-voltage programmer to be a GPIO"}}}))
    tb, path = build(tmp_path, [{"op": "connect_pin_to_net", "pin": "U1:1", "net": "RSTLINE", "kind": "label"},
                                {"op": "add_symbol", "lib_id": "Device:R", "x": 152.4, "y": 63.5, "reference": "R9", "value": "1k"},
                                {"op": "connect_pin_to_net", "pin": "R9:1", "net": "RSTLINE", "kind": "label"}],
                     lib="MCU_Microchip_ATtiny:ATtiny85-20S", value="ATtiny85", base=False)
    result = tb.call("check_mcu", {"path": path})
    entry = result["mcus"][0]
    assert entry["provider"] == "attiny85" and entry["status"] == "checked" and set(result["providers"]) == {"arduino_nano", "arduino_uno", "atmega328p", "attiny85", "esp32"}
    assert rules(result)[("reserved_pin_used", 5)]["severity"] == "error"  # the provider's own table was applied
    (tmp_path / "attiny.mcu.json").write_text("{nope")
    with pytest.raises(ToolError, match="attiny.mcu.json"):
        tb.call("check_mcu", {"path": path})
    (tmp_path / "attiny.mcu.json").write_text('{"id": "x"}')
    with pytest.raises(ToolError, match="provider needs name"):
        tb.call("check_mcu", {"path": path})


def test_net_classification():
    netlist = {"components": [], "nets": [
        {"name": "GND", "nodes": []}, {"name": "/sheet/AGND", "nodes": []}, {"name": "+3V3", "nodes": []}, {"name": "VCC", "nodes": []},
        {"name": "+3.3V", "nodes": []}, {"name": "3V3_ESP", "nodes": []}, {"name": "/SIG", "nodes": []},
        {"name": "/REG_OUT", "nodes": [{"ref": "U2", "pin": "2", "pin_type": "power_out"}]}]}
    c = Circuit(netlist)
    assert [c.kind(n) for n in c.nets] == ["ground", "ground", "rail", "rail", "rail", "rail", None, "rail"]


def test_a_custom_symbol_with_unknown_pin_names_is_not_called_checked(tmp_path):
    # STM32 pins are PA0..: the ESP32 provider matches by value here but cannot read any pin name.
    tb, path = build(tmp_path, lib="MCU_ST_STM32F1:STM32F103C8Tx", value="ESP32-WROOM-32", base=False)
    entry = tb.call("check_mcu", {"path": path})["mcus"][0]
    assert entry["status"] == "cannot_verify" and "none of its pin names are GPIO names it knows" in entry["reason"]


def test_not_covered_families_are_named_even_from_a_custom_library(tmp_path):
    tb, path = build(tmp_path, lib="MCU_Espressif:ESP32-C3", value="ESP32-C3-MINI", base=False)
    entry = tb.call("check_mcu", {"path": path})["mcus"][0]
    assert entry["status"] == "cannot_verify" and "RISC-V" in entry["reason"]


# ---- ATtiny85 (the second provider) ----------------------------------------------------------
# ATtiny85 pins: 1 ~RESET/PB5, 2 XTAL1/PB3, 3 XTAL2/PB4, 4 GND, 5 AREF/PB0, 6 PB1, 7 PB2, 8 VCC


def attiny(tmp_path, extra=(), reset_pullup=True, vcc_cap=True, name="avr"):
    ops = [
        {"op": "connect_pin_to_net", "pin": "U1:8", "net": "+5V", "kind": "power"},
        {"op": "connect_pin_to_net", "pin": "U1:4", "net": "GND", "kind": "power"},
    ]
    if vcc_cap:
        ops += [{"op": "add_symbol", "lib_id": "Device:C", "x": 50.8, "y": 25.4, "reference": "C1", "value": "100n"},
                {"op": "connect_pin_to_net", "pin": "C1:1", "net": "+5V", "kind": "power"},
                {"op": "connect_pin_to_net", "pin": "C1:2", "net": "GND", "kind": "power"}]
    if reset_pullup:
        ops += [{"op": "add_symbol", "lib_id": "Device:R", "x": 76.2, "y": 50.8, "reference": "R1", "value": "10k"},
                {"op": "connect_pin_to_net", "pin": "R1:1", "net": "+5V", "kind": "power"},
                {"op": "connect_pin_to_net", "pin": "R1:2", "net": "RST", "kind": "label"},
                {"op": "connect_pin_to_net", "pin": "U1:1", "net": "RST", "kind": "label"}]
    return build(tmp_path, [*ops, *extra], lib="MCU_Microchip_ATtiny:ATtiny85-20S", value="ATtiny85-20S", base=False, name=name)


def test_attiny85_sound_wiring(tmp_path):
    tb, path = attiny(tmp_path)
    result = tb.call("check_mcu", {"path": path})
    entry = result["mcus"][0]
    assert (entry["provider"], entry["errors"], entry["warnings"]) == ("attiny85", 0, 0) and result["passed"] is True


def test_attiny85_reset_and_decoupling(tmp_path):
    tb, path = attiny(tmp_path / "bare", reset_pullup=False, vcc_cap=False)
    found = rules(tb.call("check_mcu", {"path": path}))
    assert found[("enable_unconnected", None)]["severity"] == "warning" and "internal pull-up" in found[("enable_unconnected", None)]["message"]
    assert "100 nF" in found[("supply_decoupling", None)]["fix"] and found[("supply_decoupling", None)]["severity"] == "warning"
    tb, path = attiny(tmp_path / "floating", reset_pullup=False, extra=[
        {"op": "add_symbol", "lib_id": "Switch:SW_Push", "x": 76.2, "y": 50.8, "reference": "SW1", "value": "RESET"},
        {"op": "connect_pin_to_net", "pin": "SW1:1", "net": "RST", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "SW1:2", "net": "GND", "kind": "power"},
        {"op": "connect_pin_to_net", "pin": "U1:1", "net": "RST", "kind": "label"}])
    assert "relies on the weak internal pull-up" in rules(tb.call("check_mcu", {"path": path}))[("enable_no_pullup", None)]["message"]


def test_attiny85_fixed_peripherals_are_requirements_not_a_pin_matrix(tmp_path):
    tb, path = attiny(tmp_path, [
        {"op": "connect_pin_to_net", "pin": "U1:5", "net": "SDA", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "U1:7", "net": "SCL", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "U1:3", "net": "LED", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "U1:6", "net": "SENSE", "kind": "label"}])
    out = tb.call("check_mcu", {"path": path, "requirements": [
        {"net": "SDA", "needs": "i2c_sda"}, {"net": "SCL", "needs": "i2c_scl"}, {"net": "LED", "needs": "pwm"},
        {"net": "SENSE", "needs": "adc"}, {"net": "SENSE", "needs": "pwm"}, {"net": "LED", "needs": "i2c_sda"}]})["requirements"]
    assert [r["passed"] for r in out] == [True, True, True, False, True, False]
    assert out[3]["reason"] == "PB1 — adc: it has no ADC" and out[5]["reason"] == "PB4 — i2c_sda: it cannot do i2c_sda"
    with pytest.raises(ToolError, match="unknown capability 'warp'.*i2c_sda"):
        tb.call("check_mcu", {"path": path, "requirements": [{"net": "SDA", "needs": "warp"}]})


def test_other_avr_parts_are_not_covered(tmp_path):
    tb, path = build(tmp_path, lib="MCU_Microchip_ATtiny:ATtiny2313-20S", value="ATtiny2313", base=False)
    entry = tb.call("check_mcu", {"path": path})["mcus"][0]
    assert entry["status"] == "cannot_verify" and "8-pin ATtiny25/45/85" in entry["reason"]
    tb, path = build(tmp_path / "pb", lib="MCU_Microchip_ATmega:ATmega328PB-A", value="ATmega328PB", base=False)  # its own pinout
    entry = tb.call("check_mcu", {"path": path})["mcus"][0]
    assert entry["status"] == "cannot_verify" and "not the PB variants" in entry["reason"]


def test_the_usb_attiny_design_of_the_evals_is_clean(tmp_path):
    import os, shutil
    from conftest import FIXTURES

    shutil.copytree(os.path.join(FIXTURES, "usb_attiny"), tmp_path / "u")
    result = Toolbox(roots=[str(tmp_path)]).call("check_mcu", {"path": str(tmp_path / "u" / "usb_attiny.kicad_sch")})
    assert [(m["reference"], m["provider"], m["errors"], m["warnings"]) for m in result["mcus"]] == [("U1", "attiny85", 0, 0)] and result["passed"] is True


# ---- ATmega48/88/168/328 and the Arduino Nano / UNO modules -----------------------------------------------------
# ATmega328P-P (DIP-28): 1 ~RESET/PC6, 2 PD0, 4 PD2, 5 PD3, 6 PD4, 7 VCC, 8 GND, 9 XTAL1/PB6, 10 XTAL2/PB7, 12 PD6, 15 PB1, 20 AVCC,
# 21 AREF, 22 GND, 27 PC4. ATmega328P-A (TQFP-32) adds 19 ADC6 and 22 ADC7.
def part(lib, ref, value, x, y):
    return {"op": "add_symbol", "lib_id": lib, "x": x, "y": y, "reference": ref, "value": value}


def net(pin, name, kind="label"):
    return {"op": "connect_pin_to_net", "pin": pin, "net": name, "kind": kind}


def atmega(tmp_path, extra=(), avcc="+5V", crystal=True, aref_cap=True, lib="MCU_Microchip_ATmega:ATmega328P-P", vcc_pin="7", avcc_pin="20",
           aref_pin="21", xtal=("9", "10"), reset_pin="1", gnd=("8", "22"), name="mega"):
    ops = [net(f"U1:{vcc_pin}", "+5V", "power"), *[net(f"U1:{g}", "GND", "power") for g in gnd],
           part("Device:C", "C1", "100n", 50.8, 25.4), net("C1:1", "+5V", "power"), net("C1:2", "GND", "power"),
           part("Device:R", "R1", "10k", 76.2, 50.8), net("R1:1", "+5V", "power"), net("R1:2", "RST"), net(f"U1:{reset_pin}", "RST")]
    if avcc:
        ops.append(net(f"U1:{avcc_pin}", avcc, "power" if avcc.startswith("+") else "label"))
    if aref_cap:
        ops += [part("Device:C", "C2", "100n", 63.5, 25.4), net(f"U1:{aref_pin}", "AREF"), net("C2:1", "AREF"), net("C2:2", "GND", "power")]
    if crystal:
        ops += [part("Device:Crystal", "Y1", "16MHz", 101.6, 50.8), net(f"U1:{xtal[0]}", "XT1"), net(f"U1:{xtal[1]}", "XT2"), net("Y1:1", "XT1"),
                net("Y1:2", "XT2"), part("Device:C", "C3", "22p", 101.6, 63.5), part("Device:C", "C4", "22p", 114.3, 63.5),
                net("C3:1", "XT1"), net("C3:2", "GND", "power"), net("C4:1", "XT2"), net("C4:2", "GND", "power")]
    return build(tmp_path, [*ops, *extra], lib=lib, value=lib.split(":")[1], base=False, name=name)


def test_atmega328p_wired_like_an_arduino_is_clean(tmp_path):
    tb, path = atmega(tmp_path)
    result = tb.call("check_mcu", {"path": path})
    entry = result["mcus"][0]
    assert (entry["provider"], entry["errors"], entry["warnings"], entry["findings"]) == ("atmega328p", 0, 0, []) and result["passed"] is True


def test_atmega328p_avcc_must_reach_vcc(tmp_path):
    tb, path = atmega(tmp_path / "open", avcc=None)
    found = rules(tb.call("check_mcu", {"path": path}))
    f = found[("analog_supply_unconnected", None)]
    assert f["severity"] == "error" and "even when the ADC is not used" in f["message"] and ("supply_unconnected", None) not in found
    tb, path = atmega(tmp_path / "rail", avcc="+5VA")
    assert rules(tb.call("check_mcu", {"path": path}))[("analog_supply_separate", None)]["severity"] == "warning"
    tb, path = atmega(tmp_path / "lc", avcc="AVCC_F", extra=[  # the datasheet's LC filter from VCC: fine
        part("Device:L", "L1", "10u", 88.9, 25.4), net("L1:1", "+5V", "power"), net("L1:2", "AVCC_F"),
        part("Device:C", "C5", "100n", 88.9, 38.1), net("C5:1", "AVCC_F"), net("C5:2", "GND", "power")])
    entry = tb.call("check_mcu", {"path": path})["mcus"][0]
    assert (entry["errors"], entry["warnings"]) == (0, 0), entry["findings"]


def test_atmega328p_aref_and_the_crystal(tmp_path):
    tb, path = atmega(tmp_path / "aref", aref_cap=False, extra=[net("U1:21", "+5V", "power")])
    f = rules(tb.call("check_mcu", {"path": path}))[("aref_on_rail", None)]
    assert f["severity"] == "warning" and "analogReference(EXTERNAL)" in f["message"]
    tb, path = atmega(tmp_path / "nocap", aref_cap=False)
    assert rules(tb.call("check_mcu", {"path": path}))[("aref_no_capacitor", None)]["severity"] == "info"
    tb, path = atmega(tmp_path / "bare", crystal=False, extra=[
        part("Device:Crystal", "Y1", "16MHz", 101.6, 50.8), net("U1:9", "XT1"), net("U1:10", "XT2"), net("Y1:1", "XT1"), net("Y1:2", "XT2")])
    found = tb.call("check_mcu", {"path": path})["mcus"][0]["findings"]
    assert [(f["rule"], f["severity"], f["net"]) for f in found] == [("crystal_load_caps", "warning", "XT1"), ("crystal_load_caps", "warning", "XT2")]
    tb, path = atmega(tmp_path / "gpio", crystal=False, extra=[  # PB6 as a GPIO: only with the internal oscillator
        net("U1:9", "LED"), part("Device:R", "R5", "330", 101.6, 50.8), net("R5:1", "LED"), net("R5:2", "GND", "power")])
    f = rules(tb.call("check_mcu", {"path": path}))[("oscillator_pin_gpio", None)]
    assert f["severity"] == "info" and "fuses" in f["message"]


def test_atmega328p_pins_by_port_and_what_they_can_do(tmp_path):
    tb, path = atmega(tmp_path, lib="MCU_Microchip_ATmega:ATmega328P-A", vcc_pin="4", avcc_pin="18", aref_pin="20", xtal=("7", "8"), reset_pin="29",
                      gnd=("3", "5", "21"), extra=[
                          net("U1:6", "+5V", "power"),  # the second VCC pin
                          net("U1:27", "SDA"), net("U1:10", "FADE"), net("U1:32", "BTN"), net("U1:2", "LED"), net("U1:19", "KNOB"),
                          part("Switch:SW_Push", "SW1", "MODE", 152.4, 63.5), net("SW1:1", "MODE"), net("SW1:2", "GND", "power"), net("U1:22", "MODE")])
    result = tb.call("check_mcu", {"path": path, "requirements": [
        {"net": "SDA", "needs": "i2c_sda"}, {"pin": "U1:PD6", "needs": "pwm"}, {"net": "BTN", "needs": "int0"}, {"net": "LED", "needs": "pwm"},
        {"net": "KNOB", "needs": "adc"}, {"net": "KNOB", "needs": "input"}]})
    out = result["requirements"]
    assert [(r["target"], r["passed"]) for r in out] == [("SDA", True), ("U1:PD6", True), ("BTN", True), ("LED", False), ("KNOB", True), ("KNOB", False)]
    assert out[3]["reason"] == "PD4 — pwm: it cannot do pwm" and out[5]["reason"].startswith("ADC6 — input: it is an analog input only")
    f = rules(result)[("analog_only_no_pull", 31)]
    assert f["severity"] == "warning" and f["pin_name"] == "ADC7" and "digitalRead cannot read it" in f["message"]


def nano(tmp_path, extra=(), lib="MCU_Module:Arduino_Nano_v3.x", name="nano"):
    tb = Toolbox(roots=[str(tmp_path)])
    path = str(tmp_path / f"{name}.kicad_sch")
    tb.call("create_schematic", {"path": path})
    tb.call("edit_schematic", {"path": path, "operations": [part(lib, "A1", lib.split(":")[1], 127, 88.9), *extra]})
    return tb, path


def test_arduino_nano_shared_pins_and_analog_only_inputs(tmp_path):
    # Nano: 2 D0/RX, 9 D6, 12 D9, 16 D13, 18 AREF, 20 A1, 23 A4, 26 A7, 27 +5V, 29 GND
    tb, path = nano(tmp_path, [
        net("A1:2", "GPS_TX"), part("Device:R", "R1", "1k", 76.2, 50.8), net("R1:1", "GPS_TX"), net("R1:2", "GND", "power"),
        net("A1:16", "BTN"), part("Switch:SW_Push", "SW1", "B", 152.4, 63.5), net("SW1:1", "BTN"), net("SW1:2", "GND", "power"),
        net("A1:26", "MODE"), part("Switch:SW_Push", "SW2", "M", 152.4, 76.2), net("SW2:1", "MODE"), net("SW2:2", "GND", "power"),
        net("A1:18", "+5V", "power"), net("A1:27", "+5V", "power"), net("A1:29", "GND", "power"), net("A1:23", "SDA"), net("A1:12", "FADE")])
    result = tb.call("check_mcu", {"path": path, "requirements": [
        {"net": "SDA", "needs": "i2c_sda"}, {"pin": "A1:D9", "needs": "pwm"}, {"pin": "A1:A7", "needs": "pwm"}, {"pin": "A1:A1", "needs": "adc"}]})
    entry = result["mcus"][0]
    assert entry["provider"] == "arduino_nano" and entry["status"] == "checked"
    found = rules(result, "A1")
    assert found[("usb_serial_pin", 0)]["severity"] == "warning" and "GPS_TX" in found[("usb_serial_pin", 0)]["message"]
    assert found[("onboard_led_pin", 13)]["severity"] == "info" and "1.7 V" in found[("onboard_led_pin", 13)]["message"]
    assert found[("analog_only_no_pull", 21)]["message"].startswith("A7 is an analog input only")
    assert found[("aref_on_rail", None)]["severity"] == "warning"
    assert [r["passed"] for r in result["requirements"]] == [True, True, False, True]  # A1 the pin (not the module's reference) has an ADC
    assert result["requirements"][2]["reason"].startswith("A7 — pwm: it is an analog input only")


def test_arduino_uno_and_the_boards_with_other_mcus(tmp_path):
    # UNO R3: 13 SDA/A4, 23 D8, 31 SDA/A4 (the second SDA pin)
    tb, path = nano(tmp_path, [net("A1:13", "SDA"), net("A1:31", "SDA"), net("A1:23", "LED")], lib="MCU_Module:Arduino_UNO_R3", name="uno")
    result = tb.call("check_mcu", {"path": path, "requirements": [{"net": "SDA", "needs": "i2c_sda"}, {"net": "LED", "needs": "pwm"}]})
    assert result["mcus"][0]["provider"] == "arduino_uno" and result["mcus"][0]["findings"] == []
    assert [(r["pin"], r["passed"]) for r in result["requirements"]] == [("A1:13", True), ("A1:31", True), ("A1:23", False)]
    assert result["requirements"][2]["reason"] == "D8 — pwm: it cannot do pwm"
    tb, path = nano(tmp_path / "every", lib="MCU_Module:Arduino_Nano_Every", name="every")
    entry = tb.call("check_mcu", {"path": path})["mcus"][0]
    assert entry["status"] == "cannot_verify" and "ATmega4809" in entry["reason"]
