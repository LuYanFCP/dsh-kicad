# PCB-0 spike (#9): generating `.kicad_pcb` headlessly

Prototype code behind [docs/pcb-architecture.md](../../docs/pcb-architecture.md). None of it is wired into
a tool. #10 ports `option_a.py` and `sync.py` into the sidecar's `pcb_sync.py`, on top of #11's `pcb.py`.
The inputs come from the sidecar modules that did land: `netlist.py` and `lib_tables.py`.

| File | What |
|---|---|
| `run.sh [work dir]` | reproduces every result in the doc (needs `kicad-cli`; option B also needs a Python that imports `pcbnew`) |
| `option_a.py` | option A: board shell from `kicad-cli pcb upgrade`, footprints from `.kicad_mod`, nets from the netlist, default stackup |
| `option_b.py` | option B: the same board through pcbnew SWIG |
| `sync.py`, `sync_scenario.py` | incremental update: relink, update fields/pads, add/remove footprints, net renames; idempotency check |
| `judge.py` | `kicad-cli pcb drc --schematic-parity` summary |
| `compare.py` | pad → net maps of two boards, or which top-level items differ |
| `demo_paths.py` | the footprint ↔ symbol path rule against `/usr/share/kicad/demos` |
| `common.py` | shared inputs (sidecar on `sys.path`, netlist, fp-lib-table) |

Input: `packages/kicad-bridge/sidecar/tests/fixtures/usb_attiny/`, the usb-attiny85 eval's schematic with its
power flags re-annotated `#FLG01`/`#FLG02`.
