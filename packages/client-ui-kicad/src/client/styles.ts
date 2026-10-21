/** Component-scoped CSS. Colors come only from dsh theme tokens (--dsw-alias-*). */
export const CSS = `
.dshk-root{display:flex;flex-direction:column;height:100%;min-height:0;color:var(--dsw-alias-label-primary);font-size:13px}
.dshk-bar{display:flex;align-items:center;gap:6px;padding:6px 8px;border-bottom:1px solid var(--dsw-alias-border-l2);flex-wrap:wrap}
.dshk-btn{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:6px;padding:2px 8px;font:inherit;cursor:pointer;line-height:20px}
.dshk-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dshk-btn:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}
.dshk-select{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:6px;padding:2px 4px;font:inherit}
.dshk-spacer{flex:1}
.dshk-segmented{display:inline-flex;gap:0}
.dshk-segmented .dshk-btn{border-radius:0}
.dshk-segmented .dshk-btn:first-child{border-radius:6px 0 0 6px}
.dshk-segmented .dshk-btn:last-child{border-radius:0 6px 6px 0;border-left:0}
.dshk-segmented .dshk-btn[aria-pressed=true]{background:var(--dsw-alias-interactive-bg-hover);font-weight:600}
.dshk-kicanvas{cursor:default}
.dshk-live{position:absolute;left:8px;bottom:8px;z-index:2;display:flex;align-items:center;gap:6px;padding:2px 8px;border-radius:10px;font-size:12px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);pointer-events:none}
.dshk-live-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-success-primary)}
.dshk-live-busy{background:var(--dsw-alias-state-warn-primary);animation:dshk-pulse 1s ease-in-out infinite}
.dshk-live-stale{color:var(--dsw-alias-state-warn-label)}
@keyframes dshk-pulse{0%,100%{opacity:1}50%{opacity:.3}}
.dshk-overlay{position:absolute;left:0;top:0;z-index:1}
.dshk-note{padding:6px 10px;color:var(--dsw-alias-label-secondary)}
.dshk-warn{padding:4px 10px;color:var(--dsw-alias-state-warn-label);background:var(--dsw-alias-state-warn-tertiary)}
.dshk-error{padding:6px 10px;color:var(--dsw-alias-state-error-primary)}
.dshk-stage{position:relative;flex:1;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base);cursor:grab;touch-action:none}
.dshk-stage:active{cursor:grabbing}
.dshk-stage img{position:absolute;left:0;top:0;transform-origin:0 0;user-select:none;-webkit-user-drag:none;background:#fff;box-shadow:0 0 0 1px var(--dsw-alias-border-l1)}
.dshk-card{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);margin:4px 0;overflow:hidden}
.dshk-card-head{display:flex;align-items:center;gap:8px;width:100%;padding:6px 10px;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
.dshk-card-head:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dshk-badge{border-radius:10px;padding:0 8px;font-size:12px;line-height:18px}
.dshk-pass{color:var(--dsw-alias-state-success-primary);border:1px solid var(--dsw-alias-state-success-primary)}
.dshk-fail{color:var(--dsw-alias-state-error-primary);border:1px solid var(--dsw-alias-state-error-primary)}
.dshk-muted{color:var(--dsw-alias-label-tertiary)}
.dshk-list{margin:0;padding:4px 10px 8px 10px;list-style:none;border-top:1px solid var(--dsw-alias-border-l1)}
.dshk-list li{padding:3px 0;line-height:18px}
.dshk-sev-error{color:var(--dsw-alias-state-error-primary)}
.dshk-sev-warning{color:var(--dsw-alias-state-warn-primary)}
.dshk-code{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:12px}
.dshk-form{display:flex;flex-direction:column;gap:12px;padding:4px 0}
.dshk-field{display:flex;flex-direction:column;gap:4px}
.dshk-field input[type=text]{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:6px;padding:4px 8px;font:inherit}
.dshk-check{display:flex;align-items:center;gap:8px}
.dshk-hint{color:var(--dsw-alias-label-tertiary);font-size:12px}
.dshk-sev-ok{color:var(--dsw-alias-state-success-primary)}
.dshk-doctor{display:flex;flex-direction:column;gap:6px;padding:6px 0;color:var(--dsw-alias-label-primary)}
.dshk-notice-open{padding:4px 10px;border-bottom:1px solid var(--dsw-alias-border-l2);max-height:60%;overflow:auto}
.dshk-doctor .dshk-list{border-top:0;padding:0 2px}
.dshk-install{display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--dsw-alias-border-l1);padding-top:6px}
.dshk-option{display:flex;flex-direction:column;gap:4px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:6px 8px}
.dshk-cmd{margin:0;padding:4px 6px;border-radius:4px;background:var(--dsw-alias-bg-base);white-space:pre-wrap;word-break:break-all;user-select:all}
.dshk-confirm{display:flex;flex-direction:column;gap:6px;padding:6px 8px;border-radius:6px;border:1px solid var(--dsw-alias-state-warn-primary);background:var(--dsw-alias-state-warn-tertiary)}
.dshk-primary{font-weight:600;border-color:var(--dsw-alias-state-warn-primary)}
.dshk-log{margin:0;max-height:220px;overflow:auto;padding:4px 6px;border-radius:4px;background:var(--dsw-alias-bg-base);white-space:pre-wrap}
a.dshk-btn{text-decoration:none}
`
