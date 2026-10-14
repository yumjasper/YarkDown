# Word 导出模板

默认 Word 导出使用工程内的统一模板，样式定义集中在
`packages/desktop/src/main/utils/wordDocument.ts` 的 `WORD_TEMPLATE` 与 `createWordDocument`。
调整模板后重新启动开发预览即可生效，无需额外安装 Pandoc。

| 内容 | 默认排版 |
| --- | --- |
| 页面 | A4，四边页边距 2.54 厘米 |
| 正文 | 中文宋体、英文 Calibri，11 磅，1.5 倍行距 |
| 标题 | 中文微软雅黑、英文 Calibri，黑色；按六级标题设置大小，并与后续内容保持同页 |
| 代码 | Consolas，9.5 磅，浅灰底；保留缩进、换行及可编辑文本 |
| 图片 | 等比例缩放到正文宽度以内，居中；图片与图注尽量保持同页 |
| 图注 | 10 磅，居中，使用 Markdown 图片的 title |
| 行内公式 | 单独渲染为高清图片，随正文排列；行高自动扩展，避免重叠 |
| 独立公式 | 居中，编号在右侧；超过正文宽度时等比例缩小 |
| 表格 | 正文宽度以内，浅灰边框、表头背景与交替行背景 |

表格采用固定列宽，保留 Markdown 的左对齐、居中和右对齐。表格正文使用独立的紧凑样式，
表头加粗并可在跨页时重复；表格之后保留明确的间距。
同一列表项的后续段落保持缩进，不重复生成编号。
代码中的制表符写成 Word 原生制表符，设置固定制表位；代码块首尾保留段间距。
单独成段的 `$...$` 仍作为行内公式处理，只有 `$$...$$` 使用居中的独立公式布局。

正文、标题、代码、列表和表格均使用原生 Word 结构。公式暂以图片保留 KaTeX 的显示效果。
图片和公式均嵌入 DOCX，移动文档后不依赖源文件的本地路径。

专项验证：先运行 `pnpm build:unpack`，再运行
`pnpm -C packages/desktop exec playwright test test/e2e/docx-layout.spec.ts`。
该用例覆盖大图、图注、长段落中的多组行内公式、带编号公式、代码、列表及表格。

## 公开实现与问题记录

- [Pandoc DOCX 写入器](https://github.com/jgm/pandoc/blob/main/src/Text/Pandoc/Writers/Docx/OpenXML.hs)：参考语义块、独立段落样式、紧凑表格样式与列表续段的处理方式。
- [Pandoc 表格实现](https://github.com/jgm/pandoc/blob/main/src/Text/Pandoc/Writers/Docx/Table.hs)：参考明确列宽、单元格对齐与 Word 表格属性的处理。
- [单独成段的行内公式问题 #11674](https://github.com/jgm/pandoc/issues/11674)：区分行内公式与独立公式，避免仅按段落内容形态误判。
- [标题与代码、表格间距讨论 #9326](https://github.com/jgm/pandoc/discussions/9326)：显式设置边界间距，不依赖编辑器自动推断。

这些设计通过工程现有的 `docx` 库独立实现。默认导出继续使用内置模板，不依赖外部 Pandoc。
