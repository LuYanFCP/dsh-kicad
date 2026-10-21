/** UI copy, registered with the Client locale service under {@link NS}. */
export const NS = 'kicad'

export const en = {
  'viewer.render': 'Render',
  'viewer.rendering': 'Rendering…',
  'viewer.fit': 'Fit',
  'viewer.zoomIn': 'Zoom in',
  'viewer.zoomOut': 'Zoom out',
  'viewer.page': 'Sheet',
  'viewer.empty': 'No render yet. Render this design with KiCad (kicad-cli) to view it here.',
  'viewer.stale': 'The design changed since this render.',
  'viewer.noSession': 'Open a KiCad file from a session workspace to view it.',
  'viewer.failed': 'Could not load the render: {message}',
  'viewer.renderFailed': 'Render failed: {message}',
  'card.erc': 'ERC',
  'card.drc': 'DRC',
  'card.running': 'Running KiCad {kind}…',
  'card.passed': 'passed',
  'card.failed': 'failed',
  'card.counts': '{errors} errors · {warnings} warnings',
  'card.more': '{count} more in the tool result',
  'card.edit': 'Schematic edit',
  'card.editing': 'Editing {file}…',
  'card.changes': '{count} changes',
  'card.autoErc': 'Automatic ERC',
  'settings.bridge': 'KiCad sidecar',
  'settings.kicadCli': 'kicad-cli path',
  'settings.kicadCliHint': 'Empty: $KICAD_CLI, PATH, then standard install locations',
  'settings.python': 'Python interpreter',
  'settings.pythonHint': 'Python 3.10+; empty uses python3 (python on Windows)',
  'settings.policy': 'KiCad edit policy',
  'settings.approval': 'Ask before schematic edits',
  'settings.autoErc': 'Run ERC after every edit',
  'settings.autoRender': 'Refresh the sidebar render after every edit',
  'settings.save': 'Save',
  'settings.saved': 'Saved',
  'settings.rejected': 'The Host refused the change',
  'settings.summaryBridge': 'kicad-cli: {cli}',
  'settings.summaryPolicy': 'Approval: {approval} · auto ERC: {erc}',
  'common.default': 'default',
  'common.on': 'on',
  'common.off': 'off',
} as const

export type KiCadLocaleKey = keyof typeof en

export const zh: Record<KiCadLocaleKey, string> = {
  'viewer.render': '渲染',
  'viewer.rendering': '渲染中…',
  'viewer.fit': '适应',
  'viewer.zoomIn': '放大',
  'viewer.zoomOut': '缩小',
  'viewer.page': '图纸',
  'viewer.empty': '尚未渲染。使用 KiCad（kicad-cli）渲染后即可在此查看。',
  'viewer.stale': '设计文件在本次渲染之后已修改。',
  'viewer.noSession': '请从会话工作区打开 KiCad 文件。',
  'viewer.failed': '无法加载渲染结果：{message}',
  'viewer.renderFailed': '渲染失败：{message}',
  'card.erc': 'ERC',
  'card.drc': 'DRC',
  'card.running': '正在运行 KiCad {kind}…',
  'card.passed': '通过',
  'card.failed': '未通过',
  'card.counts': '{errors} 个错误 · {warnings} 个警告',
  'card.more': '另有 {count} 项见工具结果',
  'card.edit': '原理图修改',
  'card.editing': '正在修改 {file}…',
  'card.changes': '{count} 项改动',
  'card.autoErc': '自动 ERC',
  'settings.bridge': 'KiCad sidecar',
  'settings.kicadCli': 'kicad-cli 路径',
  'settings.kicadCliHint': '留空：依次查找 $KICAD_CLI、PATH 和标准安装位置',
  'settings.python': 'Python 解释器',
  'settings.pythonHint': 'Python 3.10+；留空使用 python3（Windows 为 python）',
  'settings.policy': 'KiCad 修改策略',
  'settings.approval': '修改原理图前请求审批',
  'settings.autoErc': '每次修改后运行 ERC',
  'settings.autoRender': '每次修改后刷新侧边栏渲染',
  'settings.save': '保存',
  'settings.saved': '已保存',
  'settings.rejected': 'Host 拒绝了该修改',
  'settings.summaryBridge': 'kicad-cli：{cli}',
  'settings.summaryPolicy': '审批：{approval} · 自动 ERC：{erc}',
  'common.default': '默认',
  'common.on': '开',
  'common.off': '关',
}

type T = ((key: string, vars?: Record<string, string | number>) => string) | undefined

/** Use the host translator when the slot supplied one, else English. */
export function translate(t: T, key: KiCadLocaleKey, vars: Record<string, string | number> = {}): string {
  const fromHost = t?.(key, vars)
  if (fromHost && fromHost !== key) return fromHost
  return en[key].replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`))
}
