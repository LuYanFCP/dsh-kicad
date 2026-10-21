# dsh-kicad-sidecar

KiCad tools over MCP-style JSON-RPC on stdio. It backs the `ctx.kicad` service of
[dsh-kicad](../../../README.md) and also runs on its own as an MCP server.

- **Core is stdlib-only** (Python ≥ 3.10): a lossless S-expression reader/writer
  (untouched text round-trips byte for byte), a `.kicad_sch` model with atomic edit
  batches, symbol-library lookup/search, pin geometry, and a `kicad-cli` wrapper
  (ERC, DRC, netlist, BOM, SVG/PDF).
- **Extras:** `png` (cairosvg rasterizer; otherwise rsvg-convert/ImageMagick/Inkscape),
  `ipc` (kicad-python, for `ipc_status`), `dev` (pytest).

```sh
python -m dsh_kicad_sidecar [--kicad-cli PATH] [--root DIR ...]         # serve MCP on stdio
python -m dsh_kicad_sidecar --call read_schematic --args '{"path":"a.kicad_sch"}'
uvx --from . dsh-kicad-sidecar --root /path/to/project                   # same, through uv
```

Tools: `environment`, `doctor` (environment check with fixes and install commands), `read_schematic`, `list_components`, `get_symbol_pins`,
`list_nets`, `search_symbols`, `erc`, `drc`, `render`, `export_netlist`, `export_bom`,
`create_schematic`, `edit_schematic`, `ipc_status`. Each returns its value as
`structuredContent` plus a JSON text block; domain failures are `isError` results.

Tests: `uv run --extra dev pytest -q` (KiCad-dependent tests skip when `kicad-cli`
or the symbol libraries are missing). `tests/make_fixtures.py` regenerates the
fixtures with the editor itself.
