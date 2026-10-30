"""Datasheets for kicad_datasheet and kicad_check_design: a part's datasheet (its symbol's link, a URL, or a PDF in the
workspace) is kept in the project's .dsh-kicad/datasheets/ together with its text per page (pdftotext), and searched
there. kicad_check_design verifies every quote a check cites against that text, so a value only a model remembers
never passes."""
from __future__ import annotations

import glob
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

from . import __version__

CACHE_DIR = os.path.join(".dsh-kicad", "datasheets")
MAX_BYTES = 40 * 1024 * 1024
TIMEOUT_S = 60
USER_AGENT = f"dsh-kicad/{__version__} (datasheet download)"
MIN_QUOTE = 12  # characters, normalized: shorter quotes ("15V") prove nothing

# Headings worth an index entry: (label, pattern on the page text).
SECTIONS = (
    ("absolute maximum ratings", r"absolute\s+maximum"),
    ("recommended operating conditions", r"recommended\s+operating\s+conditions"),
    ("electrical characteristics", r"electrical\s+characteristics"),
    ("pin description", r"pin\s+(?:configurations?|descriptions?|functions?|assignments?|definitions?)"),
    ("application information", r"typical\s+applications?|applications?\s+(?:information|circuits?|hints?)"),
    ("layout", r"(?:pcb\s+)?layout\s+(?:guidelines?|considerations?|recommendations?|examples?)"),
    ("thermal", r"thermal\s+(?:information|characteristics|resistance|considerations?)"),
)


class DatasheetError(Exception):
    """The datasheet could not be had or read; the message says why and what to do instead."""


@dataclass
class Datasheet:
    source: str        # the URL, or the path of a PDF in the workspace
    pdf: str           # where the PDF is
    layout: list[str]  # text per page with the columns kept (table rows read across)
    raw: list[str]     # text per page in reading order (sentences stay together)
    title: str

    @property
    def pages(self) -> int:
        return len(self.layout)


def locate_pdftotext() -> str | None:
    return os.environ.get("PDFTOTEXT") or shutil.which("pdftotext")


def _key(source: str) -> str:
    return hashlib.sha1(source.encode("utf-8")).hexdigest()[:10]


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9.+]+", "-", text.lower()).strip("-.")[:48] or "datasheet"


def _folder(project_dir: str) -> str:
    return os.path.join(project_dir, CACHE_DIR)


def cached(project_dir: str, source: str) -> Datasheet | None:
    """The datasheet already read for ``source`` (a URL or a workspace PDF path), without touching the network."""
    for meta_path in glob.glob(os.path.join(_folder(project_dir), f"*-{_key(source)}.json")):
        base = meta_path[:-len(".json")]
        try:
            with open(meta_path, encoding="utf-8") as fh:
                meta = json.load(fh)
            with open(base + ".layout.txt", encoding="utf-8") as fh:
                layout = fh.read().split("\f")
            with open(base + ".raw.txt", encoding="utf-8") as fh:
                raw = fh.read().split("\f")
        except (OSError, ValueError):
            continue
        if meta.get("source") == source:
            return Datasheet(source, meta.get("pdf") or base + ".pdf", layout, raw, meta.get("title") or source)
    return None


def load(project_dir: str, *, url: str | None = None, pdf: str | None = None, hint: str | None = None,
         download: bool = True) -> Datasheet:
    """The datasheet at ``url`` (downloaded once) or the workspace PDF ``pdf``, with its text per page."""
    source = url or pdf
    if not source:
        raise DatasheetError("no datasheet: give a url or a pdf in the workspace")
    found = cached(project_dir, source)
    if found:
        return found
    if url and not download:
        raise DatasheetError(f"{url} has not been read yet: open it once with kicad_datasheet")
    os.makedirs(_folder(project_dir), exist_ok=True)
    stem = hint or os.path.splitext(os.path.basename(urllib.parse.urlparse(source).path))[0]
    base = os.path.join(_folder(project_dir), f"{_slug(stem)}-{_key(source)}")
    if url:
        target = base + ".pdf"
        fetch(url, target)
    else:
        assert pdf is not None
        target = pdf
        with open(target, "rb") as fh:
            if fh.read(5) != b"%PDF-":
                raise DatasheetError(f"{pdf} is not a PDF")
    layout, raw = extract(target)
    title = hint or _title(target, raw)
    with open(base + ".layout.txt", "w", encoding="utf-8") as fh:
        fh.write("\f".join(layout))
    with open(base + ".raw.txt", "w", encoding="utf-8") as fh:
        fh.write("\f".join(raw))
    with open(base + ".json", "w", encoding="utf-8") as fh:
        json.dump({"source": source, "pdf": target, "title": title, "pages": len(layout)}, fh, indent=1)
    return Datasheet(source, target, layout, raw, title)


def fetch(url: str, dest: str) -> None:
    """Download a PDF (http/https only, at most MAX_BYTES); anything else is refused with what to do instead."""
    if not re.match(r"https?://", url, re.I):
        raise DatasheetError(f"{url!r} is not an http(s) URL; a PDF in the workspace goes in 'pdf'")
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/pdf,*/*"})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:
            data = response.read(MAX_BYTES + 1)
            kind = (response.headers.get("Content-Type") or "").split(";")[0].strip()
            final = response.url
    except urllib.error.HTTPError as exc:
        raise DatasheetError(f"{url} answered HTTP {exc.code}; find another copy (web_search, the maker's site) and pass it as url") from exc
    except (urllib.error.URLError, OSError, ValueError) as exc:
        reason = getattr(exc, "reason", None) or exc
        raise DatasheetError(f"{url} could not be downloaded ({reason}); find another copy or put the PDF in the workspace") from exc
    if len(data) > MAX_BYTES:
        raise DatasheetError(f"{url} is larger than {MAX_BYTES >> 20} MB")
    if not data.startswith(b"%PDF-"):
        via = f" (redirected to {final})" if final and final != url else ""
        raise DatasheetError(f"{url}{via} is not a PDF but {kind or 'something else'}: probably a page that links the "
                             "datasheet. Find the PDF itself (web_search, the maker's site) and pass it as url, or put it in "
                             "the workspace and pass it as pdf")
    with open(dest + ".part", "wb") as fh:
        fh.write(data)
    os.replace(dest + ".part", dest)


def extract(pdf: str) -> tuple[list[str], list[str]]:
    """Text per page twice: with the columns kept (-layout) and in reading order."""
    exe = locate_pdftotext()
    if not exe:
        raise DatasheetError("pdftotext (poppler) is not installed, so PDFs cannot be read; kicad_doctor says how to install it")

    def pages(*flags: str) -> list[str]:
        try:
            run = subprocess.run([exe, *flags, "-enc", "UTF-8", pdf, "-"], capture_output=True, timeout=180)
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise DatasheetError(f"pdftotext failed on {os.path.basename(pdf)}: {exc}") from exc
        if run.returncode != 0:
            raise DatasheetError(f"pdftotext could not read {os.path.basename(pdf)}: {run.stderr.decode(errors='replace').strip()[:200]}")
        out = run.stdout.decode("utf-8", errors="replace").split("\f")
        if out and not out[-1].strip():
            out.pop()
        return out

    layout, raw = pages("-layout"), pages()
    if not any(p.strip() for p in layout):
        raise DatasheetError(f"{os.path.basename(pdf)} has no text layer (a scan?); find a text PDF of the datasheet")
    n = max(len(layout), len(raw))
    return layout + [""] * (n - len(layout)), raw + [""] * (n - len(raw))


def _title(pdf: str, raw: list[str]) -> str:
    exe = shutil.which("pdfinfo")
    if exe:
        try:
            info = subprocess.run([exe, pdf], capture_output=True, timeout=30).stdout.decode("utf-8", errors="replace")
            m = re.search(r"^Title:\s*(.+)$", info, re.M)
            if m and not m.group(1).strip().lower().startswith("microsoft word"):
                return m.group(1).strip()
        except (OSError, subprocess.TimeoutExpired):
            pass
    first = next((line.strip() for line in (raw[0] if raw else "").splitlines() if line.strip()), "")
    return first[:100] or os.path.basename(pdf)


# ---- reading -------------------------------------------------------------------------------------------------------

def normalize(text: str, lower: bool = True) -> str:
    """Comparable text: micro signs as 'u', one kind of dash, no dot leaders, single spaces."""
    t = unicodedata.normalize("NFKC", text).replace("μ", "u").replace("µ", "u").replace("Ω", "ohm")
    t = re.sub("[‐-―−]", "-", t)
    t = re.sub(r"\.{3,}|…+", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t.lower() if lower else t


def _variants(page: str) -> list[str]:
    # A line-break hyphen may be a split word ("compen-\nsation") or a real one ("low-\ndropout"): try both.
    return [normalize(page), normalize(re.sub(r"(\w)-\s*\n\s*(\w)", r"\1\2", page))]


def index(ds: Datasheet) -> list[dict[str, Any]]:
    """Pages where the usual datasheet sections appear."""
    out = []
    for label, pattern in SECTIONS:
        pages = [i + 1 for i, text in enumerate(ds.layout) if re.search(pattern, text, re.I)]
        if pages:
            out.append({"section": label, "pages": pages[:6]})
    return out


def search(ds: Datasheet, query: str, max_hits: int = 8, context: int = 2) -> list[dict[str, Any]]:
    """Places where most of the query's words appear together, best first, as lines of the column-kept text."""
    terms: list[str] = []
    for phrase, word in re.findall(r'"([^"]+)"|(\S+)', query):  # "quoted phrases" stay whole
        term = normalize(phrase or word)
        if term and term not in terms:
            terms.append(term)
    if not terms:
        return []
    need = 1 if len(terms) == 1 else max(2, math.ceil(len(terms) / 2))
    scored: list[tuple[int, int, int]] = []
    for floor in dict.fromkeys((need, 1)):  # when no place has enough of the words, any of them beats nothing
        for p, text in enumerate(ds.layout):
            norm = [normalize(line) for line in text.splitlines()]
            for i in range(len(norm)):
                window = " ".join(norm[max(0, i - 1):i + 2])
                score = sum(1 for t in terms if t in window)
                if score >= floor:
                    scored.append((-score, p, i))
        if scored:
            break
    scored.sort()
    hits: list[dict[str, Any]] = []
    taken: set[tuple[int, int]] = set()
    for _, p, i in scored:
        if any(q == p and abs(j - i) <= 2 * context for q, j in taken):
            continue
        taken.add((p, i))
        lines = ds.layout[p].splitlines()
        snippet = "\n".join(line.rstrip() for line in lines[max(0, i - context):i + context + 1])
        hits.append({"page": p + 1, "line": i + 1, "text": _trim(snippet, 900)})
        if len(hits) >= max_hits:
            break
    return hits


def page_text(ds: Datasheet, pages: list[int], limit: int = 12000) -> list[dict[str, Any]]:
    out, used = [], 0
    for n in pages:
        if not 1 <= n <= ds.pages:
            raise DatasheetError(f"page {n} is outside 1-{ds.pages}")
        text = "\n".join(line.rstrip() for line in ds.layout[n - 1].splitlines()).strip("\n")
        text = _trim(text, max(0, limit - used))
        used += len(text)
        out.append({"page": n, "text": text})
        if used >= limit:
            break
    return out


def _trim(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[:limit].rstrip() + " …"


def find_quote(ds: Datasheet, quote: str, page: int | None = None) -> int | None:
    """The page (1-based) holding ``quote`` once both are normalized, trying ``page`` first; None when it is nowhere."""
    q = normalize(quote)
    if len(q) < MIN_QUOTE:
        return None
    order = list(range(ds.pages))
    if page and 1 <= page <= ds.pages:
        order.remove(page - 1)
        order.insert(0, page - 1)
    for p in order:
        if any(q in v for text in (ds.layout[p], ds.raw[p]) for v in _variants(text)):
            return p + 1
    return None


def quote_in_text(text: str, quote: str) -> bool:
    q = normalize(quote)
    return len(q) >= MIN_QUOTE and any(q in v for v in _variants(text))


# ---- numbers -------------------------------------------------------------------------------------------------------

PREFIX = {"p": 1e-12, "n": 1e-9, "u": 1e-6, "m": 1e-3, "": 1.0, "k": 1e3, "K": 1e3, "M": 1e6, "G": 1e9}
UNITS = {"f": "F", "v": "V", "a": "A", "ohm": "ohm", "r": "ohm", "hz": "Hz", "w": "W", "s": "s"}
_QUANTITY = re.compile(r"(?<![\w.])([-+]?\d+(?:\.\d+)?)\s?([pnumkKMG]?)\s?((?i:ohm|hz|f|v|a|w|s))?(?![A-Za-z])")


def quantities(text: str) -> list[tuple[float, str | None]]:
    """Every number in ``text`` in SI units, with its unit when one follows it ('22µF' → (2.2e-05, 'F'))."""
    out = []
    for m in _QUANTITY.finditer(normalize(text, lower=False)):
        number, prefix, unit = m.group(1), m.group(2), m.group(3)
        if prefix and not unit and prefix in "mM":
            # 'm' alone is ambiguous (metres, milli); count it as a bare number too
            out.append((float(number), None))
        out.append((float(number) * PREFIX[prefix], UNITS.get(unit.lower()) if unit else None))
    return out


def states(text: str, value: float, unit: str) -> bool:
    """Whether ``text`` gives ``value`` (SI) as a number, with ``unit`` or without one."""
    return any(u in (None, unit) and math.isclose(v, value, rel_tol=1e-6, abs_tol=1e-15) for v, u in quantities(text))


_VALUE = re.compile(r"^\s*(\d+(?:\.\d+)?)\s?([pnuµμmkKMGR]?)(\d*)\s?(?i:f|v|a|ohm|Ω|hz)?", re.UNICODE)


def parse_value(text: Any) -> float | None:
    """A component value or a bound in SI: 10, '10u', '10uF', '4u7', '4k7', '5.1k', '330R', '0.1 µF', '22uF/16V'."""
    if isinstance(text, bool):
        return None
    if isinstance(text, (int, float)):
        return float(text)
    if not isinstance(text, str):
        return None
    m = _VALUE.match(text.replace("Ω", "").strip())
    if not m:
        return None
    number, prefix, tail = m.group(1), m.group(2), m.group(3)
    if prefix in ("µ", "μ"):
        prefix = "u"
    scale = 1.0 if prefix == "R" else PREFIX[prefix]
    if tail and "." not in number:
        number = f"{number}.{tail}"  # 4k7 = 4.7k, 4u7 = 4.7u, 4R7 = 4.7
    elif tail:
        return None
    return float(number) * scale
