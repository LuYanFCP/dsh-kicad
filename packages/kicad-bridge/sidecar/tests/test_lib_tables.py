import os

import pytest

from dsh_kicad_sidecar.footprints import default_footprint_dirs
from dsh_kicad_sidecar.lib_tables import LibTable


def _table(path, *rows):
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("(fp_lib_table\n\t(version 7)\n" + "".join(f"\t{r}\n" for r in rows) + ")\n")


def _lib(path, *footprints):
    os.makedirs(path, exist_ok=True)
    for name in footprints:
        with open(os.path.join(path, name + ".kicad_mod"), "w", encoding="utf-8") as fh:
            fh.write(f'(footprint "{name}" (layer "F.Cu"))\n')


@pytest.fixture
def kicad_tree(tmp_path, monkeypatch):
    """A fake install (<share>/footprints + template table), a KiCad 10 user config and a project."""
    share = tmp_path / "share" / "kicad"
    stock = share / "footprints"
    _lib(str(stock / "Resistor_SMD.pretty"), "R_0603_1608Metric")
    _lib(str(stock / "Capacitor_SMD.pretty"), "C_0603_1608Metric")
    _lib(str(stock / "Unlisted.pretty"), "X")
    os.makedirs(share / "template")
    _table(share / "template" / "fp-lib-table",
           '(lib (name "Resistor_SMD") (type "KiCad") (uri "${KICAD10_FOOTPRINT_DIR}/Resistor_SMD.pretty") (options "") (descr ""))',
           '(lib (name "Capacitor_SMD") (type "KiCad") (uri "${KICAD10_FOOTPRINT_DIR}/Capacitor_SMD.pretty") (options "") (descr ""))')
    config = tmp_path / "config" / "kicad" / "10.0"
    os.makedirs(config)
    # KiCad 10's global table nests the stock one; a user library sits next to it.
    _lib(str(tmp_path / "mylibs" / "Mine.pretty"), "Logo")
    _table(config / "fp-lib-table",
           f'(lib (name "KiCad") (type "Table") (uri "{share}/template/fp-lib-table") (options "") (descr ""))',
           '(lib (name "Mine") (type "KiCad") (uri "${MYLIBS}/Mine.pretty") (options "") (descr ""))',
           '(lib (name "Off") (type "KiCad") (uri "/nowhere") (options "") (descr "") (disabled))')
    with open(config / "kicad_common.json", "w", encoding="utf-8") as fh:
        fh.write('{"environment": {"vars": {"MYLIBS": "%s"}}}' % (tmp_path / "mylibs"))
    project = tmp_path / "proj"
    _lib(str(project / "local.pretty"), "R_0603_1608Metric")
    _table(project / "fp-lib-table",
           '(lib (name "Resistor_SMD") (type "KiCad") (uri "${KIPRJMOD}/local.pretty") (options "") (descr ""))',
           '(lib (name "Broken") (type "KiCad") (uri "${KIPRJMOD}/missing.pretty") (options "") (descr ""))')
    for var in [k for k in os.environ if k.startswith("KICAD")]:
        monkeypatch.delenv(var)
    return {"stock": str(stock), "config": str(config), "project": str(project), "root": tmp_path}


def test_table_chain_resolves_like_kicad(kicad_tree):
    t = LibTable("fp", kicad_tree["project"], stock_dirs=[kicad_tree["stock"]], config_dir=kicad_tree["config"])
    assert t.major == 10
    # the project table shadows the global one, ${KIPRJMOD} is the project directory
    assert t.resolve("Resistor_SMD:R_0603_1608Metric") == os.path.join(kicad_tree["project"], "local.pretty", "R_0603_1608Metric.kicad_mod")
    # the nested stock table, with ${KICAD10_FOOTPRINT_DIR} defaulting to the installed libraries
    assert t.resolve("Capacitor_SMD:C_0603_1608Metric") == os.path.join(kicad_tree["stock"], "Capacitor_SMD.pretty", "C_0603_1608Metric.kicad_mod")
    # a variable from kicad_common.json
    assert t.resolve("Mine:Logo").endswith(os.path.join("mylibs", "Mine.pretty", "Logo.kicad_mod"))
    # a stock library that no table lists is still found, as the footprint search finds it
    assert t.resolve("Unlisted:X").endswith("X.kicad_mod")
    assert "Off" not in t.libraries()
    assert any("Broken" in p for p in t.problems)
    with pytest.raises(LookupError, match="no fp-lib-table"):
        t.resolve("Nope:Thing")
    with pytest.raises(LookupError, match="not found in library 'Capacitor_SMD'"):
        t.resolve("Capacitor_SMD:C_9999")
    with pytest.raises(LookupError, match="Library:Name"):
        t.resolve("R_0603")


def test_environment_overrides_defaults(kicad_tree, monkeypatch):
    other = kicad_tree["root"] / "other"
    _lib(str(other / "Capacitor_SMD.pretty"), "C_0603_1608Metric")
    monkeypatch.setenv("KICAD10_FOOTPRINT_DIR", str(other))
    t = LibTable("fp", None, stock_dirs=[kicad_tree["stock"]], config_dir=kicad_tree["config"])
    assert t.resolve("Capacitor_SMD:C_0603_1608Metric").startswith(str(other))


def test_symbol_tables_resolve_to_library_files(tmp_path):
    sym = tmp_path / "proj" / "parts.kicad_sym"
    os.makedirs(sym.parent)
    sym.write_text("(kicad_symbol_lib)\n")
    (tmp_path / "proj" / "sym-lib-table").write_text(
        '(sym_lib_table (version 7) (lib (name "Parts") (type "KiCad") (uri "${KIPRJMOD}/parts.kicad_sym") (options "") (descr "")))\n')
    t = LibTable("sym", str(tmp_path / "proj"), stock_dirs=[], config_dir=str(tmp_path / "none"))
    assert t.resolve("Parts:Anything") == str(sym)


@pytest.mark.skipif(not default_footprint_dirs(), reason="KiCad footprint libraries not installed")
def test_installed_libraries_resolve_the_fixture_footprints():
    here = os.path.dirname(__file__)
    netlist_ids = ["Capacitor_SMD:C_0603_1608Metric", "Connector_USB:USB_C_Receptacle_GCT_USB4125-xx-x_6P_TopMnt_Horizontal",
                   "Package_SO:SOIC-8_5.3x5.3mm_P1.27mm", "Package_TO_SOT_SMD:SOT-223-3_TabPin2",
                   "Button_Switch_SMD:SW_SPST_TL3342", "Connector_PinHeader_2.54mm:PinHeader_2x03_P2.54mm_Vertical_SMD"]
    t = LibTable("fp", os.path.join(here, "fixtures", "usb_attiny"))
    for lib_id in netlist_ids:
        assert os.path.isfile(t.resolve(lib_id)), lib_id
