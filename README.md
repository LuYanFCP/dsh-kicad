# dsh-kicad

English | [中文](README.zh.md)

KiCad for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh): a native dsh plugin bundle that lets the agent read, edit and check KiCad schematics, with KiCad itself (`kicad-cli`) deciding whether the design is correct.

> Developer preview. Built and tested against dsh `0.2.1-rc.2` and KiCad `10.0.7`. dsh's plugin APIs are pre-stable, so every package pins `engines.dsh` to `>=0.2.1-rc.2 <0.3.0-0`.

## What you get

| Surface | What it does |
|---|---|
| **Tools** (`kicad_*`) | `read_schematic`, `list_components`, `get_symbol_pins`, `list_nets` (KiCad netlist), `search_symbols` (installed libraries), `erc`, `drc`, `render` (SVG, PNG attached as an image for image-capable models), `export` (netlist/BOM), `create_schematic`, and `edit_schematic` — an atomic batch of edits (add/move/remove symbols, set values/footprints/properties, wires, labels, power symbols, junctions, no-connects, pin-to-pin and pin-to-net connections). Untouched file text stays byte-identical. |
| **Policy** | Design edits go through dsh approval (`ask`); writes are confined to the session's working directory (a monotonic guard); after every successful edit KiCad ERC runs and its verdict is appended to the tool result; the system prompt gets stable KiCad working rules and a dynamic "KiCad project in this directory + last ERC" context. |
| **Skills** | `kicad-agent-workflow`, `kicad-erc-triage`, `kicad-schematic-design`. |
| **Commands** | `/erc`, `/drc`, `/bom` (model-free, run on the project's root design), `/kicad-render`. |
| **Agent preset** | `eda` — a standard-like tool set with an electronics-design persona. The KiCad tools are global, so every preset can use them. |
| **Web UI** | Right-sidebar viewer for `*.kicad_sch` / `*.kicad_pcb` with two modes: **Interactive** — the embedded [KiCanvas](https://github.com/theacodes/kicanvas) viewer (hierarchical sheets, symbol/footprint/net inspection, layer toggles, KiCad or Witch Hazel theme, reloads when the file changes) — and **SVG** (kicad-cli render, pan/zoom, multi-sheet, Render button; also the automatic fallback); conversation cards for ERC/DRC and schematic edits; settings pages for the sidecar (kicad-cli path, Python) and the policy (approval, auto-ERC, auto-render). |
| **Standalone MCP server** | The Python sidecar speaks MCP over stdio, so Claude Code or an RL environment can use the same tools without dsh. |
| **KiCad side (optional)** | An IPC plugin with an "Open in DSH" toolbar action. |

## Architecture

```
dsh-kicad-bundle  (cordis.patch.yml: global rows + presets/eda.patch.yml)
├─ dsh-kicad-bridge     Host  ctx.kicad service; runs the Python sidecar through ctx.subprocess, speaks MCP to it
│    └─ sidecar/        Python ≥3.10, stdlib-only core: lossless .kicad_sch S-expression editing, symbol libraries,
│                       pin geometry, kicad-cli (ERC/DRC/netlist/BOM/SVG); optional extras: png (cairosvg), ipc (kicad-python)
├─ dsh-tool-kicad       Host  kicad_* tools (defineTool), paths resolved against the session working directory
├─ dsh-kicad-policy     Host  tools.guard + tools/pre-execute (ask/deny) + tools/post-execute (auto ERC) + prompt section/context
├─ dsh-kicad-skills     Host  skill provider + /erc /drc /bom /kicad-render
└─ dsh-client-ui-kicad  Client sidebarRightTabs type + tool.call.toolview rows + plugins.row.config pages
kicad-plugin/           KiCad IPC plugin ("Open in DSH")
market/                 plugin-market index example
```

Design decisions:

- **Files first, headless.** Schematics are edited as files (`.kicad_sch` S-expressions) and judged with `kicad-cli`; no KiCad GUI is needed. The IPC API (`kipy`) is only an optional live channel (`ipc_status`), because it needs a running GUI and admits one client at a time.
- **Python sidecar**, not Node → IPC: KiCad's IPC is NNG + protobuf with an official binding only for Python.
- **KiCad decides.** ERC/DRC verdicts come from `kicad-cli`, never from the model.
- **Narrow dsh coupling.** Each package touches dsh only through one adapter module (`src/dsh.ts`, `src/client/dsh.ts`); the Client uses public seams only (`sidebarRightTabs`, keyed slots, `remote.workspaceFiles`, `remote.commands`, config forms) and imports no dsh Client package, as dsh asks of third-party UI plugins.

## Requirements

- dsh `>=0.2.1-rc.2 <0.3` (`npm i -g @deepseek-ai/dsh`), Node `>=22.19`, pnpm 11 (for building from source)
- Python `>=3.10` on `PATH` (`python3`; `python` on Windows) — no Python packages needed for the core
- KiCad 8+ with `kicad-cli` (tested with 10.0.7). Found via the setting, `$KICAD_CLI`, `PATH`, macOS/Windows install dirs, or Flatpak `org.kicad.KiCad`
- Optional: `rsvg-convert`, ImageMagick or the `png` extra for PNG renders; the `ipc` extra for the IPC channel

## Install

### From source (works today)

```sh
git clone https://github.com/LuYanFCP/dsh-kicad && cd dsh-kicad
pnpm install && pnpm run build
dsh plugin --profile web add "$PWD/packages/kicad-bundle"
dsh web
```

`dsh plugin … add <dir>` links the directory; leaf packages resolve through this checkout's `node_modules`, and dsh maps `@deepseek-ai/*` imports to the running installation. Rebuild and restart dsh after code changes. In the Web UI you can also use **Plugins → Install** with the same absolute path.

### From npm / a plugin market

After the packages are published (`pnpm -r publish`), `dsh plugin --profile web add dsh-kicad-bundle`, or add an index such as [`market/index.json`](market/index.json) under **Plugins → Discover → Add index source** (enable the experimental "Custom plugin markets" bundle first). `node market/validate.mjs <dsh>/node_modules/@deepseek-ai/dsh-plugin-market-index` checks an index with dsh's own validator.

A Git source pointing at `packages/kicad-bundle` alone does not work yet: pnpm cannot resolve the bundle's `workspace:` siblings from a Git subdirectory. Use npm, or a local checkout.

## Use

1. Open a session whose workspace contains a KiCad project (sidebar **Add workspace**). Optionally pick the **EDA agent** preset.
2. Ask, e.g. *"Add a 100 nF decoupling capacitor between +3V3 and GND next to U1 and make ERC pass."* The agent reads the design, sends one `kicad_edit_schematic` batch (you approve it), and reads the ERC verdict that the policy appends.
3. Open the `.kicad_sch` from **Workspace files**: the KiCad tab shows the render, refreshed after each agent edit; **Render** re-renders on demand.
4. `/erc`, `/drc`, `/bom` work without the model.
5. **Plugins → KiCad → KiCad bridge / KiCad policy** hold the settings.

### Standalone MCP server (Claude Code, RL environments)

```sh
claude mcp add kicad -- uvx --from "git+https://github.com/LuYanFCP/dsh-kicad#subdirectory=packages/kicad-bridge/sidecar" dsh-kicad-sidecar --root .
# or from a checkout, without uv:
PYTHONPATH=packages/kicad-bridge/sidecar/src python3 -m dsh_kicad_sidecar --root /path/to/project
```

`--root` (repeatable) confines file access. `--call <tool> --args '<json>'` runs one tool and prints its result.

### KiCad "Open in DSH" (optional)

Copy `kicad-plugin/` into KiCad's IPC plugin directory (KiCad 9/10: the `plugins` folder under your KiCad documents directory, e.g. `~/Documents/KiCad/10.0/plugins/dsh-kicad`), enable **Preferences → Plugins → Enable KiCad API**, and restart KiCad. The toolbar button copies the project path to the clipboard and starts `dsh web` from the project directory (dsh web has no workspace flag, so use **Add workspace** and paste).

## Configuration

| Row (`cordis.patch.yml` id) | Field | Default | |
|---|---|---|---|
| `kicad-bridge` | `launcher` | `python` | `python` runs the sidecar from source; `uv` runs it in a uv venv with `uvExtras` (`png`, `ipc`) |
| | `python` *(live)* | `python3` | interpreter |
| | `kicadCli` *(live)* | auto | kicad-cli path |
| | `requestTimeoutMs` | `300000` | |
| `kicad-policy` | `approval` *(live)* | `ask` | `ask` / `allow` for design edits |
| | `autoErc` *(live)* | `true` | ERC after each edit |
| | `autoRender` *(live)* | `true` | refresh the sidebar SVG after each edit |
| | `restrictToWorkspace`, `extraRoots` | `true`, `[]` | write confinement |
| | `guidance`, `projectContext` | `true` | prompt section / dynamic context |
| `kicad-tools` | `attachRenders` | `true` | attach PNG renders for image-capable models |

*(live)* fields are editable in the Plugins page without restart.

## Develop

```sh
pnpm install && pnpm run build
pnpm test            # vitest: host packages against dsh's real ToolRuntime/SkillRegistry + real sidecar; client in jsdom
pnpm run test:py     # pytest: S-expression round trip (KiCad demo files), editing, kicad-cli, MCP server
python packages/kicad-bridge/sidecar/tests/make_fixtures.py   # regenerate fixtures with the editor itself
```

Real-dsh smoke test without an API key: install the bundle, then from a directory with a KiCad project run `dsh --profile web --patch scripts/dsh-smoke/smoke.patch.yml --no-open` and read `dsh-kicad-smoke.json`.

The Client is compiled by [`scripts/build-client.mjs`](scripts/build-client.mjs), which reproduces dsh's module-loader artifact (`window.__ModuleLoader__.load({ id, factory(require) })`) with only the shell's platform modules external. [`docs/spike-third-party-bundle.md`](docs/spike-third-party-bundle.md) records how third-party Host + Client loading was verified.

## Known limitations

- Schematic first. PCB support is check/render only (`kicad_drc`, `kicad_render`); there is no board editing.
- Edits cover symbols, properties, wires, labels, power symbols, junctions and no-connects; hierarchical sheet creation, buses and graphic items are not edited.
- New sub-sheet symbols get their instance path from the root sheet one level up; deeper hierarchies may need KiCad's annotation.
- Images reach the model only when the model route declares image input and an attachment store is mounted; otherwise the render tool returns SVG paths.
- Approval needs an interactive approval channel; headless runs without one deny design edits unless `approval: allow`.
- The interactive viewer is KiCanvas, vendored at a pinned commit by `scripts/vendor-kicanvas.mjs` (see `packages/client-ui-kicad/vendor/kicanvas/README.md` for the offline/icon/theme patches). It parses KiCad 10 files but ignores tokens it does not know yet; the SVG mode is the kicad-cli ground truth. It needs WebGL2.
- The IPC channel is a status probe plus the KiCad-side launcher; live editing through IPC is not implemented (KiCad's IPC API is PCB-centric).

## License

MIT
