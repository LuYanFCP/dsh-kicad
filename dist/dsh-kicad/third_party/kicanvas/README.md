# Vendored KiCanvas

`kicanvas.js` is [KiCanvas](https://github.com/theacodes/kicanvas) (MIT, © Alethea
Katherine Flowers) built by [`scripts/vendor-kicanvas.mjs`](../../../../scripts/vendor-kicanvas.mjs)
at the commit recorded in `VERSION`. Rebuild with `node scripts/vendor-kicanvas.mjs`.

Changes made while bundling (so it runs inside the dsh Web UI and offline):

- only `<kicanvas-embed>` / `<kicanvas-source>` and the schematic/board apps are bundled;
- the Google Fonts `<link>` KiCanvas appends to `document.body` is removed;
- Material Symbols ligature icons are inlined as SVG paths from
  `@material-symbols/svg-400` (Apache-2.0), so no icon font is loaded;
- the SVG sprite URL for the zoom icons is set (the embed alone does not set it);
- `<kicanvas-embed theme>` is forwarded to the viewer (upstream ignores it and uses stored preferences);
- `<kicanvas-embed>` gains `dsh_get_camera()` / `dsh_set_camera()` so live reloads keep the user's pan and zoom;
- `customElements.define` is guarded so re-evaluating the module cannot throw.

Third-party notices (from KiCanvas's `LICENSE.md`): Earcut (ISC), Newstroke font
(CC0 / MIT-like, glyphs under SIL OFL 1.1), Material Symbols (Apache-2.0). Nunito and
Bellota fonts are referenced by KiCanvas CSS but not bundled; the browser falls back
to the dsh UI font.
