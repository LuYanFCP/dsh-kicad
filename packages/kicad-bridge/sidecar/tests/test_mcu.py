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
    assert tb.call("check_mcu", {"path": path}) == {"path": path, "mcus": [], "requirements": [], "passed": None, "providers": ["attiny85", "esp32"]}


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
    assert entry["provider"] == "attiny85" and entry["status"] == "checked" and set(result["providers"]) == {"attiny85", "esp32"}
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
    assert out[3]["reason"] == "GPIO1 — adc: it has no ADC" and out[5]["reason"] == "GPIO4 — i2c_sda: it cannot do i2c_sda"
    with pytest.raises(ToolError, match="unknown capability 'warp'.*i2c_sda"):
        tb.call("check_mcu", {"path": path, "requirements": [{"net": "SDA", "needs": "warp"}]})


def test_other_avr_parts_are_not_covered(tmp_path):
    tb, path = build(tmp_path, lib="MCU_Microchip_ATmega:ATmega328P-A", value="ATmega328P", base=False)
    entry = tb.call("check_mcu", {"path": path})["mcus"][0]
    assert entry["status"] == "cannot_verify" and "8-pin ATtiny25/45/85" in entry["reason"]


def test_the_usb_attiny_design_of_the_evals_is_clean(tmp_path):
    import os, shutil
    from conftest import FIXTURES

    shutil.copytree(os.path.join(FIXTURES, "usb_attiny"), tmp_path / "u")
    result = Toolbox(roots=[str(tmp_path)]).call("check_mcu", {"path": str(tmp_path / "u" / "usb_attiny.kicad_sch")})
    assert [(m["reference"], m["provider"], m["errors"], m["warnings"]) for m in result["mcus"]] == [("U1", "attiny85", 0, 0)] and result["passed"] is True
