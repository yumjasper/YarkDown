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

去掉诊断代码后的发布构建再测 20 秒：单次最长 AX 任务 23.2 毫秒，累计 1382 毫秒，最长渲染帧 92.1 毫秒，无长任务。裁剪 632 / 653，视口内误裁剪数为 0。

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

# 缩略图加载失效与「缩略图 + 目录」滚动卡顿（第四轮）

同一份 `lightopt-math-tutorial.md`，窗口 1600 × 1000，连续注入滚轮 12 秒，四种配置对照：

| 配置             |   p95 | 最长帧 | 长任务数 | 最长任务 |
| ---------------- | ----: | -----: | -------: | -------: |
| 两者都关         | 50 ms |  98 ms |       13 |    69 ms |
| 仅目录           | 37 ms |  58 ms |        9 |    60 ms |
| 仅缩略图         | 54 ms | 121 ms |       21 |   100 ms |
| 两者同开（修前） | 71 ms | 219 ms |       57 |   110 ms |

目录本身几乎不花钱（长任务 9 个，比两者都关还少，滚动宽度同为 1313），主要增量来自缩略图；两者同开时被放大属于叠加效应，不是目录的问题。

## 缩略图打不开的真实原因

`bind()` 里 `if (!scroller) return` 是一次性放弃。缩略图与编辑器是同级异步组件，挂载顺序不确定：缩略图先挂载时，父容器里还没有 `.editor-component`，于是永久放弃，没有任何代码再跑第二次。表现就是 `tiles: 0`、`renderers: []`、滑块恒为 1px，滚动也不会恢复。再加上 Muya 启动后会用 `replaceWith` 换掉占位节点，即使拿到了节点也可能已经脱离文档。

修复：抽出 `resolveScroller()`，解析失败时用 `MutationObserver` 盯着父容器，等编辑器真正出现后重新绑定；每次绑定带一个 `bindGeneration` 代号，过期的等待会被自己停掉，避免重复绑定。

同时把无障碍播报值与定位样式的重置从 `bind()` 的成功路径里拆出来。`positionHost()` 在解析 scroller 之前执行，`plainText → Markdown` 切换时缩略图会重新挂载，若沿用 TXT 分支写入的 `top`/`bottom`，高度会塌成 0。

## 滚动卡顿的三个来源

1. 滚动帧内读布局。`syncScroll` 原本每次滚轮事件都读 `scrollHeight`/`clientHeight`，强制同步布局。改为只读 `scrollTop`，尺寸由 `ResizeObserver` 驱动的 `rebuild()` 维护。
2. 滚动帧内读样式。`getComputedStyle(host)` 每帧执行一次强制样式重算，`clientWidth` 同理。两者都加缓存，失效点分别是主题 watch 与 `rebuild()`。
3. `aria-valuenow` 每帧重写。缩略图是 `role="scrollbar"`，逐事件改写这个属性会让浏览器重建无障碍节点——与第二、三轮的根因同类。改为每滚过文档 1% 播报一次，滚动停止 700ms 后再对齐最终值。

时序也一并修了：`aria` 播报必须在 `scrollRange` 列变化之后才写，否则在 `geometry` 未就绪时会退化成逐事件写入。

## 修复后的数据

同一配置（缩略图 + 目录同开），1600 × 1000，各 15 秒：

| 阶段                    |   p95 | 最长帧 | 长任务数 | 最长任务 | 严重掉帧 |
| ----------------------- | ----: | -----: | -------: | -------: | -------: |
| 修复前                  | 71 ms | 219 ms |       57 |   110 ms |        1 |
| 去掉布局读取 + 缓存样式 | 58 ms | 188 ms |       42 |    84 ms |        0 |
| 再节流 `aria-valuenow`  | 42 ms | 146 ms |        2 |    54 ms |        0 |
| 重复采样                | 50 ms | 213 ms |       21 |    66 ms |        0 |
| 第三次采样              | 46 ms | 163 ms |        6 |    62 ms |        0 |

p95 从 71 ms 降到 42–50 ms，已经优于「两者都关」的 50 ms；长任务从 57 个降到 2–21 个；严重掉帧归零。

用 Long Animation Frame 分解剩余的长帧（181 ms 那一次）：`blocking: 0`，`styleAndLayout: 1 ms`，`render: 1 ms`，`scripts: []`。即脚本、样式、布局、绘制全部接近零，耗时落在浏览器内部合成路径上，已经没有可继续压的脚本面。

## 已知取舍

`syncScroll` 不再每帧读 `scrollHeight`/`clientHeight`，改由 `ResizeObserver` 驱动的 `rebuild()` 维护。若文档在容器尺寸不变的前提下动态增高（例如异步图片加载完成），滑块高度会短暂偏小，直到下一次 `rebuild()` 触发。这是用极罕见的瞬时偏差换掉每帧强制布局。

`aria-valuenow` 改为按 1% 步进播报、停止后再对齐，读屏用户读到的位置会有至多 1% 的滞后。

## 验证

`test/e2e/minimap.spec.ts` 在切到 Markdown 后新增两条硬断言：瓦片必须来自 worker，滑块高度必须 ≥ 12px。修复前这两条都会失败（此前该测试在这一步只做 `toBeVisible()`，而 DOM 里同时存在 TXT 分支遗留的缩略图，strict mode 直接报解析到 2 个元素）。

TXT 工作区本身用 `v-show` 保活，缩略图挂载条件补上 `active`，否则隐藏期间仍会为 0 高度容器持续重建瓦片，并在 Markdown 标签下留下第二个 `.editor-minimap`。

`test/e2e/minimap-scroll-performance.spec.ts` 在采样前断言 `tiles > 0` 且每个瓦片的 `data-renderer` 都是 `worker`，避免在空白缩略图上采到没有意义的数据。

复测命令：

```powershell
$env:LIGHTOPT_PERF = '1'
$env:LIGHTOPT_PERF_SCROLL_MS = '15000'
$env:LIGHTOPT_PERF_MODE = 'minimap-on-toc-on'
pnpm -C packages/desktop exec playwright test minimap-scroll-performance.spec.ts --workers=1 --reporter=line
```

# 每帧失效的真正来源（第五轮）

同一份文档，1600 × 1000，缩略图 + 目录同开，注入滚轮 12 秒。第四轮把 p95 从 71 ms 压到 42–50 ms 后仍有肉眼可见的顿挫，本轮的结论是：主要成本不在缩略图，而在一个每帧都在写样式的浮动按钮。

## 方法：失效追踪

在此之前试过 CDP session、Profiler 顶部函数、`PerformanceObserver` 长任务，都只看到「`(program)` 占 99%」这类无信息的结果。真正定位靠的是 Blink 的失效追踪类别：

```ts
await cdp.send('Tracing.start', {
  categories: 'devtools.timeline,disabled-by-default-devtools.timeline.invalidationTracking',
  options: 'record-until-full'
})
```

它输出的 `LayoutInvalidationTracking` / `StyleRecalcInvalidationTracking` 直接给出「哪个节点、因为什么原因」失效，6 秒滚动汇总如下：

```text
348  layout | DIV | (无 class 变化)
348  style  | DIV.mu-front-button-wrapper
```

即 `.mu-front-button-wrapper` 每帧被写一次。

## 根因：floating-ui `autoUpdate`

`packages/muya/src/ui/paragraphFrontButton/index.ts` 的 `show()` 用 `autoUpdate(domNode, floatBox, updatePosition)` 跟随被悬停的段落。`autoUpdate` 会监听所有可滚动祖先的 `scroll` 事件，并逐帧重跑 `computePosition`，随后把 `left` / `top` / `opacity` 写进浮层内联样式。

一个 `position: absolute; z-index: 1000` 的浮层在 47 000 px 文档上每帧改位置，代价不是一次 `transform`，而是每帧一次 style recalc + layout + commit + paint 覆盖 27 696 个节点。这与第四轮「缩略图 + 目录」叠加放大的现象正好对应。

修复三点：

1. 滚动期间不跟随。捕获阶段在 `document` 上挂 `passive` 滚动监听，滚动开始置 `_scrolling`，`SCROLL_SETTLE_MS = 140` 后清掉并重放一次定位。位置只需要在用户停手时正确。
2. 代次校验。`computePosition` 是异步的，`hide()` 之后迟到的 promise 会把 `opacity: 1` 写回已隐藏的浮层，并在旧坐标重新出现。每次定位自增 `_positionGeneration`，回调不匹配就丢弃。
3. `_status` 提前。首次定位回调会检查浮层是否仍是当前显示的那个，原先 `_status = true` 在 `updatePosition()` 之后，导致第一次放置被丢弃，浮层反而在指针停下后突然出现。

## 缩略图侧的两处剩余开销

- overlay 画布在没有搜索命中、也没有源码模式光标行时仍然每帧 `clearRect`。改为仅在有内容时清屏，并用 `overlayDirty` 保证标记消失时补一次清屏。
- 每个瓦片每帧重写自己的 `translateY`。改为瓦片绝对定位在文档位置，整层只平移一次容器；合成层提示 `will-change: transform` 也从瓦片移到 `.minimap-tiles` / `.minimap-slider`，避免大量嵌套合成层。

## 被否决的两个方向

- 移除 `content-visibility: auto`：`Layout` 从 157 降到 0，但 `Paint` 从 2758 ms 恶化到 6298 ms，最长帧从 4 升到 8，净变差。保留。
- 给滚动容器加 `will-change: scroll-position`：`Commit` 625、`Paint` 1984、p95 21，与不加基本一致。滚动走传统（主线程）路径，该提示不改变路径。

## 修复后的数据

1600 × 1000，缩略图 + 目录同开，12 秒：

| 指标          | 修复前 | 修复后 |
| ------------- | -----: | -----: |
| `Layout` 次数 |    580 |    161 |
| p95 帧间隔    |  38 ms |  25 ms |
| 12 秒帧数     |    630 |    985 |
| 每秒帧数      |  48–57 |  74–85 |
| 长任务        |     有 |      0 |
| 严重掉帧      |     有 |      0 |

pacing 探针视角（每帧间隔 p50 / p95）：16.7 / 33.3 ms → 8.4 / 16.8–20.8 ms；无缩略图对照为 8.3 / 16.6 ms，说明缩略图成本已与「不开缩略图」基本持平。

斜向拖角（用户最初抱怨的场景）复测：`p95` 8.4 ms，`over100` 0，`over250` 0，最长帧 66.8 ms 且 `blocking` 为 0。

## 测量陷阱（两次都白跑了十几轮）

- 滚轮方向。`sendInputEvent` 里 `deltaY = -60` 才是向下滚。`+60` 在 `scrollTop = 0` 时是向上滚，也就是完全不滚动，于是 idle 帧被当成滚动帧，测出「p95 4.3 ms，240 fps」的假象。现在采样前会打印 `scrollBefore` / `scrollTop`，位移为 0 即视为样本无效。
- 窗口失焦。未聚焦窗口的动画帧被节流，p95 会稳定虚高到约 38 ms。采样前必须 `win.focus()`。

## 已知取舍

浮动按钮在滚动期间不跟随，停稳 140 ms 后归位；`aria-valuenow` 按 1% 步进播报；滚动位置延迟写回 store，切换标签走 latch 兜底。三者都是「停手后一致」而非「逐帧一致」。

## 一个既有缺陷的界定

`editor-layout.spec.ts` 在批量运行时超时，被误判为本轮引入。用失效追踪与探针逐步复刻后确认：段落拖拽手柄（`.mu-front-button`）悬停在左侧天沟时会出现，若指针正好停在该位置，下一次点击会被手柄截获。基线同样复现，属既有竞态，与本轮改动无关。

处理方式是不改产品行为，只把该测试里依赖天沟坐标的点击改成 `element.focus()`。测试要的只是「编辑器获得焦点」，用坐标点击是在用副作用达成目的。

## 验证

```powershell
# 滚动性能（需先 pnpm run build:unpack，性能 spec 跑的是 out/ 里的产物）
$env:LIGHTOPT_PERF = '1'
$env:LIGHTOPT_PERF_SCROLL_MS = '12000'
pnpm -C packages/desktop exec playwright test minimap-scroll-performance.spec.ts --reporter=line

# 斜向拖角
$env:LIGHTOPT_PERF = '1'
$env:LIGHTOPT_PERF_ACK_SYSTEM_STALL = '1'
pnpm -C packages/desktop exec playwright test corner-resize-performance.spec.ts --reporter=line
```

回归：`minimap.spec.ts`、`plain-text.spec.ts`、`toc-scroll.spec.ts`、`source-toc-scroll.spec.ts`、`anchor-link-scroll.spec.ts`、`editor-layout.spec.ts`（批量连跑两次稳定通过）、`accessibility-pruner.spec.ts`；muya 全量单测；`vue-tsc --noEmit` 与 `tsc --noEmit`。
