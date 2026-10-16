# YarkText PDF 阅读与工具

## 阅读与批注

默认界面以阅读和批注为主：页码、缩放、旋转、连续/单页/双页布局、搜索和一组批注工具。填写、编辑、导出、创建收在“更多 PDF 工具”中；选择绘图或标记工具时关闭次要工具面板，避免正文编辑框与批注抢占指针。

批注工具栏独立于页面绘制与历史管理，包含选择、拖拽阅读、高亮、下划线、删除线、便签、题注、手写、矩形和橡皮擦。普通高亮或笔画不会自动弹出侧栏；便签和题注自动进入编辑。选择其他批注时先提交前一条评论到草稿。

记号笔最多 6 支：5 个默认色和 1 个自定义色。历史超量配置在加载时裁剪并保存；连续调整自定义颜色只替换槽位。记号笔设置可切换文本突出显示与自由标记模式。

批注侧栏支持正文/作者/类型关键词搜索、当前页过滤、颜色及作者编辑、删除和定位。初次阅读按页读取原有批注，打开侧栏时按需扫描全篇；扫描完成前数量为已读取批注数量。保存为标准 PDF 注释，保留跨工具读取能力。

### 快捷键

- Ctrl+F：搜索；搜索选项支持大小写、全词匹配和全部突出显示。
- Ctrl+Z、Ctrl+Shift+Z、Ctrl+Y：撤销/重做批注；文本输入框内保留原生文字撤销。
- V、H、M、U、N、P：选择、拖拽阅读、高亮、下划线、便签、手写；仅页面获得焦点时生效。
- Escape：取消未完成手势，回到选择工具。
- Delete/Backspace：删除当前选中的批注。
- Home/End：第一页/最后一页；单页布局下 PageUp/PageDown 翻页。
- Ctrl+S：通过现有文件保存链路保存批注。

### 核心替换范围

- `pdfAnnotationToolbar.vue`：分组工具栏和六支记号笔入口，替换原组件中重复堆叠的工具栏。
- `pdfAnnotationOverlay.ts`：仅为可见页面及近邻维护草稿层，签名相同不重建 DOM；缩放/旋转时重建被 PDF.js 移除的层。
- `pdfAnnotationHistory.ts`：按变化的批注保存增量事务，替换整份草稿快照；最多 60 次事务和 8 MiB 序列化数据预算，连续输入合并。
- `pdfAnnotations.vue`：整合按页读取、评论编辑、批注手势、取消、快捷键、侧栏筛选及新绘制和历史模块。
- `pdfReader.vue`：阅读优先布局、模式互斥、搜索选项、翻页快捷键和缩放状态同步。

PDF 解析和页面栅格化继续复用 PDF.js，文件批注写回继续复用 pdf-lib 和现有 IPC。没有从零重写 PDF 规范引擎，没有复制 Acrobat 专有源码、二进制模块或许可逻辑。原有保存冲突防护仍保留，避免覆盖用户文档。历史预算不等于进程内存上限，大文件性能仍需真实文件基准。

## 高级工具

| 工具 | 实际实现 |
| --- | --- |
| 填写和签名 | AcroForm 文本、复选框和选项填写；手绘签名外观，不是证书数字签名 |
| 编辑 PDF | 原正文块识别、文字移除与块内重排，中英文可搜索；追加图片/图片外观文字 |
| OCR | RapidOCR 中英文离线识别，为没有文字层的扫描页增加搜索层，原扫描图不变 |
| 导出 PDF | pdf2docx 版式 Word、表格 XLSX、整页图片 PPTX；TXT、简易文字 DOCX 和当前页 PNG |
| 创建 PDF | A4 空白 PDF、PNG/JPEG 图片生成 PDF、Markdown 导出 PDF |

本机已安装隔离引擎。其他开发电脑需 Python 3.10+，在根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-pdf-engine.ps1
pnpm run dev
```

“更多 PDF 工具” → “编辑 PDF”会自动读取当前页正文并显示虚线文字框。点击框，在浮动卡片中编辑文字和字号，点击“保存修改…”或 Ctrl+Enter。取消另存对话框保留修改；溢出拒绝写出。结果为新 PDF，完成后自动打开。追加图片等默认折叠。

“更多 PDF 工具” → “导出 PDF” → “扫描件 OCR（中英文）”生成可搜索副本。扫描件转 Word 先 OCR，再选择版式 Word 转换。高级任务逐个启动 Python 进程并在完成后退出，不常驻 OCR 模型；大型文件可能处理数分钟。无需上传文档。

## 边界与发布

正文编辑只在单块内重排，不支持跨块/跨页联动；字体可能替换，复杂混排和竖排不支持。OCR 不擦除扫描图文字，不将扫描图转成可视编辑正文；局部混合 OCR 和识别校正 UI 尚未实现。

Word 复杂版式需核对，不能保证任意文档完全保真；Excel 仅表格；PowerPoint 整页为图片而非可编辑对象。Office 输入转 PDF 尚未实现。

本地引擎：PyMuPDF 1.28.2、RapidOCR 1.4.4、pdf2docx 0.5.13、openpyxl 3.1.5、python-pptx 1.0.2。PyMuPDF 为 AGPL-3.0/商业双许可，不属于 MIT。本次阅读批注重构未新增这一运行时依赖。原生引擎的独立分发仍需处理许可证和打包；可通过 `YARKTEXT_PDF_PYTHON` 指定外部 Python。

## 验证命令

```powershell
pnpm run typecheck
pnpm run test:quick
pnpm run build:unpack
pnpm -C packages/desktop exec playwright test test/e2e/pdf-reader.spec.ts test/e2e/pdf-annotations.spec.ts test/e2e/pdf-reading-annotation-ui.spec.ts test/e2e/pdf-advanced.spec.ts test/e2e/pdf-tool-workspace.spec.ts --workers=1
```
