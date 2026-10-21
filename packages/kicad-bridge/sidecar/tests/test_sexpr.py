import glob
import os

import pytest

from dsh_kicad_sidecar.sexpr import A, L, ParseError, S, dumps, fmt_num, kicad_layout, parse, prettify

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


def kicad_written_files():
    """Boards and schematics KiCad itself saved (library files are generator-written, not by KiCad)."""
    files = sorted(glob.glob(os.path.join(FIXTURES, "**", "*.kicad_pcb"), recursive=True))
    for ext in ("kicad_pcb", "kicad_sch"):
        files += sorted(glob.glob(os.path.join(DEMO_ROOTS[0], "**", f"*.{ext}"), recursive=True), key=os.path.getsize)[:6]
    return files


@pytest.mark.parametrize("path", kicad_written_files())
def test_prettify_reproduces_kicads_writer(path):
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    assert prettify(text) == text.rstrip("\n")


def test_prettify_wraps_long_token_lists_and_point_runs():
    # A token list wraps at the first space past column 72; its ")" then gets a line of its own.
    pins = L("pins", *(S(str(n)) for n in range(1, 31)))
    text = prettify(dumps(pins, 3), 3)
    first, *rest = text.split("\n")
    assert len(first) > 72 - 3 and all(line.startswith("\t" * 4) for line in rest[:-1]) and rest[-1] == "\t\t\t)"
    assert prettify(text, 3) == text
    # (xy …) runs share a line up to column 99.
    pts = L("pts", *(L("xy", n, n) for n in range(12)))
    lines = prettify(dumps(pts, 1), 1).split("\n")
    assert lines[1].startswith("\t\t(xy 0 0) (xy 1 1)") and 99 <= len(lines[1]) < 99 + 12 and lines[2].startswith("\t\t(xy")


def test_kicad_layout_is_kept_by_dumps():
    node = kicad_layout(L("attr", "smd", "board_only", "exclude_from_pos_files", "exclude_from_bom", "allow_missing_courtyard", "dnp"), 2)
    assert dumps(node, 2) == "(attr smd board_only exclude_from_pos_files exclude_from_bom allow_missing_courtyard\n\t\t\tdnp\n\t\t)"
