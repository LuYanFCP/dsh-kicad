import glob
import os

import pytest

from dsh_kicad_sidecar.sexpr import A, L, ParseError, S, dumps, fmt_num, parse

DEMO_ROOTS = [os.environ.get("KICAD_DEMOS", "/usr/share/kicad/demos"), "/usr/share/kicad/symbols"]
FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


def kicad_files(limit=15):
    files = sorted(glob.glob(os.path.join(FIXTURES, "**", "*.kicad_sch"), recursive=True))
    for root in DEMO_ROOTS:
        for ext in ("kicad_sch", "kicad_pcb", "kicad_sym"):
            files += sorted(glob.glob(os.path.join(root, "**", f"*.{ext}"), recursive=True))[:limit]
    return files


@pytest.mark.parametrize("path", kicad_files())
def test_round_trip_is_byte_identical(path):
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    assert dumps(parse(text)) == text


def test_round_trip_preserves_odd_whitespace_and_escapes():
    text = '  (a  "x \\"q\\" \\\\ y"\n\t(b 1   2)(c)\n)\n'
    doc = parse(text)
    assert dumps(doc) == text
    assert doc.root.items[1].value == 'x "q" \\ y'


def test_new_nodes_use_kicad_layout():
    node = L("wire", L("pts", L("xy", 1.5, 2), L("xy", 3, 4)),
             L("stroke", L("width", 0), L("type", "solid")), L("uuid", S("u")))
    assert dumps(node) == (
        "(wire\n\t(pts\n\t\t(xy 1.5 2) (xy 3 4)\n\t)\n\t(stroke\n\t\t(width 0)\n\t\t(type solid)\n\t)\n"
        '\t(uuid "u")\n)'
    )


def test_edit_touches_only_the_changed_node():
    text = '(kicad_sch\n\t(version 20260101)\n\t(symbol\n\t\t(at 1 2 0)\n\t\t(property "Value" "10k"\n\t\t\t(at 1 2 0)\n\t\t)\n\t)\n)\n'
    doc = parse(text)
    sym = doc.root.find("symbol")
    sym.property("Value").items[2].set("4k7")
    doc.root.append(L("junction", L("at", 5, 6)))
    out = dumps(doc)
    assert out == text.replace('"10k"', '"4k7"').replace("\t)\n)\n", "\t)\n\t(junction\n\t\t(at 5 6)\n\t)\n)\n")
    assert dumps(parse(out)) == out


def test_set_atoms_rewrites_position():
    doc = parse("(s\n\t(at 1 2 0)\n)")
    doc.root.find("at").set_atoms(10.16, -0.0, 90)
    assert dumps(doc) == "(s\n\t(at 10.16 0 90)\n)"


@pytest.mark.parametrize("value, text", [(1.0, "1"), (2.54, "2.54"), (-0.0, "0"), (1.23456, "1.2346"), (7, "7")])
def test_fmt_num(value, text):
    assert fmt_num(value) == text


@pytest.mark.parametrize("bad", ["", "x", "(a", '(a "b)', "(a) (b)"])
def test_parse_errors(bad):
    with pytest.raises(ParseError):
        parse(bad)


def test_queries():
    root = parse('(sym (property "Reference" "R1") (property "Value" "1k") (at 1 2 90) yes)').root
    assert root.head == "sym"
    assert root.property("Value").value(1) == "1k"
    assert root.child_value("at", 2) == "90"
    assert [a.value for a in root.atoms()] == ["yes"]
    assert A("x").text() == "x" and S('a"b').text() == '"a\\"b"'
