#!/usr/bin/env node
/**
 * Build the vendored KiCanvas viewer (https://github.com/theacodes/kicanvas, MIT)
 * into packages/client-ui-kicad/vendor/kicanvas/kicanvas.js.
 *
 *   node scripts/vendor-kicanvas.mjs [--src /path/to/kicanvas-checkout]
 *
 * Without --src the pinned commit is cloned into a temp directory. Changes made
 * while bundling, so the viewer works inside the dsh Web UI and offline:
 *  - only <kicanvas-embed>/<kicanvas-source> are bundled (no shell, no livereload);
 *  - the Google Fonts <link> that KiCanvas appends to document.body is removed;
 *  - Material Symbols ligature icons are replaced by inline SVGs taken from
 *    @material-symbols/svg-400 (Apache-2.0), so no icon font is needed;
 *  - the SVG sprite URL (zoom icons) is set, which the embed alone does not do;
 *  - <kicanvas-embed theme> is forwarded to the viewer (upstream only reads stored preferences);
 *  - <kicanvas-embed> gains dsh_get_camera()/dsh_set_camera() so live reloads keep pan/zoom;
 *  - customElements.define is guarded, so a plugin reload cannot throw
 *    "already defined".
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build, transform } from 'esbuild'

export const KICANVAS_REPO = 'https://github.com/theacodes/kicanvas.git'
export const KICANVAS_COMMIT = 'b031159eb74aaa7eef2b026fd85d35bc05ff2095'
const ICONS_PACKAGE = '@material-symbols/svg-400@0.48.0'

const root = resolve(import.meta.dirname, '..')
const outDir = join(root, 'packages/client-ui-kicad/vendor/kicanvas')

function checkout() {
  const i = process.argv.indexOf('--src')
  if (i > 0) return resolve(process.argv[i + 1])
  const dir = mkdtempSync(join(tmpdir(), 'kicanvas-'))
  execFileSync('git', ['clone', '--quiet', KICANVAS_REPO, dir], { stdio: 'inherit' })
  execFileSync('git', ['-C', dir, 'checkout', '--quiet', process.env.KICANVAS_COMMIT ?? KICANVAS_COMMIT], { stdio: 'inherit' })
  return dir
}

/** Inline SVG path data for the ligature icon names the embed UI uses. */
function iconPaths(src) {
  const names = new Set()
  const text = execFileSync('grep', ['-rhoE', 'icon="[a-z_]+"|kc-ui-icon>[a-z_]+<|icon: "[a-z_]+"', join(src, 'src')], { encoding: 'utf8' })
  for (const m of text.matchAll(/["> ]([a-z_]+)["<]/g)) names.add(m[1])
  const dir = mkdtempSync(join(tmpdir(), 'msym-'))
  const tgz = execFileSync('npm', ['pack', ICONS_PACKAGE, '--silent'], { cwd: dir, encoding: 'utf8' }).trim().split('\n').pop()
  execFileSync('tar', ['-xzf', tgz], { cwd: dir })
  const paths = {}
  for (const name of [...names].sort()) {
    try {
      const svg = readFileSync(join(dir, 'package/outlined', `${name}.svg`), 'utf8')
      const d = [...svg.matchAll(/<path d="([^"]+)"/g)].map(m => m[1])
      if (d.length) paths[name] = d
    } catch {
      console.warn(`no Material Symbols SVG for "${name}"`)
    }
  }
  return paths
}

const DEFINE_GUARD = `const __dshKicanvasDefine = (name, ctor, options) => { if (!customElements.get(name)) customElements.define(name, ctor, options) };`

function patchPlugin(src, icons) {
  return {
    name: 'dsh-kicanvas-patches',
    setup(b) {
      b.onLoad({ filter: /\.ts$/ }, (args) => {
        let code = readFileSync(args.path, 'utf8')
        code = code.replace(/window\.customElements\.define\(/g, '__dshKicanvasDefine(')
        if (args.path.endsWith(join('kicanvas', 'elements', 'kicanvas-embed.ts'))) {
          const before = code
          code = code.replace(/document\.body\.appendChild\(\s*html`<link[\s\S]*?fonts\.googleapis[\s\S]*?`,?\s*\);?/, '')
          if (code === before) throw new Error('KiCanvas font <link> block not found; update scripts/vendor-kicanvas.mjs')
          // Camera access for live reloads: the host keeps the user's pan/zoom across file updates.
          const anchor = 'custom_resolver: ((name: string) => URL) | null = null;'
          if (!code.includes(anchor)) throw new Error('KiCanvas embed anchor not found; update scripts/vendor-kicanvas.mjs')
          code = code.replace(anchor, `${anchor}

    /** dsh-kicad: current camera of the visible viewer, or null before it loaded. */
    dsh_get_camera(): { x: number; y: number; zoom: number } | null {
        const viewer = (this.#schematic_app ?? this.#board_app)?.viewer as any;
        const camera = viewer?.viewport?.camera;
        return camera ? { x: camera.center.x, y: camera.center.y, zoom: camera.zoom } : null;
    }

    /** dsh-kicad: restore a camera saved with dsh_get_camera(). */
    dsh_set_camera(state: { x: number; y: number; zoom: number }): boolean {
        const viewer = (this.#schematic_app ?? this.#board_app)?.viewer as any;
        const camera = viewer?.viewport?.camera;
        if (!camera) return false;
        camera.center.set(state.x, state.y);
        camera.zoom = state.zoom;
        viewer.draw();
        return true;
    }`)
        }
        if (args.path.endsWith(join('kicanvas', 'elements', 'common', 'app.ts'))) {
          // Upstream gap: <kicanvas-embed theme="…"> never reaches the viewer, which then uses stored preferences.
          const before = code
          code = code.replace(
            'this.#viewer_elm = this.make_viewer_element();',
            'this.#viewer_elm = this.make_viewer_element();\n        const __dshTheme = (this.getRootNode() as ShadowRoot).host?.getAttribute?.("theme");\n        if (__dshTheme) this.#viewer_elm.setAttribute("theme", __dshTheme);',
          )
          if (code === before) throw new Error('KiCanvas app viewer creation not found; update scripts/vendor-kicanvas.mjs')
        }
        if (args.path.endsWith(join('kc-ui', 'icon.ts'))) {
          const before = code
          code = code.replace(
            /} else {\s*return html`<slot><\/slot>`;\s*}/,
            `} else if (__dshIcons[text.trim()]) {
            // One literal so the HTML parser builds the <path>s in the SVG namespace.
            return html\`\${literal\`<svg viewBox="0 -960 960 960" width="48">\${__dshIcons[text.trim()].map((d) => \`<path d="\${d}"></path>\`).join("")}</svg>\`}\`;
        } else {
            return html\`<slot></slot>\`;
        }`,
          )
          if (code === before) throw new Error('KiCanvas icon render() not found; update scripts/vendor-kicanvas.mjs')
          code = code.replace('import { css, html } from "../base/web-components";', 'import { css, html, literal } from "../base/web-components";')
          if (!code.includes('literal }')) throw new Error('KiCanvas icon.ts imports changed; update scripts/vendor-kicanvas.mjs')
          code = `const __dshIcons = ${JSON.stringify(icons)};\n${code}`
        }
        return { contents: (args.path.startsWith(join(src, 'src')) ? `${DEFINE_GUARD}\n` : '') + code, loader: 'ts' }
      })
      b.onLoad({ filter: /\.css$/ }, async (args) => {
        const css = await transform(readFileSync(args.path), { loader: 'css', minify: true })
        return { loader: 'text', contents: css.code }
      })
    },
  }
}

const src = checkout()
const commit = execFileSync('git', ['-C', src, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const icons = iconPaths(src)
const entry = join(src, 'dsh-kicanvas-entry.ts')
writeFileSync(entry, [
  `import { KCUIIconElement } from "./src/kc-ui/icon";`,
  `import { sprites_url } from "./src/kicanvas/icons/sprites";`,
  // The embed imports its schematic/board apps as types only; in KiCanvas's own build they arrive via the shell.
  `import "./src/kicanvas/elements/kc-schematic/app";`,
  `import "./src/kicanvas/elements/kc-board/app";`,
  `import "./src/kicanvas/elements/kicanvas-embed";`,
  `KCUIIconElement.sprites_url = sprites_url;`,
].join('\n'))
mkdirSync(outDir, { recursive: true })
const result = await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  keepNames: true,
  minify: true,
  legalComments: 'none',
  write: false,
  loader: { '.glsl': 'text', '.svg': 'text', '.kicad_wks': 'text' },
  define: { DEBUG: 'false' },
  plugins: [patchPlugin(src, icons)],
  logLevel: 'warning',
  metafile: true,
})
if (process.env.KICANVAS_META) writeFileSync(process.env.KICANVAS_META, JSON.stringify(result.metafile))
const banner = `/*! KiCanvas ${commit} (https://github.com/theacodes/kicanvas) - MIT License, (c) Alethea Katherine Flowers.
 * Bundled for dsh-client-ui-kicad by scripts/vendor-kicanvas.mjs; see vendor/kicanvas/README.md for changes and third-party notices. */\n`
writeFileSync(join(outDir, 'kicanvas.js'), banner + result.outputFiles[0].text)
copyFileSync(join(src, 'LICENSE.md'), join(outDir, 'LICENSE.md'))
writeFileSync(join(outDir, 'VERSION'), `${commit}\nicons: ${ICONS_PACKAGE} (${Object.keys(icons).length} icons)\n`)
console.log(`vendored KiCanvas ${commit.slice(0, 7)} → ${join(outDir, 'kicanvas.js')} (${result.outputFiles[0].text.length} bytes, ${Object.keys(icons).length} inline icons)`)
