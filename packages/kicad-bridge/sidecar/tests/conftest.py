import os
import shutil

import pytest

from dsh_kicad_sidecar.kicad_cli import find_kicad_cli
from dsh_kicad_sidecar.symbols import default_symbol_dirs

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")

needs_kicad_cli = pytest.mark.skipif(find_kicad_cli() is None, reason="kicad-cli not installed")
needs_symbols = pytest.mark.skipif(not default_symbol_dirs(), reason="KiCad symbol libraries not installed")


@pytest.fixture
def project(tmp_path):
    """Copy a fixture project into tmp and return the path of its schematic."""

    def make(name):
        dst = tmp_path / name
        shutil.copytree(os.path.join(FIXTURES, name), dst)
        return str(dst / f"{name}.kicad_sch")

    return make


needs_pdftotext = pytest.mark.skipif(shutil.which("pdftotext") is None, reason="pdftotext (poppler) not installed")


def make_pdf(pages):
    """A small PDF with a real text layer: one list of lines per page (Helvetica, WinAnsi, so 'µ' is one byte)."""
    objects = ["<< /Type /Catalog /Pages 2 0 R >>", None,
               "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"]
    kids = []
    for lines in pages:
        text = "".join(f"({line.replace(chr(92), chr(92) * 2).replace('(', chr(92) + '(').replace(')', chr(92) + ')')}) Tj 0 -16 Td "
                       for line in lines)
        stream = f"BT /F1 11 Tf 56 760 Td {text}ET"
        objects.append(f"<< /Length {len(stream.encode('latin-1'))} >>\nstream\n{stream}\nendstream")
        objects.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents {len(objects)} 0 R "
                       "/Resources << /Font << /F1 3 0 R >> >> >>")
        kids.append(f"{len(objects)} 0 R")
    objects[1] = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {len(kids)} >>"
    out, offsets = bytearray(b"%PDF-1.4\n"), []
    for number, body in enumerate(objects, 1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n{body}\nendobj\n".encode("latin-1")
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    out += "".join(f"{o:010d} 00000 n \n" for o in offsets).encode()
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


# Two pages in the shape of the AMS1117 datasheet: a ratings table and the application text.
REGULATOR_PAGES = [
    ["AMS1117 1A LOW DROPOUT VOLTAGE REGULATOR", "ABSOLUTE MAXIMUM RATINGS (Note 1)", "Input Voltage ........................ 15V",
     "The dropout voltage of the device is guaranteed maximum 1.3V, decreasing at lower load currents."],
    ["APPLICATION HINTS", "The circuit design used in the AMS1117 series requires the use of an output capacitor.",
     "The addition of 22µF solid tantalum on the output will ensure", "stability for all operating conditions."],
]
