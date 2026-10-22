"""SPICE model libraries: find the ``.subckt`` / ``.model`` definitions in a file, and bind one to a symbol the way KiCad's
simulator expects (``Sim.Library``, ``Sim.Name``, ``Sim.Device``, ``Sim.Pins``) after checking the pin mapping, because KiCad
trusts a wrong ``Sim.Pins`` and simulates the wrong circuit.
"""

from __future__ import annotations

import os
import re
from typing import Any, Iterable

__all__ = ["MODEL_EXTENSIONS", "ModelError", "parse_models", "scan", "load_model", "plan_pins", "library_reference", "normalize_pin"]

MODEL_EXTENSIONS = (".lib", ".mod", ".sub", ".cir", ".sp", ".spi", ".ckt", ".cmp", ".mdl", ".inc")
MAX_FILE_BYTES = 8 * 1024 * 1024
MAX_FILES = 200
MAX_MODELS = 400

# Pin names of the device models KiCad's simulator knows (the order SPICE wants the nodes in).
DEVICE_PINS = {
    "D": ["A", "K"],
    "NPN": ["C", "B", "E"], "PNP": ["C", "B", "E"],
    "NJF": ["D", "G", "S"], "PJF": ["D", "G", "S"],
    "NMOS": ["D", "G", "S"], "PMOS": ["D", "G", "S"], "VDMOS": ["D", "G", "S"],
}
_ALIASES = {"NMF": "NJF", "PMF": "PJF"}


class ModelError(ValueError):
    """A model file or binding that cannot be used (reported to the caller as an error)."""


def normalize_pin(name: str) -> str:
    """Pin names compare without case, ``~{}`` overbars and underscores (``+`` and ``-`` count): ``~{RESET}`` and ``reset`` are the same pin."""
    return re.sub(r"[~{}\s_]", "", name).upper()


# ---- parsing ---------------------------------------------------------------------------------
def _logical_lines(text: str) -> Iterable[tuple[str, list[str]]]:
    """``(statement, preceding comment lines)``; ``+`` continuation lines are joined, ``;`` comments dropped."""
    comments: list[str] = []
    current = ""
    current_comments: list[str] = []
    for raw in text.splitlines():
        line = raw.rstrip()
        stripped = line.strip()
        if stripped.startswith("+") and current:
            current += " " + stripped[1:].split(";")[0].strip()
            continue
        if current:
            yield current, current_comments
            current = ""
        if not stripped:
            comments = []
            continue
        if stripped.startswith("*"):
            comments.append(stripped.lstrip("*").strip())
            continue
        current, current_comments = stripped.split(";")[0].strip(), comments[-6:]
        comments = []
    if current:
        yield current, current_comments


def parse_models(text: str) -> list[dict[str, Any]]:
    """Every ``.subckt`` and ``.model`` in ``text``: ``{name, kind, pins | type, comment?}``."""
    models: list[dict[str, Any]] = []
    for statement, comments in _logical_lines(text):
        tokens = statement.split()
        head = tokens[0].lower()
        if head == ".subckt" and len(tokens) >= 2:
            pins: list[str] = []
            for token in tokens[2:]:
                if "=" in token or token.lower().rstrip(":") == "params":
                    break
                pins.append(token)
            entry: dict[str, Any] = {"name": tokens[1], "kind": "subckt", "pins": pins}
            if comments:
                entry["comment"] = " | ".join(c for c in comments if c)[:400]
            models.append(entry)
        elif head == ".model" and len(tokens) >= 3:
            kind = re.split(r"[(\s]", tokens[2], maxsplit=1)[0].upper()
            models.append({"name": tokens[1], "kind": "model", "type": _ALIASES.get(kind, kind)})
    return models


def _read(path: str) -> str:
    if os.path.getsize(path) > MAX_FILE_BYTES:
        raise ModelError(f"{path} is larger than {MAX_FILE_BYTES // (1024 * 1024)} MB; point at the model's own file")
    with open(path, encoding="utf-8", errors="replace") as fh:
        return fh.read()


def load_model(path: str, name: str) -> dict[str, Any]:
    """The model ``name`` (case-insensitive, as SPICE reads it) from the library file ``path``."""
    models = parse_models(_read(path))
    for model in models:
        if model["name"].lower() == name.lower():
            return model
    known = ", ".join(m["name"] for m in models[:15])
    raise ModelError(f"no model named {name} in {os.path.basename(path)}" + (f" (it has: {known}{', …' if len(models) > 15 else ''})" if models else
                                                                           " (no .subckt or .model found in it)"))


def scan(path: str, name: str | None = None) -> dict[str, Any]:
    """Models in one file, or in every model file below a directory (the project's ``.dsh-kicad`` is skipped)."""
    files: list[str] = []
    if os.path.isdir(path):
        for root, dirs, names in os.walk(path):
            dirs[:] = sorted(d for d in dirs if not d.startswith(".") and d not in ("node_modules", "fab"))
            files += [os.path.join(root, n) for n in sorted(names) if n.lower().endswith(MODEL_EXTENSIONS)]
            if len(files) >= MAX_FILES:
                break
    elif os.path.isfile(path):
        files = [path]
    else:
        raise ModelError(f"{path} does not exist")
    needle = (name or "").lower()
    out: list[dict[str, Any]] = []
    total = 0
    for file in files[:MAX_FILES]:
        try:
            models = parse_models(_read(file))
        except (OSError, ModelError):
            continue
        if needle:
            models = [m for m in models if needle in m["name"].lower()]
        if not models:
            continue
        total += len(models)
        out.append({"file": file, "models": models[:MAX_MODELS]})
    return {"path": path, "files": out, "models": total, "truncated": len(files) > MAX_FILES or total > MAX_MODELS}


# ---- binding ---------------------------------------------------------------------------------
def model_pins(model: dict[str, Any]) -> list[str]:
    if model["kind"] == "subckt":
        return list(model["pins"])
    pins = DEVICE_PINS.get(model["type"])
    if pins is None:
        raise ModelError(f".model {model['name']} is a {model['type']}, which has no pin mapping here; "
                         "use a .subckt model, or set Sim.* by hand with set_property")
    return pins


def plan_pins(symbol_pins: list[dict[str, Any]], model: dict[str, Any], explicit: Any = None) -> tuple[str, list[dict[str, str]], list[str]]:
    """The ``Sim.Pins`` value, the mapping as rows ``{symbol_pin, name, model_pin}`` and notes.

    Symbol pins are matched to model pins by name unless ``explicit`` (``{"1": "GND"}`` or ``"1=GND 2=OUT"``, symbol pin
    number or name → model pin) says otherwise; a mapping that cannot be made from names is an error, never a guess.
    """
    wanted = model_pins(model)
    by_norm = {normalize_pin(p): p for p in wanted}
    if len(by_norm) != len(wanted):
        raise ModelError(f"model {model['name']} has pins that differ only in case or punctuation ({', '.join(wanted)}); give pins explicitly")
    rows: dict[str, dict[str, str]] = {}
    notes: list[str] = []
    numbers = {str(p["number"]): p for p in symbol_pins}

    def symbol_pin(key: str) -> dict[str, Any]:
        if key in numbers:
            return numbers[key]
        named = [p for p in symbol_pins if p.get("name") and normalize_pin(p["name"]) == normalize_pin(key)]
        if len(named) == 1:
            return named[0]
        listing = ", ".join(f"{p['number']}({p['name']})" if p.get("name") and p["name"] != "~" else str(p["number"]) for p in symbol_pins)
        raise ModelError(f"the symbol has no pin {key!r}; pins: {listing}")

    if isinstance(explicit, str):
        explicit = dict(item.split("=", 1) for item in explicit.split() if "=" in item)
    if explicit:
        if not isinstance(explicit, dict):
            raise ModelError("pins must be an object like {\"1\": \"GND\", \"2\": \"OUT\"}")
        for key, target in explicit.items():
            pin = symbol_pin(str(key))
            model_pin = by_norm.get(normalize_pin(str(target)))
            if model_pin is None:
                raise ModelError(f"model {model['name']} has no pin {target!r}; its pins are {', '.join(wanted)}")
            if model_pin in rows:
                raise ModelError(f"model pin {model_pin} is given twice ({rows[model_pin]['symbol_pin']} and {pin['number']})")
            rows[model_pin] = {"symbol_pin": str(pin["number"]), "name": str(pin.get("name") or ""), "model_pin": model_pin}
    for model_pin in wanted:
        if model_pin in rows:
            continue
        matches = [p for p in symbol_pins if p.get("name") and normalize_pin(p["name"]) == normalize_pin(model_pin)]
        if len(matches) > 1:
            matches.sort(key=lambda p: [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", str(p["number"]))])
            notes.append(f"symbol pins {', '.join(str(p['number']) for p in matches)} are all named {model_pin}; bound pin {matches[0]['number']}")
        if matches:
            rows[model_pin] = {"symbol_pin": str(matches[0]["number"]), "name": str(matches[0].get("name") or ""), "model_pin": model_pin}
    missing = [p for p in wanted if p not in rows]
    if missing:
        listing = ", ".join(f"{p['number']}({p['name']})" if p.get("name") and p["name"] != "~" else str(p["number"]) for p in symbol_pins)
        raise ModelError(
            f"cannot match model {model['name']}'s pins {', '.join(missing)} to the symbol by name. Give pins as {{symbol pin: model pin}} "
            f"(model pins: {', '.join(wanted)}; symbol pins: {listing})")
    used = {r["symbol_pin"] for r in rows.values()}
    if len(used) != len(rows):
        raise ModelError("two model pins would be bound to the same symbol pin; check the pins mapping")
    ordered = sorted(rows.values(), key=lambda r: [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", r["symbol_pin"])])
    return " ".join(f"{r['symbol_pin']}={r['model_pin']}" for r in ordered), ordered, notes


def library_reference(schematic: str, library: str) -> tuple[str, str]:
    """``(file on disk, value for Sim.Library)``: relative to the schematic's folder when the file is inside it, so the project moves."""
    base = os.path.dirname(os.path.realpath(schematic))
    expanded = os.path.expandvars(os.path.expanduser(library.replace("${KIPRJMOD}", base)))
    full = expanded if os.path.isabs(expanded) else os.path.join(base, expanded)
    full = os.path.realpath(full)
    if not os.path.isfile(full):
        raise ModelError(f"model library {library} does not exist (looked for {full})")
    rel = os.path.relpath(full, base)
    return full, (rel if not rel.startswith("..") else full).replace(os.sep, "/")
