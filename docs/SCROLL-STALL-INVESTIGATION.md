# 单 Markdown 持续滚动卡顿排查

日期：2026-10-27。版本基线：1.0.12。本轮未提交、打包、安装或修改系统设置。

## 复现条件

只打开 `D:/Tools/LightOpt/knowledge_base/lightopt-math-tutorial.md`，不加载任何 PDF。隔离用户数据目录，原文只读；测试检查文档大小和修改时间保持不变。

固定窗口为 1200 × 800，编辑区高度 618。通过 Electron `sendInputEvent` 每 25 毫秒注入一次滚轮，每次 60 像素；不等待每次 CDP 输入确认。主进程计时器仍会受其自身阻塞影响，不能把注入次数当成物理鼠标频率。

每 800 次输入改变方向，让较长采样能继续覆盖正文。表格工具栏修复后默认模式在首次向下滚动期间已出现长停顿，故向上回滚并非必要条件。

同时记录渲染帧间隔、长任务、主进程定时器间隔及 Chromium 时间线。主进程或渲染进程间隔超过 1500 毫秒，或累计三次超过 250 毫秒时停止输入。性能采样测试通过只代表采样成功及文档未修改，不代表性能达标。

## 有效样本

| 场景                                 | 实际输入时长 | 输入次数 | 最长主进程计时器间隔 | 最长 AX 任务 | 最长渲染帧间隔 | 停止阈值 |
| ------------------------------------ | -----------: | -------: | -------------------: | -----------: | -------------: | -------- |
| 原构建，默认无障碍                   |     约 34 秒 |      834 |             590.8 ms |     581.4 ms |       246.0 ms | 已触发   |
| 表格工具栏修复，默认无障碍           |      约 9 秒 |      192 |             629.2 ms |     616.2 ms |       262.5 ms | 已触发   |
| 同一修复构建，性能兼容模式           |     约 61 秒 |     1932 |              73.6 ms |         0 ms |       100.0 ms | 未触发   |
| 同一修复构建，默认无障碍，关闭缩略图 |     约 16 秒 |      336 |             580.3 ms |     560.6 ms |       220.9 ms | 已触发   |

原构建的低频 CDP 滚轮样本也滚过整份文档，但未捕获超过 250 毫秒的停顿，说明仅用三次滚动或等待每次输入确认的测试会漏掉长时间场景。

早期 Windows 前台输入尝试没有实际推动文档，已排除；对应辅助脚本已删除。一次完整细粒度时间线因单次 JSON 序列化超过字符串大小限制而失败，也不作为成功对照。后续改为分批写入时间线，并减少高频合成器事件。

样本位于仓库 `.tools/real-pdf-perf/`，本轮有效文件前缀为：

- `direct-scroll-default-20261027`
- `table-guard-default-20261027`
- `table-guard-performance-20261027`
- `no-minimap-default-20261027`

## 已确认的阻塞

长主进程任务来自 Chromium 的 `content/browser/accessibility/render_accessibility_host.cc` 中 `HandleAXEvents`，线程名为 `CrBrowserMain`。同一任务对应约 581 或 616 毫秒的阻塞；页面渲染帧间隔有时仍小于 250 毫秒，因此不能只看页面帧率。

关闭缩略图后仍有约 561 毫秒的同类任务。PDF 和缩略图都不是这条长停顿的必要条件。

在固定窗口的性能兼容模式样本中，实际无障碍模式数组为空，AX 任务为零，连续滚动 61 秒未触发严重停顿阈值。这支持无障碍树处理是当前场景的重要阻塞源，但该模式关闭了辅助技术支持，只是显式绕过方案。

该对照的渲染帧间隔 P95 仍为 50 毫秒，存在 50 至 89 毫秒的渲染长任务。它不等于高刷新率下完全流畅，也不能用来宣布全部问题修复。

未进行 Windows 内核、DPC 或整个系统 GPU 调度采样，因此目前不能证明这条任务解释了所有操作系统级停顿。公式延迟可见性机制仍需独立对照；尚不能把它直接认定为主因。

## 本轮源码修复

`packages/desktop/src/renderer/src/components/tableTools/index.vue` 的 `refresh` 原先即使没有活动表格，也先调用编辑区 `getBoundingClientRect()`。窗口捕获阶段的每次滚动都会调度这个函数，迫使大型公式文档同步布局。

现在先检查有效表格上下文和真实表格元素；不存在时清空工具栏并立即返回，不再读取编辑区几何。有效表格的定位逻辑保持不变。

原构建 CPU 样本中，该表格工具栏几何调用栈累计约 2471 毫秒；修复后的默认及 61 秒兼容模式样本中，该调用栈样本耗时均为零。不同样本时长不同，不能把总耗时直接换算为整体性能提升比例。

这项修复消除了无效布局，未消除默认模式的 AX 主阻塞，不能将其称为完整修复。

## 验证

新增 `table-tools-layout.spec.ts`，运行真实组件 setup 逻辑，三项测试通过：非表格连续 100 次刷新不测量编辑区；无效或缺失表格不测量编辑区；有效表格仍正确定位。

本地构建、项目类型检查、修改及新增文件 ESLint、`git diff --check` 通过。未运行完整桌面 E2E 套件，避免同时启动更多应用干扰实机性能。

复测示例，从仓库根目录 PowerShell 执行：

```powershell
$env:LIGHTOPT_PERF = '1'
$env:LIGHTOPT_PERF_ACK_SYSTEM_STALL = '1'
$env:LIGHTOPT_PERF_ACCESSIBILITY = 'default'
$env:LIGHTOPT_PERF_MINIMAP = '1'
$env:LIGHTOPT_PERF_SCROLL_MS = '60000'
$env:LIGHTOPT_PERF_MODE = 'manual-scroll-default'
pnpm -C packages/desktop exec playwright test markdown-scroll-performance.spec.ts --workers=1 --reporter=line
```

测试只运行单个隔离实例。切换为 `performance` 只影响该测试实例；不修改用户正常启动模式。不要同时运行其他 Electron 性能测试。

---

# 斜向拖动边角卡顿排查（第二轮）

日期：2026-10-27。版本基线：1.0.13。用户反馈斜向同时拖动上下与左右边界时，拖动过程持续卡顿。

## 此前测试的盲区

已有 `pdf-real-resize.spec.ts` 全部通过 `win.setBounds()` 单次改尺寸，且只改宽或只改高。用户实际拖动边角时，宽高在同一手势内高频连续变化，且走 Windows 原生模态循环（`WM_ENTERSIZEMOVE` / `WM_EXITSIZEMOVE`），与单次 `setBounds` 的时序完全不同，因此旧用例通过不代表拖动流畅。

新增 `corner-resize-performance.spec.ts`：在主进程用 24 毫秒间隔交替放大缩小约 120 像素，宽高同时变化，模拟真实斜向拖动。

## 根因

`accessibilityModes` 为 `nativeAPIs, webContents, extendedProperties`，即 Chromium 在维护完整无障碍树。缩放期间每一帧都会触发一次无障碍树序列化，任务运行在 `CrBrowserMain`（`HandleAXEvents`）。

本文档有 653 个顶层区块、29135 个 DOM 节点、381 个 KaTeX 公式（其中 6412 个 MathML 节点、14907 个 KaTeX HTML 节点）。全量序列化一次的最长任务达 3665 毫秒，主进程计时器间隔最长 1883 毫秒，渲染帧最长 1008 毫秒。

对照数据：

| 场景                             |        最长 AX 任务 | 最长主进程阻塞 | 最长渲染帧 |
| -------------------------------- | ------------------: | -------------: | ---------: |
| 默认（基线）                     |             3665 ms |        1883 ms |    1008 ms |
| 关闭无障碍（`performance`）      |                0 ms |          73 ms |     325 ms |
| 隐藏 `.katex-mathml`             |             1031 ms |         461 ms |     458 ms |
| 取消 `content-visibility` 隔离   | 主进程阻塞 29184 ms |              — |    1021 ms |
| 仅手势期间裁剪离屏区块（已采纳） |              483 ms |          78 ms |     208 ms |

隐藏 MathML 只把任务从 3665 毫秒降到 1031 毫秒，说明膨胀来源是整棵可见子树的规模，而不是 KaTeX 的 MathML 副本。取消 `content-visibility` 后阻塞反而暴涨到 29 秒，进一步说明参与序列化的节点总量是决定因素。

## 修复

新增 `packages/desktop/src/renderer/src/util/accessibilityPruner.ts`，在原生缩放手势期间给视口外（含 400 像素外扩）的顶层区块加 `aria-hidden="true"`，把 649 / 653 个区块移出无障碍树，视口内只剩 4 个区块、27 个节点。

关键取舍：

- 只改 `aria-hidden`，不改布局。`scrollHeight` 保持 47846 与基线完全一致，无需重新测量。此前实验过用 `content-visibility` + `contain-intrinsic-size` 预测量块高度，滚动高度出现 680 至 12000 像素偏差，已放弃。
- 只在手势期间生效。挂到已有的 `mt::window-resize-state`（`WM_ENTERSIZEMOVE` / `WM_EXITSIZEMOVE`）上，松手立即恢复，静止状态下读屏软件看到的仍是完整文档。
- 分批恢复。一次性移除 600+ 个区块的 `aria-hidden` 会让 Chromium 在同一轮里遍历整棵子树，松手瞬间产生约 700 毫秒主进程停顿；改为每帧恢复 40 个区块。
- 焦点保护。包含 `document.activeElement` 的区块一律不裁剪，避免给光标所在区块的祖先加 `aria-hidden`。
- 空闲兜底。拖动期间用 `resize` 事件续期，一旦尺寸停止变化 2 秒即自动恢复，防止手势结束消息丢失后内容被永久隐藏。

## 复测

连续斜向拖动 10 秒、316 次尺寸变更：主进程计时器最长间隔 78 毫秒，无任何超过 150 毫秒的停顿；渲染帧间隔 P95 为 8.4 毫秒，最长 208 毫秒，超过 250 毫秒的帧为 0；超 100 毫秒的帧从 11 个降到 1 个。手势结束后 `aria-hidden` 区块数归零，无障碍树完整恢复。

## 验证

新增 `test/unit/specs/accessibility-pruner.spec.ts`，7 项测试通过：裁剪范围、布局几何不变、分批恢复、新手势取消待执行恢复、销毁后无副作用、焦点区块保护、长时间拖动下的空闲续期。

`pnpm run typecheck` 通过；本次改动文件的 ESLint 无错误（仓库其余文件存在 330 个历史遗留错误，与本轮无关）。

复测命令：

```powershell
$env:LIGHTOPT_PERF = '1'
$env:LIGHTOPT_PERF_ACK_SYSTEM_STALL = '1'
$env:LIGHTOPT_PERF_SIMULATE_GESTURE = '1'
$env:LIGHTOPT_PERF_RESIZE_MS = '10000'
$env:LIGHTOPT_PERF_MODE = 'corner-final'
pnpm -C packages/desktop exec playwright test corner-resize-performance.spec.ts --workers=1 --reporter=line
```

`LIGHTOPT_PERF_SIMULATE_GESTURE=1` 会通过主进程发送真实的手势开始与结束消息，从而覆盖生产代码里的裁剪器；不设置该项则测量未裁剪的基线。

---

# 滚轮滚动卡顿排查（第三轮）

日期：2026-10-27。版本基线：1.0.14。用户反馈斜向拖动已缓解，卡顿集中在上下滚动滚轮。

## 缩放手势方案为何不覆盖滚动

第二轮把裁剪挂到 `mt::window-resize-state` 上，只在 Windows 原生缩放模态循环内生效。滚轮滚动不进入该循环，因此裁剪器全程不工作，滚动仍逐帧触发全量无障碍树序列化。

## 复现窗口越大越明显

同一文档在 1200 × 800 窗口连续滚动 60 秒，AX 任务仅 116 毫秒；在 1920 × 1120 窗口下 40 秒内累计 12280 毫秒、单次最长 615 毫秒。窗口越大视口内可见区块越多，参与序列化的子树越大，与第二轮"节点总量决定开销"的结论一致。小窗口采样会系统性低估问题，后续必须用大窗口复现。

## 失效两次的真实原因

改为持续裁剪后，生产环境实测 `aria-hidden` 区块数始终为 0。两次都出在"裁剪器拿不到正确的 DOM 引用"，不是阈值或概率问题：

1. 容器查找早于渲染。`surface.querySelector('.mu-container')` 在挂载回调里执行，此时 Muya 尚未渲染出该列，代码回退到引擎根节点本身，该节点永远没有 120 个直接子元素，`attempt()` 恒失败且无人重试。修复为每次尝试时重新解析容器。
2. 滚动根用错节点。`editorRef.value` 指向 `.editor-component` 占位节点，而 Muya 用 `originContainer.replaceWith(newContainer)` 替换了它，`domNode` 才是真正的滚动容器。该占位节点已脱离文档、高度恒为 0，`ResizeObserver` 因此永不触发，裁剪器一直停在"端口未就绪"。修复为直接用 `muya.domNode` 作为滚动根与引擎根。

这两处都只能通过在生产构建里读取真实状态发现，单元测试用的合成 DOM 无法暴露。

## 修复后的数据

1920 × 1120，连续注入滚轮 40 秒，653 个区块中裁剪 632 个，视口内 11 个区块全部保留，`scrollHeight` 保持 47575：

| 指标             | 裁剪失效（基线） |                裁剪生效 |
| ---------------- | ---------------: | ----------------------: |
| 单次最长 AX 任务 |         615.2 ms |                 72.0 ms |
| 累计 AX 任务耗时 |         12280 ms |                 7296 ms |
| 最长渲染帧       |         287.5 ms |                 83.4 ms |
| 主进程最长阻塞   |         854.5 ms | 未出现 250 毫秒以上停顿 |

单次 AX 任务降到原来的约八分之一，长帧消失。累计 AX 仍有余量，因为 600 像素外扩带内的区块自身也很大（单块含大量 KaTeX 节点），滚动时不断换入换出。

## 已知取舍

持续裁剪而非仅手势期间裁剪，读屏用户需要把虚拟光标移到某区块上（该区块随之滚入视口并自动恢复）才能读到它，而不是一次遍历全文。600 像素外扩带与焦点保护降低了误判概率，但这确实是行为变化，不是纯性能优化。

## 验证

`test/unit/specs/accessibility-pruner.spec.ts` 扩到 12 项，新增"容器晚于首次刷新创建""后续编辑新增区块被跟踪"两项，对应上面两个失效原因。

`markdown-scroll-performance.spec.ts` 增加两条硬断言：离屏区块必须至少裁剪一个，视口内区块必须一个都没被裁剪。此前该测试能通过而裁剪完全没生效。

复测命令（必须在仓库根目录，且先 `pnpm run build:unpack`）：

```powershell
$env:LIGHTOPT_PERF = '1'
$env:LIGHTOPT_PERF_ACK_SYSTEM_STALL = '1'
$env:LIGHTOPT_PERF_WINDOW_W = '1920'
$env:LIGHTOPT_PERF_WINDOW_H = '1120'
$env:LIGHTOPT_PERF_SCROLL_MS = '40000'
$env:LIGHTOPT_PERF_STOP = '0'
$env:LIGHTOPT_PERF_MODE = 'scroll-pruned-final-1920'
pnpm -C packages/desktop exec playwright test markdown-scroll-performance.spec.ts --workers=1 --reporter=line
```

`LIGHTOPT_PERF_STOP=0` 关闭早停，才能得到可比较的完整样本。
