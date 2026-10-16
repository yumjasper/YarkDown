# TXT 独立加载与 MD 统一编辑能力

日期：2026-10-16。应用版本：1.0.10。平台：Windows x64 / Electron 42.1.0。

## 约束与实现

保留 Electron 主应用。TXT 使用独立的最小 CodeMirror 入口，不因打开 TXT 而加载 Markdown 编辑器、Markdown 高亮模式、KaTeX、Mermaid 或 PDF 引擎。应用外壳和纯文本编辑器仍然必要，不能解释为 TXT 不加载任何代码。

MD 源码和预览不分离：进入 MD 工作区时共同加载 editor.vue 和 sourceCode.vue；即使用户默认使用源码，也初始化同一 Muya 实例。CodeMirror 在用户实际使用源码视图时创建；源码界面待共享引擎初始化完成后挂载。切换模式保留 Muya 实例和原有文档历史，不另外维护源码专用保存基线。编辑模式、保存、光标、整段源码修改的单步撤销/重做仍遵循既有行为。

本次取消源码先编辑、以后再创建 Muya 的模式分流，以及 Windows 原生快速入口路线；原生入口源码和测量脚本不保留为产品方案。此前原生实验构建不属于本次交付。

保留和补充的不影响完整 MD 能力的优化：

- 工具栏图标只导入轻量图标路径，TXT 不因图标加载完整编辑引擎。
- 普通文本右键菜单不静态导入 Markdown 表格动作。
- 关于、导出设置、重命名和导入面板首次使用时加载，并回放首次事件。
- 常用基础 UI 控件保留直接注册，其他 UI 控件和对应样式按需加载。
- 小游戏快捷键由轻量入口处理；普通 MD 不加载内嵌游戏界面，只有实际出现游戏占位时才加载游戏卡片，点击运行才加载对应游戏界面。
- TXT 和 MD 的缩略图组件只在启用时创建；没有改变用户已有缩略图设置。
- 源码查找替换直接处理当前可见 CodeMirror，避免隐藏 Muya 同时处理搜索命令；保留目录导航、搜索清理和源码卸载清理。

模块曾被实际使用后，JavaScript 模块缓存不保证卸载。以下冷启动结果不能代表使用过 PDF / 游戏后恢复的占用，也不能代表所有文件大小、所有设备或 Electron 理论下限。

## 测量条件

优化前基线来自本轮开始时的工作区正式包，不是干净 Git HEAD；工作区包含用户此前已有的修改。前后均使用相同的 1.0.10 正式构建版本和相同设备，不与历史文档中的 149.5 MiB 混为同一轮实验。

每个场景三轮，每次独立配置目录。TXT 为 5920 字节，MD 为 5898 字节。分别测首页、单个 TXT、单个 MD 源码和单个 MD 预览。确认界面就绪后空闲 15 秒，采样一次，再等 5 秒采样一次；以下中位数使用各轮第二次采样。

统计主进程及全部子进程的 `WorkingSetPrivate` 和 `PrivateBytes`。前者是私有工作集，后者是私有提交内存，两者不能混淆。没有强制 GC、工作集裁剪、禁用 GPU 或降低安全隔离；没有把 JavaScript 堆当成整个应用的内存。

基线和最终包的测量发生在不同时间；三个样本仍存在显著波动，不能把小幅差异视为统计上已证实的收益。

## 实测结果

单位：MiB，1 MiB = 1048576 字节。下表为进程组中位数。

| 场景 | 基线私有工作集 | 最终私有工作集 | 基线私有提交 | 最终私有提交 |
| --- | ---: | ---: | ---: | ---: |
| 首页 | 133.4 | 135.1 | 283.9 | 276.2 |
| 单个 TXT | 158.0 | 162.1 | 317.6 | 319.7 |
| 单个 MD 源码 | 184.0 | 187.7 | 358.9 | 341.2 |
| 单个 MD 预览 | 167.3 | 171.4 | 331.5 | 325.3 |

最终包各轮私有工作集：

| 场景 | 第一轮 | 第二轮 | 第三轮 |
| --- | ---: | ---: | ---: |
| 首页 | 125.9 | 142.6 | 135.1 |
| 单个 TXT | 162.1 | 167.5 | 153.8 |
| 单个 MD 源码 | 189.1 | 187.7 | 180.1 |
| 单个 MD 预览 | 201.4 | 169.9 | 171.4 |

MD 源码私有提交中位数约下降 4.9%，预览约下降 1.9%，首页约下降 2.7%；TXT 提交约上升 0.6%。四个场景的私有工作集中位数均未下降。本轮不能宣称显著降低常驻内存，也不能用较低的某一轮代替全部样本。

实际已证实的是加载边界与功能完整性：TXT 冷启动没有 Muya；MD 源码冷启动具有一个 Muya 和一个 CodeMirror；MD 预览具有一个 Muya。E2E 通过 CDP `Debugger.scriptParsed` 审计已解析脚本，验证 TXT 无重型编辑引擎、普通 MD 未载入 PDF / Mermaid / 游戏界面。Electron `file:` URL 的 Resource Timing 在本机为空，不能用该空列表证明未加载依赖。

结论：保留 MD 两种模式完整联动之后，业务模块按需加载是合理的启动与资源边界优化，但这轮没有证明整个 Electron 应用常驻工作集获得明显压缩。后续应以进程级归因、缓存生命周期、重复状态和空闲后台活动的实测为依据，不以牺牲编辑能力或指定一个任意内存数字为目标。

## 验证

- `pnpm run test:quick`：桌面 1248 项、Muya 2490 项通过；桌面 36 项跳过。
- `pnpm run typecheck`：通过。
- 本次涉及文件的 ESLint：零错误；editor.vue 的既有属性换行警告保留，没有为了格式警告覆盖用户原有代码。
- 25 项相关 E2E 覆盖 TXT 字节保存、模式切换光标、单步撤销/重做、保存标记、同帧复选框切换、源码目录导航、设置、首次面板、导出和游戏加载。初轮两个新测试错误地将负 z-index 视为 Playwright 的不可见，已按既有 `.editor-wrapper.source` / `pointer-events: none` 状态修正；其余 23 项初轮通过，修正后的相关四项全部通过。
- 正式编译和 ZIP 打包通过。已有 PDF CSS 转换、大 chunk 等非致命构建警告未作无关修改。

## 复现与产物

```powershell
node scripts/measure-text-memory.mjs D:/Tools/YarkDown/dist/text-routing-baseline/win-unpacked/YarkText.exe D:/Tools/YarkDown/.cod-analysis/text-memory-baseline.json 3
node scripts/measure-text-memory.mjs D:/Tools/YarkDown/dist/text-routing-unified/win-unpacked/YarkText.exe D:/Tools/YarkDown/.cod-analysis/text-memory-unified.json 3
```

原始基线报告：`.cod-analysis/text-memory-baseline.json`。
最终包报告：`.cod-analysis/text-memory-unified.json`。
正式 ZIP：`dist/text-routing-unified/yarktext-win-x64-1.0.10.zip`。

`dist/text-routing` 是此前已弃用模式分流实验包，不是最新交付。最新 ZIP 不包含原生入口；本轮没有升级版本、提交 Git、安装应用或修改文件关联。
