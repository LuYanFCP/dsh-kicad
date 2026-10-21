# dsh-kicad

[English](README.md) | 中文

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）提供 KiCad 支持的原生插件 bundle：让 agent 读取、修改并检查 KiCad 原理图，而设计是否正确由 KiCad 自己（`kicad-cli`）判定。

> 开发者预览版。基于 dsh `0.2.1-rc.2` 与 KiCad `10.0.7` 构建和测试。dsh 插件 API 尚未稳定，所有包都在 `engines.dsh` 中锁定 `>=0.2.1-rc.2 <0.3.0-0`。

## 功能

| 能力 | 说明 |
|---|---|
| **工具**（`kicad_*`） | `doctor`（检查本机是否就绪：kicad-cli 与 KiCad 8+、库、Python，附修复方法和安装命令）、`read_schematic`、`list_components`、`get_symbol_pins`、`list_nets`（KiCad 网表）、`search_symbols`（已安装符号库）、`erc`、`drc`、`render`（SVG；模型支持图片时附带 PNG 图片）、`export`（网表/BOM）、`create_schematic`，以及原子批量编辑 `edit_schematic`（增删移动元件、设置值/封装/属性、导线、标签、电源符号、结点、不连接标记、引脚到引脚与引脚到网络的连接）。未修改的文件文本逐字节保持不变。 |
| **策略** | 设计修改走 dsh 审批（`ask`）；写操作被单调 guard 限制在会话工作目录内；每次成功修改后自动运行 KiCad ERC 并把结论附加到工具结果；系统提示中注入稳定的 KiCad 工作规范，以及动态的“当前目录中的 KiCad 工程 + 最近一次 ERC”上下文。 |
| **技能** | `kicad-agent-workflow`、`kicad-erc-triage`、`kicad-schematic-design`。 |
| **命令** | `/erc`、`/drc`、`/bom`（不经过模型，作用于工程根设计）、`/kicad-render`、`/kicad-doctor`（环境检查）、`/kicad-install`（安装 KiCad，见下文）。 |
| **Agent 预设** | `eda`：与 standard 类似的工具集 + 电子设计人设。KiCad 工具为全局注册，任何预设都可使用。 |
| **Web 界面** | 右侧边栏 `*.kicad_sch` / `*.kicad_pcb` 查看器，两种模式：**交互**——内嵌 [KiCanvas](https://github.com/theacodes/kicanvas)（层次图纸、查看元件/封装/网络、图层开关、KiCad 或 Witch Hazel 主题、文件变化时自动刷新）；**SVG**——kicad-cli 渲染（平移缩放、多图纸、渲染按钮，也是交互模式失败时的自动回退）；ERC/DRC、原理图修改与环境检查的对话卡片；sidecar（kicad-cli 路径、Python，以及 KiCad 环境检查和 **安装 KiCad**）与策略（审批、自动 ERC、自动渲染）的设置页。KiCad 缺失或版本过低时，查看器和失败的工具卡片会显示带 **安装 KiCad** 按钮的提示。 |
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

### 检查环境与安装 KiCad

**Plugins → KiCad → KiCad bridge** 页面显示环境检查：每一项（kicad-cli、KiCad 版本 ≥ 8、符号库与封装库、Python ≥ 3.10、可选的 PNG 光栅化工具和 kicad-python）都有状态和修复方法。对话里用 `/kicad-doctor` 查看同样的结果，模型可调用 `kicad_doctor`；因缺少 KiCad 而失败的工具会在错误信息里给出安装命令。

KiCad 缺失或版本过低时，该页面（以及查看器里的提示）会列出本机可用的安装方式：

| 平台 | 方式 | 能否由 dsh 执行 |
|---|---|---|
| Fedora | `sudo dnf install -y kicad` | 否：需要 root，提供 **复制命令** |
| Ubuntu 及衍生版 | KiCad PPA：`sudo add-apt-repository -y ppa:kicad/kicad-10.0-releases && sudo apt-get update && sudo apt-get install -y kicad` | 否（root） |
| Debian | `sudo apt-get install -y kicad` | 否（root） |
| Arch | `sudo pacman -S --needed kicad kicad-library` | 否（root） |
| openSUSE | `sudo zypper install kicad` | 否（root） |
| 装有 flatpak 的任意 Linux | `flatpak remote-add --user … flathub` + `flatpak install --user flathub org.kicad.KiCad` | 可以，按用户安装、无需 root（约 1.5 GB） |
| macOS | `brew install --cask kicad` | 可以（需已安装 Homebrew） |
| Windows | `winget install --id KiCad.KiCad -e` | 可以（需有 winget，Windows 可能弹出授权） |
| 所有平台 | kicad.org 安装包 | 链接 |

点击 **安装…** 并确认显示的完整命令之前，不会执行任何操作。dsh 从不执行 `sudo`：需要 root 的方式只展示命令，请在终端中自行执行后点 **重新检查**。安装过程显示日志、可随时停止；结束后 bridge 会重启 sidecar 并重新检查，新的 kicad-cli（包括通过 `flatpak run --command=kicad-cli org.kicad.KiCad` 运行的 Flatpak 版）无需重启 dsh 即可使用。对话中：`/kicad-install` 列出安装方式，`/kicad-install flatpak --yes` 执行其中一种，`/kicad-install status` 查看进度。

设置页本身没有会话，检查会借用你最近的会话执行，因此请先打开或新建一个会话。

## 安装

### 从源码（当前可用）

```sh
git clone https://github.com/LuYanFCP/dsh-kicad && cd dsh-kicad
pnpm install && pnpm run build
dsh plugin --profile web add "$PWD/packages/kicad-bundle"
dsh web
```

`dsh plugin … add <目录>` 会以 link 方式安装；子包通过本仓库的 `node_modules` 解析，`@deepseek-ai/*` 的 import 由 dsh 映射到正在运行的安装。修改代码后需重新构建并重启 dsh。也可以在 Web 界面 **Plugins → Install** 中填入同一绝对路径。

### 直接粘贴仓库地址（最简单）

在 dsh 里 **Plugins → Add plugin**，填 `https://github.com/LuYanFCP/dsh-kicad` 后安装（或运行 `dsh plugin --profile web add https://github.com/LuYanFCP/dsh-kicad`）。仓库根目录本身就是 `dsh-kicad` bundle，会加载预构建好的 `dist/dsh-kicad`。在地址后加 `#<tag 或 commit>` 可以固定版本。

### 通过插件市场（在 dsh 里搜索安装）

dsh 通过**插件市场**检索插件：添加一次市场索引（JSON）即可搜索。本仓库发布了一个索引。

1. **Plugins → Experimental plugins → More → Custom plugin markets** 打开，出现 **Discover** 标签。
2. **Discover → Add index source** 填入：`https://raw.githubusercontent.com/LuYanFCP/dsh-kicad/main/market/index.json`
3. 搜索 `kicad`、`原理图`、`电路板`、`circuit board` 等，点 **Install → Enable now**，无需重启。

市场条目从固定的 Git commit 安装 `dist/dsh-kicad`：由 `pnpm run dist`（`scripts/pack-dist.mjs`）生成的单个自包含包。也可以直接安装：

```sh
dsh plugin --profile web add "git+https://github.com/LuYanFCP/dsh-kicad.git#<commit>&path:/dist/dsh-kicad"
```

发布新版本：`pnpm run dist` 并提交，然后在 `market/index.json` 中用该 commit 增加一个版本，并用 `node market/validate.mjs <dsh>/node_modules/@deepseek-ai/dsh-plugin-market-index` 校验。

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
- 交互查看器是 KiCanvas，由 `scripts/vendor-kicanvas.mjs` 按固定 commit 打包进插件（离线、图标、主题等补丁见 `packages/client-ui-kicad/vendor/kicanvas/README.md`）。它能解析 KiCad 10 文件，但会忽略尚不认识的新字段；SVG 模式是 kicad-cli 的准确渲染。需要 WebGL2。
- IPC 通道目前只有状态探测和 KiCad 端启动按钮，未实现通过 IPC 实时编辑（KiCad IPC API 以 PCB 为主）。
- Flatpak 方式以 `flatpak run --filesystem=host --filesystem=/tmp --command=kicad-cli org.kicad.KiCad` 运行 kicad-cli；只用替身 `flatpak` 测试过，未在真实的 Flatpak KiCad 上验证。apt/pacman/zypper/brew/winget 的安装命令只在 Fedora 上验证过展示逻辑。
- 从设置页发起的检查会在被借用会话的日志里留下 `/kicad-doctor` 记录（dsh 会记录每条命令）。

## 许可证

MIT
