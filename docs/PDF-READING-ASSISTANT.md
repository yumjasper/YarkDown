# PDF 阅读助手

## 用户流程

选中 PDF 句子，点击选区的翻译图标。默认进入离线生词辅助，可自行切换整句翻译。模式、学科、Bing/Google 服务偏好和已掌握词保存在本机；切换选区不自动联网。

生词辅助保留原句顺序，词下展示简短释义。点击已收录的词或短语可查看音标、全部义项、学科与来源，并选择适用释义；同词元重复出现同步更新。所有词下释义、多义项及定义统一显示简体中文，由本地 OpenCC 转换，不联网；保留英文原文、源词库文件和来源记录。多义选择只保留在本次选区，已掌握词跨选区保留且可取消。原 PDF 文件与文字层不变。

“学科词义”仅提供通用、计算机 / AI、化学。默认通用，学科义优先于新版通用义；已保存的科研综合设置迁移为计算机 / AI，旧数学与物理设置回到通用。例如通用模式的 Generative 首义为“能产生的；有创造力的”，计算机模式首义为“生成式的”；生僻“生殖的”仍保留为备选。数学与物理不再作为独立学科资源打包。

最长匹配已收录的连续短语，最多八个英语词，不跨逗号等标点；如 Physically Based Materials 显示“基于物理的材质”。常用 1000 词及其词形默认不自动标注，NAER 通用义不能覆盖此规则；只有项目明确维护的专业优先义或 AI/LLM 术语才能作为专业例外，例如化学催化剂。build/building/built、improve/improved/improving 不自动标注。另对基础语法词与 back、use 等基本词设置保护，不因学科词库含专业义就强制自动标注；am/is/are/was/were 等正确还原为 be。独立单字母（如图号 A/B/C/D、变量字母）及 2D/3D、年份等数字混合标号保留普通原文，不查词，也不显示未收录提示。LLM 等多字母技术缩写及包含基础词的完整专业短语不受此过滤影响。基础词如有词条仍可点击主动查词，不自动显示词下释义。学科优先是可解释的词典排序，不是自动上下文消歧；其他未收录专名、缩写或抽取错误以虚线提示，不编造译文。

选区菜单复制、键盘复制、搜索和翻译共用 PDF 文字层提取器，保留 BR 行尾，并在相邻文本片段存在可见词间距时恢复空格；连续的单词碎片不人为拆开。不通过把 ona 字符串替换为 on a 来猜测修复，也不擅自纠正论文原文拼写。计算机／AI 与化学模式 noise 优先显示大陆科研用词“噪声”，原地区义项保留为备选；inverse-rendering 显示“逆向渲染”。

整句翻译仅在点击“翻译成中文”后提交当前原文，最多 5000 字符。译文显示在应用自有对照界面。原生官方网页入口不额外自动提交选区，可自行登录、复制粘贴或手动操作。失败提供官方网页与外部浏览器回退，不自动换服务或绕过验证码。

## 三分类离线词库

采用学科术语层优先、通用词库补充。运行时资源随安装包发布，离线查词不联网。首次在主进程解压并缓存，renderer 仅接收当前句子的词条和定义。

| 层次       | 来源                                                            | 边界                                                                                                        |
| ---------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 通用英语   | Open Dictionary v2.0，2026-08-05 发布                           | 原始 84212 条，经英文查词键筛选为 80736 条，含单词和短语；保留词性、core/common/rare 优先级及学习者中文解释 |
| 计算机／AI | NAER 电子计算机术语、JingHao-Leon AI/LLM Glossary、项目维护术语 | 117366 个义项；NAER 使用开放政府资料许可，AI 词表与项目术语为 MIT                                           |
| 化学       | NAER 化学术语、项目维护术语                                     | 26301 个义项；不混入旧物理或数学分类                                                                        |
| 常用词过滤 | 独立冻结的 ECDICT BNC 前 1000 词元                              | MIT 频率数据，不含旧 ECDICT 释义，不代表个人水平                                                            |

学科层合计 141014 个查询键和 143667 个义项，通用层有 50554 个词形映射。查询键数量包含缩写、短语及同一词的不同领域义项，不等同于全新单词数。

新版数据从 Wiktionary 骨架出发，由上游模型离线生成中文解释并校验；YarkText **只读取静态产物**，不运行模型、不配置 API key、不上传选区。它不是经过逐条人工审校的权威出版词典，不能保证所有解释均无误。相比旧版，generative 常用生成义优先于生殖义，hallucination、prompt、transformer 已包含现代 AI 用法。

全部所选义项保留，核心／常用义排在生僻义前。正文显示短释义，详情保留完整中文解释。compromise/two 以传统规则分析句子，通用义再按词性排序；孤立词不作语境推断，学科义不被覆盖。词形自身释义优先，必要时只从词根补齐缺失的动词义，不把 trained 解释成名词列车。通用多词短语和学科短语都使用最长匹配，不跨标点。

### 授权和来源

Open Dictionary 数据及其改编、合并词库按 **CC BY-SA 4.0** 共享，署名 English Wiktionary contributors、Open Dictionary 和 YarkText 转换工作；应用源代码许可不变。随安装包保留 `OPEN-DICTIONARY-LICENSE.md`、`CC-BY-SA-4.0.txt` 和 `ATTRIBUTION.md`，打包校验会拒绝缺少这些文件的产物。NAER、AI 词表、独立 BNC 排名和 OpenCC 各自许可也保留，不将它们冒称为 Open Dictionary 的原生数据。

- [Open Dictionary v2.0](https://github.com/ahpxex/open-dictionary/releases/tag/v2.0)
- [Open Dictionary 数据许可](https://github.com/ahpxex/open-dictionary/blob/main/LICENSE-DATA.md)
- [NAER 电子计算机术语](https://data.gov.tw/dataset/15416)
- [NAER 化学术语](https://data.gov.tw/dataset/14845)
- [AI/LLM Glossary](https://github.com/JingHao-Leon/ai-llm-glossary)

### 再生成

从上方固定发布下载 `distribution.jsonl.gz` 到 `.tools/open-dictionary-v2.jsonl.gz`，生成器强制验证发布 SHA-256。不再使用 ECDICT CSV 生成释义。

```powershell
python scripts/build-reading-dictionary.py .tools/open-dictionary-v2.jsonl.gz
python scripts/build-scientific-dictionary.py .tools
pnpm build:reading-bundle
```

学科生成器只读取 `.tools/naer-computing.csv` 和 `.tools/naer-chemistry.csv`，以及既有 `.tools/modern-ai/docs/*.md`、`modern-ai-license.txt`、`naer-license.html`。项目优先义项在 `research-overrides.json` 中也只保留计算机与化学。

统一资源升级为 format 3，包含通用义项、中文解释与优先级、词形、学科义及短语索引。原始发布数据不打包；两份分层 gzip 只作为构建输入，不重复安装。源数据与产物校验和、数量记录在 metadata.json、scientific-metadata.json、bundle-metadata.json。

### 性能边界

三分类裁掉数学和物理层，但新增中文详细解释后，统一压缩资源为约 18.3 MiB，**不是比旧版更小的安装资源**。首次加载需读取、解压和解析；缓存按学科各最多 2048 键，包含未命中，索引不跨词库串义。简体转换通过 WeakMap 缓存不可变词条。

使用 `node --expose-gc --import tsx scripts/bench-reading-dictionary.mjs --variant bundle` 测量当前词库；数据不包含 IPC、界面渲染或网络。旧版本的性能表已移除，不能当作新版实测。长选区的规则分析仍为同步操作，不能把短句耗时套用到三万字符选区。

2026-11-13 本机 Node 基准：文件读取、解压与解析约 419 ms，词库新增堆内存约 111.1 MiB，首次论文段落分析与简体转换约 36.9 ms，热段落中位数 3.07 ms，30000 字符热选区中位数 139.7 ms。此为单机测量而非性能承诺；堆增量不等于 Electron 整体 RSS，长选区仍可能短暂占用主进程。

## 在线集成与延迟

这不是 Google Cloud/Azure 正式 API。隔离的 WebContentsView 加载 Google Translate/Bing Translator 官方网页，只访问翻译输入与输出 DOM，不调用私有 API，不读取账号、Cookie、localStorage、密码或其他页面内容。免费网页没有 API 可用性保证，网络、地区、限流、登录、验证码和 DOM 改动都可能导致失败。

Google 与 Bing 各用独立持久 Electron session，不复用系统浏览器登录态。视图无应用 preload，启用沙箱、contextIsolation、webSecurity，拒绝权限请求与 webview 附加。导航限定对应翻译与登录域名；白名单新窗口在视图打开，其他 HTTPS 新窗口交给外部浏览器，账号登录由用户完成。

此前慢的原因是每次选区销毁重建网页、等待完整 loadURL 后才读译文，再叠加轮询；此外 Electron `webContents.executeJavaScript` 本身也会等 did-stop-loading。现在的流程：

- 同 owner、视图 ID 和服务的已就绪翻译页复用；取消或换选区只中断请求并隐藏已就绪页面，不丢弃运行时。
- 冷导航不等待全部资源加载，固定 DOM 脚本改用主框架 `mainFrame.executeJavaScript`，在输入与输出可用时开始处理。
- 一个 18 秒总期限，包含异步 DOM 调用；取消可立即停止等待，不另叠加 30 秒加载和 25 秒取结果。
- 每 100 毫秒读取公开翻译 DOM，当前原文匹配且出现有效译文时，立即通过类型化 IPC 同步到侧栏，不再等最终 Promise 返回才展示。稳定至少 180 毫秒且结果区域不再公开标记忙碌，才确认完成和允许缓存。
- 对同原文已经显示在官方页的现成译文，允许直接同步，不再强制等待一次不会发生的新 DOM 变化。其他原文仍要求输出更新，拒收上一句译文及其加载省略号。
- 直接比较当前输出和旧基线，同时兼容 `textarea.value` 更新不触发 MutationObserver 的页面。所有预览与最终译文统一简体。
- 同步事件携带视图 ID、服务和递增请求序号。侧栏只接受当前请求；取消、换选区、换服务或关闭后忽略过期结果并释放监听器。
- 同步中可以先读译文，但不能复制未确认的结果；若请求超时或取消，保留预览并明确标为“未确认完成”，不冒称完整译文。
- 最近 24 条确认成功的原文与译文缓存于视图内存，按服务隔离，不持久化；关闭视图后释放。

关闭面板、窗口销毁或主页面导航最终释放视图。原生网页在 PDF 标签页不可见或弹窗出现时隐藏，边界随缩放和窗口变化。首次页面加载仍受网络影响，页面复用与缓存速度不能代表任意新句或网站长期可用性。

## 设计决策

沿用现有 YarkText PDF 工具面板、主题颜色、UI 字体、分隔线与紧凑侧栏，并以用户提供的 Generative 词义截图作为问题参考。保留连续原句与词下短释义，通过学科选择、就近来源标注及单个多义详情卡增强科研阅读，而不引入新品牌色、装饰图或不相关页面改版。

显式标签、aria-pressed、focus-visible、语义按钮、可取消异步状态及窄栏内部滚动保留。学科选择解决不同专业的义项排序，不用含糊的自动消歧承诺代替用户选择。本次依据用户长段落截图和既有对照界面，保留布局、颜色与字体，只补充连接、翻译、同步及未完成状态；译文在原位置渐进更新，不抢焦点或强制滚动，结果区使用 aria-busy 标明同步状态。

## 验证

```powershell
pnpm run test:quick
pnpm run typecheck
pnpm run build:unpack
pnpm -C packages/desktop exec playwright test test/e2e/pdf-reading-assistant.spec.ts test/e2e/pdf-reading-research.spec.ts test/e2e/pdf-reading-web.spec.ts test/e2e/pdf-reading-sync.spec.ts --workers=1
$env:YARKTEXT_READING_LIVE_TEST='1'
pnpm -C packages/desktop exec playwright test test/e2e/pdf-reading-research.spec.ts test/e2e/pdf-reading-long-passage.spec.ts --workers=1
```

`reading-scientific.spec.ts` 用真实资源核对三分类覆盖、现代 AI 义项、Generative、词形词性、解释对齐、短语边界与原文还原。`reading-chinese.spec.ts` 检查截图繁体词组、三种分类全部义项与定义的简体转换，以及英文原文和来源保留。`reading-page-adapter.spec.ts` 验证输出节点变化、无关 DOM、旧译文占位、同句现成结果、value-only 更新及公开结果忙碌状态；`reading-translation-timing.spec.ts` 验证即时预览早于完成、源文关联、挂起操作总时限和即时取消。

`pdf-reading-sync.spec.ts` 验证真实主进程加载词库后统一简体、两家官方页同句结果无需新变化即可返回、网页结果到 Vue 侧栏的显示延迟小于 500 毫秒、同步中禁用复制及取消后不继续更新。`pdf-reading-long-passage.spec.ts` 用用户提供的三句完整论文段落检查两家真实网页的全部句子、首次同步、最终译文与冷/热耗时；它不是短句成功替代长文验证。

主进程代码修改需要彻底退出并重启应用；仅刷新 renderer 不会加载新的网页适配和 IPC 逻辑。测试前使用新的生产构建，避免误用 dev 输出：开发 CLI 会改用固定 marktext-dev 用户目录，而生产回归应使用临时隔离目录。不要为测试擅自终止用户正在运行的个人应用。

基础 UI 测试模拟在线 IPC，不证明实际网页可用。原生视图专项检查沙箱、权限、无 preload、裁剪、弹窗隐藏与关闭释放。科研专项另有确定性夹具，确保译文已就绪而另一资源仍在加载时即可返回，不必等待整页停止加载。

显式 live 测试只发送公开的论文标题与量子纠缠测试句，检查冷/热/缓存译文语义、复用 WebContents ID 和缓存耗时。其结果只证明执行时的网站兼容性，不能作为长期可用性或永久免费保证。

### 2026-11-13 上一轮实测

上一轮构建的三份专项共六个 E2E 用例全部通过，包括慢子资源夹具。真实测试的冷请求使用用户给出的论文标题，热请求使用 `Quantum entanglement is a physical phenomenon.`；两家热请求都返回“量子纠缠是一种物理现象。”，不是旧标题的译文。

| 服务 | 首次网页请求 | 已加载页的新句 | 重复同句缓存 |
| ---- | ------------ | -------------- | ------------ |
| 必应 | 4688 ms      | 2294 ms        | 0 ms         |
| 谷歌 | 4502 ms      | 881 ms         | 1 ms         |

上述为单次本机观测，缓存耗时按整数毫秒取整，不代表零成本或通用网络基准。慢资源夹具额外验证：子脚本延迟六秒时，译文在三秒内返回且主框架仍处于加载状态。加载期间旧译文省略号曾造成错误结果，本版已拒收，并通过“量子”“纠缠”的语义断言验证后才记录耗时。

### 本轮长段落与同步复测

用户提供的完整三句材料论文段落在最新构建上分别通过必应和谷歌真实网页冷/热请求，结果覆盖扩散模型、相关噪声及原始材质纹理，中文输出为简体。热请求在原文后追加一句 `The result is consistent.`，以验证不是重复缓存的旧段落。

| 服务 | 首次请求的首次侧栏同步 | 首次请求确认完成 | 已加载页新段落首次同步 | 新段落确认完成 |
| ---- | ---------------------- | ---------------- | ---------------------- | -------------- |
| 必应 | 5208 ms                | 5424 ms          | 2887 ms                | 3103 ms        |
| 谷歌 | 4817 ms                | 5033 ms          | 569 ms                 | 780 ms         |

以上为单次本机实网结果，不是网站长期性能承诺。它们包含官网加载与服务翻译时间，不能当作网页结果到应用界面的同步延迟。确定性原生页面夹具分别在官网输出 DOM 更新和 Vue 译文 DOM 更新时打点，两轮测得同步链路 50 ms、53 ms、222 ms、324 ms；验收门槛仍为小于 500 ms，不计 Playwright 断言轮询和跨进程读取的开销。

本轮还验证六种学科的全部选区义项统一简体、两家已有同句原文和译文的官方页面无需再次变化即可导入、同步中禁用复制、取消后迟到结果不更新。所有专项源代码、依赖锁和转换许可随交付包提供。完整快速单元回归、类型检查及构建通过，全仓 lint 无错误，仍有既有警告。

既有 `pdf-tools.spec.ts` 上一轮翻译步骤通过，但后续“添加注释”步骤未显示批注正文输入框；本次没有修改批注逻辑，不将该历史用例计为全程通过。
