# Windows 窗口缩放停顿

## 复现条件

同时打开以下文件，当前活动标签页必须为 Markdown 教程：

- `D:/Tools/LightOpt/lightopt-paper.pdf`
- `D:/Tools/LightOpt/LightOpt-论文中文翻译.pdf`
- `D:/Tools/LightOpt/knowledge_base/lightopt-math-tutorial.md`

不要并行运行其他 Electron 测试。每次只执行一次最大化恢复、一次小幅边栏操作或一次窗口尺寸变更。真实文档只读，测试使用隔离用户数据目录。

## 已确认的阻塞路径

Chromium 时间线中最长主进程任务的来源为 `content/browser/accessibility/render_accessibility_host.cc` 的 `HandleAXEvents`。保留无障碍的不同样本中，单次任务约为 398 至 1896 毫秒。即使渲染线程帧间隔下降，主进程这条路径仍会长时间阻塞。

公式教程共有 381 个 KaTeX 节点和 168 个块级公式预览。只优化 PDF、延迟最终尺寸提交、切换 Mica 或观察渲染帧率，都不足以验证这条主进程路径已经修复。

启动参数 `--disable-renderer-accessibility` 的隔离 A/B 样本中，`HandleAXEvents` 任务未出现，最长帧间隔约 83 毫秒，窗口宽度恢复误差为零。该样本同时进行了真实的最大化和恢复，记录的窗口宽度为 1200 → 2560 → 1200。此结果支持无障碍树处理是本场景的重要阻塞源，但不等于已经独立测量或排除了所有 Windows 系统线程和 GPU 因素。

运行时调用细粒度无障碍接口没有成功降低本机实际启用的模式，不能将这些样本当作已关闭该模式的有效阴性对照。

最终通过产品环境变量入口验证：最大化恢复最长帧间隔为 95.8 毫秒，边栏调整为 75.1 毫秒，两项主进程 AX 长任务均为零，实际无障碍模式数组均为空，最终宽度误差均为零。两项真实文档复测串行完成，默认模式下的公式占位滚动与点击编辑回归也通过。相关 17 项单元测试、类型检查和构建通过，修改文件的 ESLint 无错误，编辑器保留一项已有排版警告。真实文档的大小与修改时间在复测前后保持一致。

## 保留的修改

对屏幕外非编辑公式预览启用 `content-visibility: auto`，用 ResizeObserver 已计算的高度作为占位，不同步遍历测量所有公式。可编辑源文本、MathML、可见 KaTeX、公式点击进入编辑都保留。源码切换与销毁会释放观察器。

性能测试同时记录渲染帧间隔和主进程 AX 任务，分别设置 250 毫秒的严重停顿停止阈值，不再只用渲染帧率判定成功。诊断时间线可选择启用；真实最大化与恢复的计时在页面内部完成，避免主进程调试往返等待污染操作区间。

试验性的公式无障碍压缩和隐藏 MathML 没有显著降低主进程阻塞，已撤回。默认不关闭无障碍，也不改变 Windows 系统设置。

## 显式性能兼容模式

仅 Windows 平台、且明确设置 `YARKTEXT_ACCESSIBILITY_MODE=performance` 时，应用在启动前添加 `--disable-renderer-accessibility`。默认或其他值不添加，其他操作系统也不添加。

该模式会使 Windows 屏幕阅读器、语音控制以及依赖浏览器无障碍树的桌面自动化无法正常读取编辑区。它是带有功能代价的绕过方案，不是修复 Chromium 实现本身。需要这些功能的用户应保留默认模式。

PowerShell 中运行当前构建：

```powershell
$env:YARKTEXT_ACCESSIBILITY_MODE = 'performance'
pnpm -C D:/Tools/YarkDown run start
```

恢复默认模式后重新启动应用：

```powershell
Remove-Item Env:YARKTEXT_ACCESSIBILITY_MODE -ErrorAction SilentlyContinue
pnpm -C D:/Tools/YarkDown run start
```

这只设置当前 PowerShell 会话的环境变量。关闭窗口或重启应用前应自行保存正在编辑的内容，禁止为切换模式强行终止用户实例。

## 实机复测

先运行 `pnpm run build:unpack`。在仓库根目录的 PowerShell 中：

```powershell
$env:LIGHTOPT_PERF = '1'
$env:LIGHTOPT_PERF_ACK_SYSTEM_STALL = '1'
$env:LIGHTOPT_PERF_ACCESSIBILITY = 'performance'
$env:LIGHTOPT_PERF_TRACE = '1'
$env:LIGHTOPT_PERF_MODE = 'performance-product'
$env:LIGHTOPT_PERF_OPERATION = 'maximize'
pnpm -C packages/desktop exec playwright test pdf-real-resize.spec.ts --workers=1 --reporter=line
```

`LIGHTOPT_PERF_ACCESSIBILITY=default` 测试正常无障碍模式。正常模式已发现严重 AX 停顿，不应反复压力测试。`LIGHTOPT_PERF_OPERATION` 可选 `maximize`、`sidebar`、`edge`，每轮只选一种。性能 JSON 和 Chromium 时间线写入仓库根目录 `.tools/real-pdf-perf/`。

## 官方依据

- [Chromium 无障碍性能分析](https://developer.chrome.com/blog/chromium-accessibility-performance)：描述了渲染线程序列化、浏览器主 UI 线程反序列化及包围盒更新的性能成本。
- [Electron 42 无障碍接口文档](https://github.com/electron/electron/blob/v42.0.0/docs/api/app.md)：定义了细粒度模式和无障碍支持的性能影响。
