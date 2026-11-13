# 日常测试流程

PDF 阅读使用 [Mozilla PDF.js](https://github.com/mozilla/pdf.js)（Apache-2.0），通过
`pdfjs-dist` 固定在 workspace lockfile 中。Worker、CMap、标准字体、WASM 与许可证随
renderer 一起打包，不依赖 CDN。文件菜单、拖放、最近文件、文件树和快速打开均可打开 PDF。
PDF 支持连续滚动、页码跳转、缩放、旋转、文字选择与搜索、密码输入和阅读位置恢复。
旋转后重新定位当前页并调度绘制；旋转和重新加载使用不同 SVG 图标。
提供选择和手形拖拽阅读模式，手形模式拖动时同时移动横向与纵向滚动位置，不创建批注。
记号笔工具栏常驻多种色笔，各色独立记住粗细和文本标记设置；自定义颜色加入色笔列表，已有标记保持原色。
扫描件需要本身含有文字层才能搜索；本次不包含 OCR 和 PDF 正文编辑。
PDF.js 通过受窗口隔离的 IPC 会话按需读取 256 KB 数据块，首屏无需等待全文件读取。
加载提示显示当前阶段、已读取字节与文件大小，首屏绘制后收起；SHA-256 在主进程流式计算，
校验及权限检查完成前可阅读，批注编辑暂不可用。每次分块读取后立即关闭句柄，避免 Windows 原子保存锁冲突。
PDF 目录与缩略图位于全局左侧边栏，目录复用 Markdown 的 toc.vue 树、展开状态、当前项和主题样式；缩略图只绘制附近页面。支持单页、连续、双页和全屏阅读。工具栏使用 SVG 图标，按钮保留文字提示和无障碍名称。
选中文字后，复制、搜索、高亮、下划线、删除线、评论及 翻译入口出现在选区结束位置，滚动或 Escape 收起。
记号笔提供五色、粗细和“仅文本突出显示”开关；自由标记仍写入 Highlight，不提供手绘画笔创建入口。
题注支持直接输入、颜色、字号、字间距、拖动及宽度调整；橡皮擦支持撤销。
阅读助手提供离线生词辅助和在线整句翻译，可记住模式与服务选择。默认离线，选区不自动联网。
离线采用 NAER 四学科术语、现代 AI/LLM 补充和项目维护科研义项优先，ECDICT 英汉词库与词形映射兜底；
支持科研综合、计算机 / AI、数学、物理、化学和通用切换，每个义项标明学科与来源；
词下释义、全部义项、定义及在线译文统一以本地 OpenCC 显示简体，原始词库及来源记录保留。
常用 1000 词按 ECDICT BNC 通用义过滤，专业常见词仍可标注；最长匹配八词连续短语，不跨标点。
原句中的生词以词下短释义呈现，点击词或短语展开音标与多个义项，可选择语境释义和标记已掌握。
学科排序不是自动上下文消歧；未收录词明确标注，原 PDF 文字层与文件不被改动。
在线模式由用户点击“翻译成中文”后才提交当前文字（最多 5,000 字符），
通过隔离的 Google/Bing 官方网页读取公开译文 DOM，不使用私有 API 或绕过登录/验证。
网页结构、网络、限流或登录可能导致适配失败，此时可打开原生官方网页手动操作或外部浏览器。
两个服务使用各自持久的 Electron 会话，无应用 preload，拒绝权限请求，限定 HTTPS 导航白名单。
账号、Cookie 和存储不由适配器读取；网页登录不保证解除免费限制。
取消或换选区中断请求并隐藏已就绪网页，同服务复用已加载页面；关闭面板或窗口最终销毁视图。
使用主框架 DOM 接口而非等待整页加载，一个 18 秒总期限、100 毫秒采样；
有效当前译文立即通过请求序号关联的 IPC 更新侧栏，180 毫秒稳定窗口和公开结果忙碌状态只决定完成与缓存。
官网上已有同句译文直接复用，兼容 textarea.value 无 DOM mutation 更新；拒收不同原文的旧译文和加载占位。
同步中或未确认完成的译文可读但不可复制，取消后忽略迟到更新；最近 24 条成功译文只缓存在视图内存。
原生视图随缩放和窗口调整，PDF 标签页或应用弹窗遮挡时隐藏。
专项测试包括 `test/e2e/pdf-reading-assistant.spec.ts`、`pdf-reading-web.spec.ts`、`pdf-reading-research.spec.ts`、
`pdf-reading-sync.spec.ts` 与 `pdf-reading-long-passage.spec.ts`；
单元回归包括 `reading-vocabulary.spec.ts`、`reading-scientific.spec.ts`、`reading-chinese.spec.ts`、`reading-web.spec.ts`、
`reading-page-adapter.spec.ts` 和 `reading-translation-timing.spec.ts`。
基础 UI 测试模拟在线译文，离线测试实际加载打包词库；确定性原生夹具验证译文 DOM 可用时不等待慢子资源，
同句现成结果无需新变化以及网页到侧栏的真实 DOM 时间差（不计测试轮询开销）小于 500 毫秒。
显式设置 `YARKTEXT_READING_LIVE_TEST=1` 后运行科研及长段落 E2E，才发送公开论文段落，核对首次同步、冷/热/缓存实际译文语义与耗时。
不能以模拟测试声称在线服务可用，真实网站回归也不保证长期可用性。
词库再生成、授权与设计决策见 `docs/PDF-READING-ASSISTANT.md`。
`test/e2e/pdf-link-navigation.spec.ts` 检查 PDF 目录页的显式目标、命名目标、翻页动作和
侧栏书签均在阅读器内跳转，只有真正的网页链接交给外部浏览器；兼容 PDF.js 当前的
`data-internal-link` 标记。
打印前保存当前草稿，再通过 Chromium PDF 插件调用原生打印对话框，避免把编辑器工具栏打印进正文。

批注使用 `pdf-lib` 在主进程写入标准 PDF 注释字典及独立的外观流，没有把批注压平进正文：

| 功能                 | 标准类型                          | 实现                                                                 |
| -------------------- | --------------------------------- | -------------------------------------------------------------------- |
| 高亮、下划线、删除线 | Highlight / Underline / StrikeOut | 选区经 PDF.js viewport 逆变换为 PDF 坐标，写入 QuadPoints            |
| 便签评论             | Text                              | 写入 Contents、T（作者）、M（修改时间）、NM（唯一标识）              |
| 文本题注             | FreeText                          | Unicode 正文与独立外观流；中文外观由本地字体生成，其他软件可读取正文 |
| 矩形                 | Square                            | 保存 Rect、颜色、透明度与线宽；已有 Ink 手绘保留并只读显示           |

这些类型属于 [Adobe PDF 标准批注](https://developer.adobe.com/document-services/docs/overview/pdf-embed-api/howtos-comments)。
分享已保存的 `.pdf` 即可带上批注，无需分享 YarkText 缓存。已有批注在列表中展示，支持的类型可修改或删除，
其他类型保留并仅供查看。删除父批注会一并删除其 Popup 和回复；不会移除无关链接或批注。
不包含云端审阅状态同步、FDF/XFDF 导入导出、附件批注创建或数字签名编辑。

工具栏提供保存原文件和保存副本，Ctrl+S / 另存为也进入 PDF 二进制保存流程。
未保存草稿随标签页和崩溃恢复缓冲保存，关闭时可保存、放弃或取消；不会进入 Markdown 文本保存通道。
主进程按源文件排队保存，并用 SHA-256 检查外部改动，再执行原子写入。加密文件和签名文件只读，
避免写入后丢失加密或破坏签名。当前没有直接实测 Adobe Acrobat；格式互通已通过 PDF.js 与 MuPDF 验证，
复杂外观、第三方专有批注和再次编辑的字体替换仍应按目标阅读器验证。

PDF 专项回归：先运行 `pnpm build:unpack`，再运行
`pnpm -C packages/desktop exec playwright test test/e2e/pdf-reader.spec.ts`。
覆盖离线渲染、搜索、阅读状态、Markdown 源码与 TXT 标签往返、原始字节保护、外部更新、
打开对话框、重复拖放和损坏文件。二进制路由及写入保护单测在 `pdf-reader.spec.ts` 中。
批注专项为 `test/e2e/pdf-annotations.spec.ts` 和 `test/unit/specs/pdf-annotations.spec.ts`。
若本机安装了 Python 与 PyMuPDF，可设置 `PDF_INTEROP_PYTHON=1` 运行批注 E2E，额外使用
独立的 MuPDF 引擎检查标准批注（含自由记号笔高亮）、Unicode 评论、作者和外观流。普通 CI 不要求 Python。
`test/e2e/pdf-tools.spec.ts` 覆盖加载进度、浮动菜单、复制与选区搜索、擦除撤销、题注样式和移动、目录、缩略图、双页及打印调用。
打印 E2E 截获原生打印方法，不消耗纸张；真实打印机仍需目标设备验证。
`test/unit/specs/pdf-range.spec.ts` 检查读取边界、跨窗口隔离、流式哈希、源文件替换检测和句柄释放。
`test/unit/specs/pdf-transport.spec.ts` 检查超大图片的合并读取请求拆分、取消后的迟到数据，以及真正读取错误的传播。
`test/e2e/pdf-save-locked.spec.ts` 在 Windows 实际占用源文件，验证另存副本后批注完整、原文件不变，并检查“应用修改”的可见反馈。
可设置 `PDF_SAVE_FIXTURE`，测试会复制指定 PDF 到临时目录再执行保存回归，源文件不被修改。
保存会等待本程序的分块读取和哈希句柄释放；外部占用或权限错误提供另存副本入口，取消时保留草稿。
目录跳转会校验目标并显示失败原因；缩略图显示加载、成功或重试状态，测试检查实际着色像素。
设置 `PDF_NAVIGATION_FIXTURE` 后运行 `test/e2e/pdf-real-navigation.spec.ts`，可用真实大文件连续跳转多个目录目标，检查实际可见页面及封面缩略图内容。
本地真实文件回归可设置 `PDF_REGRESSION_PATH` 后运行 `test/e2e/pdf-local-files.spec.ts`；
`PDF_REGRESSION_SWEEP=1` 逐页检查，默认仅检查首尾页。大于 100 MB 的文件同时断言首屏读取量小于文件一半。
测试不修改真实文件，也不要求将私有 PDF 加入仓库。

在仓库根目录运行。先安装依赖：`pnpm install`。

| 场景                                 | 命令                                                                    | 是否启动应用 |
| ------------------------------------ | ----------------------------------------------------------------------- | ------------ |
| 每次修改后的默认检查                 | `pnpm test:quick`                                                       | 否           |
| 提交前的完整无窗口检查               | `pnpm test:check`                                                       | 否           |
| UI、IPC、preload、窗口或保存流程变更 | `pnpm test:smoke`                                                       | 一次         |
| 专项界面回归                         | `pnpm -C packages/desktop exec playwright test test/e2e/<name>.spec.ts` | 依用例而定   |
| 发布前的桌面全量回归                 | `pnpm build:unpack`，然后 `pnpm test:e2e`                               | 多次         |

`test:quick` 跑 desktop 和 Muya 两套完整单元测试，不打包、不启动 Electron。
每套最多使用四个 worker，串行执行两套，避免同时占满 CPU 和内存。
不默认使用 Git related/changed 筛选：仓库有读取源码和 CSS 的回归测试，
这种依赖不一定能被测试框架的 import 图识别，筛选可能漏掉测试。

`test:check` 在快速测试之后检查根目录 lint、desktop 类型、Muya lint 和类型，
并运行 CommonMark/GFM 一致性测试。任一步失败立即停止，退出码保留，终端显示失败命令。
它不包含 Muya CSS lint、浏览器 E2E 或打包验证；这些仍按变更范围和 CI 要求执行。

`test:smoke` 先重新构建（包含 locale minify），然后用一个临时文档、一个隔离用户目录、
一次 Electron 启动验证渲染、键盘编辑、源码模式往返、实际保存和新建标签页。
用例用 `test.step` 标记检查点，失败信息指明对应步骤，结束时关闭应用；关闭自动重试以免反复启动。
异常会使测试失败，不依靠错误弹窗提醒人工。它会显示一个真实应用窗口；
Playwright 的 `headless: true` 不控制 Electron 的原生窗口。

冒烟测试覆盖核心链路，不能代替具体功能的回归测试，例如原生对话框、多窗口、
系统快捷键、主题细节和打包后的行为。相关变更仍需运行对应 spec。
打包后的验证使用 `node scripts/smoke-packaged.mjs <exe路径>`。

依赖裁剪由 `packages/desktop/electron-builder.yml` 的 `files` 控制：浏览器端 PDF.js、
Canvas 原生后端和图表依赖不再重复收录 npm 源文件；PDF 字体、CMap、WASM 和 Worker
仍保留在 `out/renderer`。主进程保留 `docx/dist/index.cjs` 和 `pdf-lib` 的 CommonJS
入口。调整这些规则后，须验证实际安装包中的离线 PDF 阅读与批注保存、Word 导出和
Mermaid 渲染；开发构建能访问完整 `node_modules`，不能单独作为裁剪正确性的依据。

连续开发时可在单独终端运行：

```sh
pnpm test:watch:desktop
pnpm test:watch:muya
```

针对已知功能可先运行单个单元测试：

默认导出的专项回归使用 `pnpm -C packages/desktop exec playwright test test/e2e/default-export.spec.ts`。
先运行 `pnpm build:unpack` 更新代码。该用例只启动一次应用，替代原生保存对话框，
检查五种导出文件的实际内容、Word 表格和公式资源、长图完整性、取消导出及隐藏窗口清理。
默认菜单包含 PDF、HTML、无样式 HTML、PNG 和 Word（.docx），无需安装 Pandoc。
Word 的正文和表格可编辑，公式作为图片保留显示效果；PNG 单张高度上限为 30000 像素，
超过上限会提示使用 PDF，避免导出被截断的图片。

```sh
pnpm -C packages/desktop exec vitest run test/unit/specs/editor-default-width.spec.ts
pnpm -C packages/muya exec vitest run src/state/__tests__/tocBlock.spec.ts
```

新增回归优先放在能重现问题的最低层：解析、序列化、状态、路径和命令逻辑用单元测试；
真实浏览器的光标、布局、输入行为用 Muya 浏览器 E2E；跨 Electron 进程和原生功能用 desktop E2E。
等待可观察状态或使用 `expect.poll`，避免用长固定延时掩盖时序问题。

编辑器布局回归使用 `pnpm -C packages/desktop exec playwright test test/e2e/editor-layout.spec.ts`，
运行前先执行 `pnpm build:unpack`。用例检查图片插入时源码与占位提示分行，
并通过 Electron 的 `before-input-event` 检查 Ctrl+N（macOS 为 Command+N）在当前窗口新建标签页。
TXT 分栏用例检查同文档共享编辑与撤销、不同文件分别保存、当前栏查找替换、独立光标、
分隔线拖动和键盘调宽、缩略图及 PDF 不显示拆分按钮。
TXT 右上角的拆分按钮或 Ctrl+\\（macOS 为 Command+\\）打开左右两栏；
各栏顶部下拉框选择已打开的 TXT，关闭栏保留文件标签，双击分隔线恢复等宽。

应用控件回归见 `test/e2e/ui-controls.spec.ts`：检查首页按钮边缘悬停与聚焦时尺寸稳定、
顶部菜单及底部菜单重复点击开关、外部点击与 Escape 关闭、嵌套命令和复选菜单执行，
以及偏好设置的开关、圆角卡片、滚动条、分类导航和浅深色主题。
顶部菜单由应用内界面展示，命令通过原生菜单路径在主进程执行；
TXT 的查找、替换、自动换行等直接操作入口不作为弹出菜单处理。
`menu-zoom-preferences.spec.ts` 继续检查原生菜单 API 的缩放定位与设置持久化。

`settings-arcade-style.spec.ts` 逐一检查八个设置分类与小憩的公共字体、字号、原生滚动条、
Element Plus 下拉列表的自绘滚动条、分类切换后滚动位置、小窗口无横向溢出、
精选游戏单双列切换、棋盘可见性及文档内容保持。
设置与小憩以 `ui-surface` 标记使用 `assets/styles/surfaces.css` 的公共样式，
下拉列表通过 `pref-control-popper` 覆盖传送到页面外层的菜单；
游戏 iframe 的作者内容与文档中的字体保持独立。

Windows 安装页默认勾选“同时安装 PDF 阅读器”。取消后移除独立 unpack 的 PDF 阅读脚本、Worker、字体、编解码资源及批注写入依赖，写入组件禁用标志，并移除 PDF 关联声明；Markdown/TXT 与 Markdown 导出 PDF 不受影响。
PDF 批注写入模块延迟加载，编辑器模式无需 PDF 依赖即可启动。交互安装可以重新选择组件；静默升级保留上次选择，`/NOPDF` 和 `/PDF` 可显式指定组件状态。ZIP 和开发构建保留完整功能。
`test/e2e/pdf-rotation.spec.ts` 检查四个角度绘制完成后的真实像素与页面可见性；可用 `PDF_ROTATION_FIXTURE` 指定外部文件。
`test/e2e/pdf-hand-markers.spec.ts` 验证拖拽滚动、多色批注保存及色笔设置持久化；组件开关及安装脚本回归见 `pdf-component.spec.ts` 和 `windows-file-association.spec.ts`。

Windows 安装器通过 `build/windows/installer.nsh` 注册 MD、TXT 和 PDF 的 OpenWithProgids、Applications\YarkText.exe\SupportedTypes、Capabilities 和 RegisteredApplications；支持按用户和全机安装，更新保留稳定 ProgID，卸载仅清理自己的声明。Windows 不使用 electron-builder 的自动关联宏，以免覆盖扩展名默认值。已有默认应用和 UserChoice 不被修改；ZIP 解压运行不会执行安装器注册，需使用 NSIS 安装包。
