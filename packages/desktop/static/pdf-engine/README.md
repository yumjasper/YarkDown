# YarkText 本地 PDF 高级引擎

本模块为独立实现，不包含 Acrobat.exe、Acrobat.dll、Adobe 插件、反编译代码或账户/许可逻辑。Acrobat 的功能分层仅作为产品架构参考，不是代码来源。

## 安装与运行

需要 Python 3.10+。在仓库根目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-pdf-engine.ps1
pnpm run dev
```

安装脚本创建 `.tools/pdf-engine` 隔离环境，不修改系统 Python、PATH 或 Acrobat。更换 Python 时可指定 `-Python '完整解释器路径'`。

开发运行自动查找根目录 `.tools/pdf-engine`。已打包应用需要配置 `YARKTEXT_PDF_PYTHON` 指向装有 requirements.txt 依赖的 Python；不自动分发 AGPL 运行时。设置环境变量必须在启动应用之前完成。静态脚本随现有 static 资源打包。

打开 PDF，在“编辑 PDF”面板读取正文块，修改文字与字号，选择“重排正文并另存 PDF”。在“导出 PDF”面板执行 OCR 或本地 Office 转换。

## 已实现能力

- 正文块编辑：识别水平文字块；预检排版溢出；真正删除原文字内容而不是白色覆盖；在原块中写入可搜索的新正文。支持中英文自动换行与字号，字体可能替换。原图片和矢量线不删除。写出新文件并自动打开。
- OCR：RapidOCR / ONNX Runtime 在 CPU 上按页处理，默认中英文；仅处理没有文字层的页面；置信度低于 0.5 的行跳过；以不可见文字加入搜索层，原扫描图不改变。不支持图像中的原正文擦除和重排。
- PDF 到 DOCX：pdf2docx 重建段落、表格、图片、页面尺寸和基本格式；不是原有纯文本 Word 导出。复杂多栏、公式、浮动图片、字体替换仍需人工核对。无文字层的扫描 PDF 需先 OCR；混合扫描页面仍可能以图片保留。
- PDF 到 XLSX：MuPDF 检测表格，openpyxl 写出各表为独立工作表。PDF 文本按字面值写入，不能成为执行公式。不宣称完整页面布局或所有合并单元格可恢复。
- PDF 到 PPTX：每页渲染为图片并按比例放入幻灯片。保留视觉外观，但文字、表格、矢量图不是可编辑对象。

## 未实现

跨正文块/跨页联动重排；恢复原字体子集全部字形；混合样式逐字编辑；扫描图原字擦除与可视重排；部分含文字层页面的局部 OCR；OCR 低置信度逐字校正 UI；可编辑对象级 PowerPoint 转换；完整 Excel 版式转换；Office 输入转 PDF；Acrobat 级任意文档高保真保证。

保留已有注释、签名外观、表单填写、图片与空白 PDF 创建，并非本轮已用新引擎替换所有阅读和注释代码。现有纯文本 TXT/DOCX 导出仅作为分离的简易工具。

## 资源与生命周期

每个任务独占一个 Python 子进程，完成后退出；没有常驻 OCR 服务或加载到阅读器的推理模型。无任务时不会加载 PyMuPDF 和 ONNX 原生库到 Electron 进程。一个应用同一时间只允许一个引擎任务，超时 15 分钟，协议输出上限 16 MB。输入上限 512 MB、2000 页，OCR 页面渲染最多约 1200 万像素，PPTX 每页最多约 800 万像素。

输出通过临时输入快照和临时结果文件生成，成功后由主进程写入用户选择的位置。输入与输出路径不得相同，因此不会破坏原始文件。正文块读取返回 SHA-256，编辑时校验同一文件版本。密码文件、数字签名/签名字段、无相应权限和待执行安全涂黑的文件不会进入写出流程。不是为了兼容旧批注协议，而是避免误处理文档。

运行时不调用云 OCR 或转换服务；安装依赖时需要网络。RapidOCR 1.4.4 模型随 wheel 包提供，已验证初始化无需额外模型下载。

## 开源来源与发布约束

| 组件 | 固定版本 | 来源 | 上游许可 |
| --- | --- | --- | --- |
| PyMuPDF / MuPDF | 1.28.2 | https://github.com/pymupdf/PyMuPDF | AGPL-3.0 / 商业双许可 |
| RapidOCR | 1.4.4 | https://github.com/RapidAI/RapidOCR | Apache-2.0；保留 PaddleOCR 模型归属 |
| pdf2docx | 0.5.13 | https://github.com/ArtifexSoftware/pdf2docx | MIT；依赖 PyMuPDF |
| openpyxl | 3.1.5 | https://openpyxl.readthedocs.io/ | MIT |
| python-pptx | 1.0.2 | https://github.com/scanny/python-pptx | MIT |

不更改 YarkText 的根许可证，也不把 PyMuPDF 标成 MIT。发布包含该运行时的安装包前，需要明确处理依赖的许可义务及源代码/归属材料；仅把引擎放到子进程不代表可以忽略许可。当前实现是本地开发功能，尚未完成原生运行时的独立分发与跨平台安装打包。

## 验证

```powershell
.tools/pdf-engine/Scripts/python.exe packages/desktop/test/pdf-engine/test_engine.py -v
pnpm run typecheck
pnpm -C packages/desktop exec playwright test test/e2e/pdf-advanced.spec.ts --workers=1
```

Python 测试验证原正文移除、中文可搜索、非目标文字和图片保留、溢出与旧版本请求拒绝、扫描 OCR 可搜索及渲染像素一致、DOCX 表格和图片、XLSX 公式注入防护、PPTX 页面尺寸和图片对象。没有用这些样本测试宣称大型文档性能或 Acrobat 等效高保真。
