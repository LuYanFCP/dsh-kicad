# Spike: can a third-party package ship both a Host and a Client half?

Date: 2026-10-21 · dsh `0.2.1-rc.2` (npm `@deepseek-ai/dsh`) · Node 26.7 · Fedora 44

## Question

Can a package that is *not* part of the dsh monorepo be installed by the dsh plugin manager
and have both its Host plugin (`dsh.bundle` patch → Cordis row) and its Client module
(`dsh.client` + `./client` export) loaded?

## Setup

`spike/hello/` is a plain-JS bundle:

- `package.json` declares `dsh.bundle.patch`, `dsh.client` (`platform: web`), `engines.dsh`,
  and a `peerDependencies` entry on `@deepseek-ai/dsh-tools`.
- `index.js` imports `defineTool` from `@deepseek-ai/dsh-tools` (a *runtime* import, not
  just types), registers `kicad_hello`, and drives one call through `ctx.tools.execute`.
- `client.js` uses the `window.__ModuleLoader__.load({ id, factory(require) })` artifact
  format, registers a right-sidebar tab type for `*.kicad_sch` / `*.kicad_pcb` through
  `ctx.sidebarRightTabs` and its body through the keyed `sidebar.right.pane.tab` slot.

```sh
export DSH_HOME=/tmp/dshhome            # isolated from ~/.dsh
dsh plugin --profile web add /abs/path/to/spike/hello
dsh web --no-open --port 18765
```

## Result: works

| Check | Observation |
|---|---|
| install | `dsh plugin` linked the directory (`link:`), appended it to `dsh.profile.bundles` |
| Host import of `@deepseek-ai/dsh-tools` | resolved to the installation's copy through dsh runtime resolution (peer name present in the runtime table); pnpm's "linked peer" warning is harmless |
| Host execution | `[kicad-spike] [{"type":"text","text":"Hello spike from dsh-kicad"}] isError=false` |
| Client serving | `dsh-kicad-spike-hello/client.js` present in the `/plugins/??…` boot combo |
| Client activation (headless Chromium) | plugin `apply` ran; `ctx.sidebarRightTabs.candidates('…/hw/board.kicad_sch')` → `["kicad-spike","text"]`, `claim()` → `kicad-spike` (extension band outranks the builtin `text` viewer) |

## Consequences for the design

1. One package may carry both halves; the Client half is the package's `./client` export.
   The rest of the design uses separate packages per role, as planned.
2. Host code may import dsh runtime values (`defineTool`) as long as the package lists the
   dsh package under `peerDependencies`. `engines.dsh` is declared so that range alone
   decides compatibility (peers on `@deepseek-ai/dsh-*` would otherwise each be checked).
3. A third-party Client cannot add Remote namespaces (the Remote set is fixed at dsh build
   time). Client → Host calls therefore go through public channels only:
   `ctx.remote.workspaceFiles.*` (read files) and `ctx.remote.commands.execute()`
   (session commands registered by our Host plugins).
4. The Client artifact must be emitted in the module-loader factory format; we build it with
   our own small esbuild wrapper (`scripts/build-client.mjs`) with `react` & co. external
   (resolved from the shell's frozen module table), instead of dsh's internal tsdown preset.
5. Distribution: separate packages + a bundle that depends on them works for npm and for
   local `link:` installs. A Git-subdirectory install of only the bundle cannot resolve
   `workspace:` siblings, so Git distribution needs the leaf packages published (or a
   single-package build) — see README.
