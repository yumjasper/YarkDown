# 纯文本编辑

打开 `.txt` 或 `.text` 文件时，YarkText 使用独立的纯文本视图。
通过“文件 → 新建文本文件”可以创建 TXT，首次保存默认使用 `.txt` 后缀。

- 编辑区显示行号、当前行列、总行数、编码和换行符。
- 上方提供查找、替换、跳转行、自动换行与行号开关。
- 查找替换支持区分大小写、全词匹配和正则表达式；支持撤销、重做及跨标签保留撤销记录。
- `Ctrl+F` 查找，`Ctrl+H` 替换，`Ctrl+G` 跳转行，`Alt+Z` 切换自动换行。
- 复用现有文件树、文件夹搜索、自动保存、编码和换行符设置；点击文件夹搜索结果可以直接定位到文本中的匹配位置。
- Markdown 标记按原文显示，保存时保留制表符、尾随空格和末尾空行。已有文件沿用检测到的编码、BOM 和换行符；混合换行沿用工程已有的规范化逻辑。

基础交互参考 [Notepad3](https://github.com/rizonesoft/Notepad3)，编辑视图使用工程已有的 CodeMirror，未引入新的编辑器依赖。
Markdown 的格式化、预览导出和打印入口在纯文本模式下禁用。

验证使用 `pnpm test:quick`、`pnpm typecheck`、`pnpm lint`，并在构建后执行：

```powershell
pnpm -C packages/desktop exec playwright test test/e2e/plain-text.spec.ts
```

该集成测试只启动一次 Electron，覆盖原文与编码保存、查找替换、标签切换与撤销、跳转行、换行开关、新建 TXT，以及 TXT/Markdown 混合文件夹搜索。
