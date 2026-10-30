"""kicad_datasheet's reading of a datasheet PDF: download and cache, refusing what is not a PDF, the text per page, the
section index, search, and the quote and number checks kicad_check_design relies on."""
import http.server
import os
import threading

import pytest

from dsh_kicad_sidecar import datasheet
from dsh_kicad_sidecar.datasheet import DatasheetError, parse_value, states
from dsh_kicad_sidecar.tools import Toolbox, ToolError

from conftest import REGULATOR_PAGES, make_pdf, needs_pdftotext


@pytest.fixture
def server(monkeypatch):
    """A local web server: /ds.pdf is the regulator datasheet, /page.html a viewer page, anything else 404."""
    requests = []
    pdf = make_pdf(REGULATOR_PAGES)

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            requests.append(self.path)
            body, kind = {"/ds.pdf": (pdf, "application/pdf"), "/page.html": (b"<html>datasheet viewer</html>", "text/html")}.get(self.path, (None, None))
            if body is None:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", kind)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    for var in ("NO_PROXY", "no_proxy"):  # this machine may route http through a proxy
        monkeypatch.setenv(var, "127.0.0.1,localhost")
    yield f"http://127.0.0.1:{httpd.server_address[1]}", requests
    httpd.shutdown()


@needs_pdftotext
def test_a_datasheet_is_read_once_and_its_sections_and_words_found(server, tmp_path):
    base, requests = server
    ds = datasheet.load(str(tmp_path), url=f"{base}/ds.pdf", hint="AMS1117-3.3")
    assert ds.pages == 2 and ds.title == "AMS1117-3.3"
    assert os.path.dirname(ds.pdf) == str(tmp_path / ".dsh-kicad" / "datasheets")
    again = datasheet.load(str(tmp_path), url=f"{base}/ds.pdf", download=False)  # from the cache
    assert again.layout == ds.layout and requests == ["/ds.pdf"]
    assert {e["section"]: e["pages"] for e in datasheet.index(ds)} == {"absolute maximum ratings": [1], "application information": [2]}
    hit = datasheet.search(ds, "output capacitor stability")[0]
    assert hit["page"] == 2 and "22µF solid tantalum" in hit["text"]
    # no place has two of these words: the places with one of them, rather than nothing
    assert [h["page"] for h in datasheet.search(ds, "22µF figure label")] == [2]
    assert datasheet.page_text(ds, [1])[0]["text"].startswith("AMS1117 1A LOW DROPOUT")
    with pytest.raises(DatasheetError, match="outside 1-2"):
        datasheet.page_text(ds, [3])


@needs_pdftotext
def test_a_quote_counts_only_when_it_is_in_the_text(server, tmp_path):
    base, _ = server
    ds = datasheet.load(str(tmp_path), url=f"{base}/ds.pdf")
    # across a line break, with µ typed as u; a table row without its dot leader, found off the page given
    assert datasheet.find_quote(ds, "The addition of 22uF solid tantalum on the output will ensure stability for all operating conditions.") == 2
    assert datasheet.find_quote(ds, "Input Voltage 15V", page=2) == 1
    assert datasheet.find_quote(ds, "A 10uF ceramic capacitor is required on the input") is None
    assert datasheet.find_quote(ds, "15V") is None  # too short to prove anything


def test_what_is_not_a_pdf_is_refused_with_what_to_do(server, tmp_path):
    base, _ = server
    with pytest.raises(DatasheetError, match="is not a PDF but text/html.*pass it as url"):
        datasheet.load(str(tmp_path), url=f"{base}/page.html")
    with pytest.raises(DatasheetError, match="HTTP 404"):
        datasheet.load(str(tmp_path), url=f"{base}/gone.pdf")
    with pytest.raises(DatasheetError, match="not an http"):
        datasheet.load(str(tmp_path), url="file:///etc/passwd")
    with pytest.raises(DatasheetError, match="has not been read yet"):
        datasheet.load(str(tmp_path), url=f"{base}/ds.pdf", download=False)
    assert os.listdir(tmp_path / ".dsh-kicad" / "datasheets") == []  # nothing half-written


def test_without_pdftotext_the_doctor_is_named(server, tmp_path, monkeypatch):
    base, _ = server
    monkeypatch.setattr(datasheet, "locate_pdftotext", lambda: None)
    with pytest.raises(DatasheetError, match="pdftotext .*kicad_doctor"):
        datasheet.load(str(tmp_path), url=f"{base}/ds.pdf")


def test_values_and_the_numbers_a_quote_states():
    values = [parse_value(v) for v in (10, "10u", "10uF", "4u7", "4k7", "5.1k", "5k1", "330R", "0.1 µF", "22uF/16V", "1M")]
    assert values == pytest.approx([10, 1e-5, 1e-5, 4.7e-6, 4700, 5100, 5100, 330, 1e-7, 2.2e-5, 1e6])
    assert parse_value("x") is None and parse_value(True) is None
    assert states("Input Voltage ........ 15V", 15, "V") and not states("Input Voltage 15V", 20, "V")
    assert states("The addition of 22µF solid tantalum", 22e-6, "F") and not states("22µF", 22e-6, "V")
    assert states("Continuous forward current 20 mA", 0.02, "A") and states("Rd = 5.1 kΩ ±10%", 5100, "ohm")
    assert states("Operating Voltage: 1.8 - 5.5V", 1.8, "V") and states("Operating Voltage: 1.8 - 5.5V", 5.5, "V")


@needs_pdftotext
def test_the_tool_reads_a_datasheet_before_any_schematic_exists(server, tmp_path):
    base, _ = server
    tb = Toolbox(cwd=str(tmp_path))  # no path: the working directory keeps the datasheet
    out = tb.call("datasheet", {"url": f"{base}/ds.pdf", "query": "output capacitor stability", "pages": [1]})
    assert out["pages"] == 2 and out["cached"].startswith(".dsh-kicad/datasheets/") and out["hits"][0]["page"] == 2
    assert out["text"][0]["text"].startswith("AMS1117 1A LOW DROPOUT")
    with pytest.raises(ToolError, match="give its .kicad_sch as path"):
        tb.call("datasheet", {"reference": "U1"})
