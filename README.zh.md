# dsh-kicad

[English](README.md) | 中文

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）提供 KiCad 支持的原生插件 bundle：让 agent 读取、修改并检查 KiCad 原理图，而设计是否正确由 KiCad 自己（`kicad-cli`）判定。

> 开发者预览版。基于 dsh `0.2.1-rc.2` 与 KiCad `10.0.7` 构建和测试。dsh 插件 API 尚未稳定，所有包都在 `engines.dsh` 中锁定 `>=0.2.1-rc.2 <0.3.0-0`。

## 功能

| 能力 | 说明 |
|---|---|
| **工具**（`kicad_*`） | `read_schematic`、`list_components`、`get_symbol_pins`、`list_nets`（KiCad 网表）、`search_symbols`（已安装符号库）、`erc`、`drc`、`render`（SVG；模型支持图片时附带 PNG 图片）、`export`（网表/BOM）、`create_schematic`，以及原子批量编辑 `edit_schematic`（增删移动元件、设置值/封装/属性、导线、标签、电源符号、结点、不连接标记、引脚到引脚与引脚到网络的连接）。未修改的文件文本逐字节保持不变。 |
| **策略** | 设计修改走 dsh 审批（`ask`）；写操作被单调 guard 限制在会话工作目录内；每次成功修改后自动运行 KiCad ERC 并把结论附加到工具结果；系统提示中注入稳定的 KiCad 工作规范，以及动态的“当前目录中的 KiCad 工程 + 最近一次 ERC”上下文。 |
| **技能** | `kicad-agent-workflow`、`kicad-erc-triage`、`kicad-schematic-design`。 |
| **命令** | `/erc`、`/drc`、`/bom`（不经过模型，作用于工程根设计）、`/kicad-render`。 |
| **Agent 预设** | `eda`：与 standard 类似的工具集 + 电子设计人设。KiCad 工具为全局注册，任何预设都可使用。 |
| **Web 界面** | 右侧边栏 `*.kicad_sch` / `*.kicad_pcb` 查看器（kicad-cli SVG、平移缩放、多图纸、实时刷新、渲染按钮）；ERC/DRC 与原理图修改的对话卡片；sidecar（kicad-cli 路径、Python）与策略（审批、自动 ERC、自动渲染）的设置页。 |
| **独立 MCP server** | Python sidecar 通过 stdio 说 MCP 协议，Claude Code 或 RL 环境可以不经 dsh 直接复用同一套工具。 |
| **KiCad 端（可选）** | IPC 插件，工具栏按钮 “Open in DSH”。 |

## 架构

```
dsh-kicad-bundle  (cordis.patch.yml：全局行 + presets/eda.patch.yml)
├─ dsh-kicad-bridge     Host  ctx.kicad 服务；通过 ctx.subprocess 管理 Python sidecar，以 MCP 通信
│    └─ sidecar/        Python ≥3.10，核心仅用标准库：无损 .kicad_sch S 表达式编辑、符号库、引脚几何、
│                       kicad-cli（ERC/DRC/网表/BOM/SVG）；可选 extra：png（cairosvg）、ipc（kicad-python）
├─ dsh-tool-kicad       Host  kicad_* 工具（defineTool），路径相对会话工作目录解析
├─ dsh-kicad-policy     Host  tools.guard + tools/pre-execute（ask/deny）+ tools/post-execute（自动 ERC）+ 提示词 section/context
├─ dsh-kicad-skills     Host  技能 provider + /erc /drc /bom /kicad-render
└─ dsh-client-ui-kicad  Client sidebarRightTabs 类型 + tool.call.toolview 行 + plugins.row.config 设置页
kicad-plugin/           KiCad IPC 插件（"Open in DSH"）
market/                 插件市场索引示例
```

设计取舍：

- **文件优先、可 headless。** 以文件方式编辑 `.kicad_sch`（S 表达式），用 `kicad-cli` 判定，不依赖 KiCad GUI。IPC API（`kipy`）只是可选的实时通道（`ipc_status`），因为它需要 GUI 运行且同一时间只允许一个客户端。
- **Python sidecar** 而非 Node 直连 IPC：KiCad IPC 是 NNG + protobuf，官方绑定只有 Python。
- **由 KiCad 判定。** ERC/DRC 结论来自 `kicad-cli`，不让模型自判。
- **与 dsh 的耦合集中。** 每个包只通过一个适配模块（`src/dsh.ts`、`src/client/dsh.ts`）接触 dsh API；前端只用公开接缝（`sidebarRightTabs`、keyed slots、`remote.workspaceFiles`、`remote.commands`、配置表单），不 import 任何 dsh Client 包——这也是 dsh 对第三方 UI 插件的要求。

## 环境要求

- dsh `>=0.2.1-rc.2 <0.3`（`npm i -g @deepseek-ai/dsh`），Node `>=22.19`，pnpm 11（源码构建时）
- `PATH` 上的 Python `>=3.10`（`python3`；Windows 为 `python`），核心无需任何 Python 包
- KiCad 8+ 与 `kicad-cli`（已在 10.0.7 测试）。查找顺序：设置项、`$KICAD_CLI`、`PATH`、macOS/Windows 安装目录、Flatpak `org.kicad.KiCad`
- 可选：`rsvg-convert`、ImageMagick 或 `png` extra（PNG 渲染）；`ipc` extra（IPC 通道）

## 安装

### 从源码（当前可用）

```sh
git clone https://github.com/LuYanFCP/dsh-kicad && cd dsh-kicad
pnpm install && pnpm run build
dsh plugin --profile web add "$PWD/packages/kicad-bundle"
dsh web
```

`dsh plugin … add <目录>` 会以 link 方式安装；子包通过本仓库的 `node_modules` 解析，`@deepseek-ai/*` 的 import 由 dsh 映射到正在运行的安装。修改代码后需重新构建并重启 dsh。也可以在 Web 界面 **Plugins → Install** 中填入同一绝对路径。

### 通过 npm / 插件市场

发布到 npm（`pnpm -r publish`）后：`dsh plugin --profile web add dsh-kicad-bundle`；或在 **Plugins → Discover → Add index source** 中添加类似 [`market/index.json`](market/index.json) 的索引（需先启用实验性的 “Custom plugin markets” bundle）。`node market/validate.mjs <dsh>/node_modules/@deepseek-ai/dsh-plugin-market-index` 会用 dsh 自带的校验器检查索引。

目前不支持只指向 `packages/kicad-bundle` 子目录的 Git 源：pnpm 无法从 Git 子目录解析 bundle 的 `workspace:` 兄弟包。请使用 npm 或本地仓库。

## 使用

1. 打开工作区包含 KiCad 工程的会话（侧栏 **Add workspace**），可选择 **EDA agent** 预设。
2. 例如提问：*“在 U1 旁边的 +3V3 与 GND 之间加一个 100 nF 去耦电容，并让 ERC 通过。”* agent 会先读取设计，再发送一次 `kicad_edit_schematic` 批量修改（由你审批），并读取策略自动附加的 ERC 结论。
3. 从 **Workspace files** 打开 `.kicad_sch`：KiCad 标签页显示渲染结果，agent 每次修改后自动刷新；**Render** 按需重新渲染。
4. `/erc`、`/drc`、`/bom` 不经过模型直接运行。
5. 设置位于 **Plugins → KiCad → KiCad bridge / KiCad policy**。

### 独立 MCP server（Claude Code、RL 环境）

```sh
claude mcp add kicad -- uvx --from "git+https://github.com/LuYanFCP/dsh-kicad#subdirectory=packages/kicad-bridge/sidecar" dsh-kicad-sidecar --root .
# 或从源码运行，无需 uv：
PYTHONPATH=packages/kicad-bridge/sidecar/src python3 -m dsh_kicad_sidecar --root /path/to/project
```

`--root`（可重复）限制可访问的目录；`--call <tool> --args '<json>'` 运行单个工具并打印结果。

### KiCad 端 “Open in DSH”（可选）

把 `kicad-plugin/` 复制到 KiCad 的 IPC 插件目录（KiCad 9/10：KiCad 文档目录下的 `plugins`，例如 `~/Documents/KiCad/10.0/plugins/dsh-kicad`），在 **Preferences → Plugins** 中启用 KiCad API，然后重启 KiCad。工具栏按钮会把工程路径复制到剪贴板，并在工程目录下启动 `dsh web`（dsh web 没有指定工作区的参数，请用 **Add workspace** 粘贴路径）。

## 配置

| 行（`cordis.patch.yml` id） | 字段 | 默认值 | |
|---|---|---|---|
| `kicad-bridge` | `launcher` | `python` | `python` 从源码运行 sidecar；`uv` 在 uv 虚拟环境中运行并安装 `uvExtras`（`png`、`ipc`） |
| | `python` *（实时）* | `python3` | 解释器 |
| | `kicadCli` *（实时）* | 自动 | kicad-cli 路径 |
| | `requestTimeoutMs` | `300000` | |
| `kicad-policy` | `approval` *（实时）* | `ask` | 设计修改 `ask` / `allow` |
| | `autoErc` *（实时）* | `true` | 每次修改后运行 ERC |
| | `autoRender` *（实时）* | `true` | 每次修改后刷新侧边栏 SVG |
| | `restrictToWorkspace`、`extraRoots` | `true`、`[]` | 写入范围限制 |
| | `guidance`、`projectContext` | `true` | 提示词 section / 动态上下文 |
| `kicad-tools` | `attachRenders` | `true` | 模型支持图片时附带 PNG |

*（实时）* 字段可在 Plugins 页面修改且无需重启。

## 开发

```sh
pnpm install && pnpm run build
pnpm test            # vitest：Host 包在 dsh 真实 ToolRuntime/SkillRegistry + 真实 sidecar 上测试；Client 在 jsdom 中测试
pnpm run test:py     # pytest：S 表达式 round-trip（KiCad demo 文件）、编辑、kicad-cli、MCP server
python packages/kicad-bridge/sidecar/tests/make_fixtures.py   # 用编辑器本身重新生成测试 fixture
```

无需 API key 的真实 dsh 冒烟测试：安装 bundle 后，在含 KiCad 工程的目录中运行 `dsh --profile web --patch scripts/dsh-smoke/smoke.patch.yml --no-open`，查看 `dsh-kicad-smoke.json`。

前端由 [`scripts/build-client.mjs`](scripts/build-client.mjs) 编译，它复现了 dsh 的模块加载产物格式（`window.__ModuleLoader__.load({ id, factory(require) })`），只把宿主平台模块作为 external。第三方 Host + Client 加载的验证过程见 [`docs/spike-third-party-bundle.md`](docs/spike-third-party-bundle.md)。

## 已知限制

- 以原理图为主。PCB 只支持检查与渲染（`kicad_drc`、`kicad_render`），不支持编辑电路板。
- 编辑覆盖元件、属性、导线、标签、电源符号、结点与不连接标记；不支持创建层次图纸、总线与图形元素。
- 新放置在子图纸中的元件只向上查找一层根图纸来确定 instance 路径；更深的层次可能需要 KiCad 重新标注。
- 只有当模型路由声明支持图片输入且挂载了附件存储时，图片才会传给模型；否则渲染工具只返回 SVG 路径。
- 审批需要交互式审批通道；没有审批通道的 headless 运行会拒绝设计修改，除非设置 `approval: allow`。
- 侧边栏查看器显示 kicad-cli 导出的 SVG，不在浏览器中原生渲染 `.kicad_sch`（曾评估 KiCanvas，但它对新版 KiCad 文件格式的支持滞后）。
- IPC 通道目前只有状态探测和 KiCad 端启动按钮，未实现通过 IPC 实时编辑（KiCad IPC API 以 PCB 为主）。

## 许可证

MIT
