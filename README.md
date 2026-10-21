# dsh-kicad

English | [中文](README.zh.md)

KiCad for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh): a native dsh plugin bundle that lets the agent read, edit and check KiCad schematics, with KiCad itself (`kicad-cli`) deciding whether the design is correct.

> Developer preview. Built and tested against dsh `0.2.1-rc.2` and KiCad `10.0.7`. dsh's plugin APIs are pre-stable, so every package pins `engines.dsh` to `>=0.2.1-rc.2 <0.3.0-0`.

## What you get

| Surface | What it does |
|---|---|
| **Tools** (`kicad_*`) | `doctor` (is this machine ready: kicad-cli and KiCad 8+, libraries, Python, with fixes and install commands), `read_schematic`, `list_components`, `get_symbol_pins`, `list_nets` (KiCad netlist), `search_symbols` (installed libraries), `erc`, `drc`, `render` (SVG, PNG attached as an image for image-capable models), `export` (netlist/BOM), `create_schematic`, and `edit_schematic` — an atomic batch of edits (add/move/remove symbols, set values/footprints/properties, wires, labels, power symbols, junctions, no-connects, pin-to-pin and pin-to-net connections). Untouched file text stays byte-identical. |
| **Policy** | Design edits go through dsh approval (`ask`); writes are confined to the session's working directory (a monotonic guard); after every successful edit KiCad ERC runs and its verdict is appended to the tool result; the system prompt gets stable KiCad working rules and a dynamic "KiCad project in this directory + last ERC" context. |
| **Skills** | `kicad-agent-workflow`, `kicad-erc-triage`, `kicad-schematic-design`. |
| **Commands** | `/erc`, `/drc`, `/bom` (model-free, run on the project's root design), `/kicad-render`, `/kicad-doctor` (environment check), `/kicad-install` (install KiCad, see below). |
| **Agent preset** | `eda` — a standard-like tool set with an electronics-design persona. The KiCad tools are global, so every preset can use them. |
| **Web UI** | Right-sidebar viewer for `*.kicad_sch` / `*.kicad_pcb` with two modes: **Interactive** — the embedded [KiCanvas](https://github.com/theacodes/kicanvas) viewer (hierarchical sheets, symbol/footprint/net inspection, layer toggles, KiCad or Witch Hazel theme, reloads when the file changes) — and **SVG** (kicad-cli render, pan/zoom, multi-sheet, Render button; also the automatic fallback); conversation cards for ERC/DRC, schematic edits and the environment check; settings pages for the sidecar (kicad-cli path, Python, plus the KiCad environment check and **Install KiCad**) and the policy (approval, auto-ERC, auto-render). The viewer and failed tool cards show a notice with **Install KiCad** when KiCad is missing or too old. |
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

### Check your setup and install KiCad

**Plugins → KiCad → KiCad bridge** shows the environment check: each item (kicad-cli, KiCad version ≥ 8, symbol and footprint libraries, Python ≥ 3.10, optional PNG rasterizer and kicad-python) with its status and how to fix it. `/kicad-doctor` prints the same in a conversation, and the model has `kicad_doctor`; a tool that fails because KiCad is missing names the install command.

When KiCad is missing or too old, the page (and the viewer's notice) lists the ways to install it on this machine:

| Platform | Option | Runs from dsh? |
|---|---|---|
| Fedora | `sudo dnf install -y kicad` | no: needs root, shown with **Copy command** |
| Ubuntu and derivatives | KiCad PPA: `sudo add-apt-repository -y ppa:kicad/kicad-10.0-releases && sudo apt-get update && sudo apt-get install -y kicad` | no (root) |
| Debian | `sudo apt-get install -y kicad` | no (root) |
| Arch | `sudo pacman -S --needed kicad kicad-library` | no (root) |
| openSUSE | `sudo zypper install kicad` | no (root) |
| any Linux with flatpak | `flatpak remote-add --user … flathub` + `flatpak install --user flathub org.kicad.KiCad` | yes, per user, no root (about 1.5 GB) |
| macOS | `brew install --cask kicad` | yes, if Homebrew is installed |
| Windows | `winget install --id KiCad.KiCad -e` | yes, if winget is available (Windows may ask for permission) |
| everywhere | installer from kicad.org | link |

Nothing runs until you click **Install…** and confirm the exact command. dsh never runs `sudo`: root-only options are shown for you to run in a terminal, then **Check again**. A running install shows its log and can be stopped; when it finishes the bridge restarts its sidecar and checks again, so the new kicad-cli (including the Flatpak one, via `flatpak run --command=kicad-cli org.kicad.KiCad`) is used without restarting dsh. From a conversation: `/kicad-install` lists the options, `/kicad-install flatpak --yes` runs one, `/kicad-install status` follows it.

The settings page has no session of its own: it runs these checks through your most recent session, so open or start one first.

## Install

### From source (works today)

```sh
git clone https://github.com/LuYanFCP/dsh-kicad && cd dsh-kicad
pnpm install && pnpm run build
dsh plugin --profile web add "$PWD/packages/kicad-bundle"
dsh web
```

`dsh plugin … add <dir>` links the directory; leaf packages resolve through this checkout's `node_modules`, and dsh maps `@deepseek-ai/*` imports to the running installation. Rebuild and restart dsh after code changes. In the Web UI you can also use **Plugins → Install** with the same absolute path.

### From the plugin market (search inside dsh)

dsh finds plugins through **plugin markets**: JSON indexes you add once. This repository publishes one.

1. **Plugins → Experimental plugins → More → Custom plugin markets**: switch it on. A **Discover** tab appears.
2. **Discover → Add index source**: `https://raw.githubusercontent.com/LuYanFCP/dsh-kicad/main/market/index.json`
3. Search, e.g. `kicad`, `原理图`, `电路板`, `circuit board`, then **Install → Enable now**. No restart needed.

The market entry installs `dist/dsh-kicad`, a single self-contained package built by `pnpm run dist` (`scripts/pack-dist.mjs`), from a pinned Git commit. The same package installs directly:

```sh
dsh plugin --profile web add "git+https://github.com/LuYanFCP/dsh-kicad.git#<commit>&path:/dist/dsh-kicad"
```

To publish a new version: `pnpm run dist`, commit, then add a version to `market/index.json` with that commit and check it with `node market/validate.mjs <dsh>/node_modules/@deepseek-ai/dsh-plugin-market-index`.

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
- The Flatpak path runs kicad-cli as `flatpak run --filesystem=host --filesystem=/tmp --command=kicad-cli org.kicad.KiCad`; this was tested with a stand-in `flatpak`, not a real Flatpak KiCad. The install commands for apt/pacman/zypper/brew/winget are documented but were only exercised on Fedora.
- Checks started from the settings page append `/kicad-doctor` entries to the log of the session they borrow (dsh logs every command).

## License

MIT
