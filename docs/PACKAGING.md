# Windows 打包

## 入口

安装依赖后，从仓库根目录运行：

```powershell
pnpm pack
```

也可以直接运行 CLI：

```powershell
node scripts/pack.mjs
node scripts/pack.mjs --help
```

手动双击根目录的 `build.bat`，结束时会暂停以便查看结果。
供自动化脚本调用时，使用第一参数 `--no-pause`，退出码 0 表示成功：

```bat
call build.bat --no-pause
```

## 前置环境

- Node.js 22。CLI 会优先使用当前 Node 22，或探测 `.tools/nodejs/node.exe`、`D:/Tools/nodejs22` 和 `YARKDOWN_NODE_ROOT`。
- 可用的 pnpm 10 和已安装的工作区依赖。
- VS 2022 C++ 编译工具、Windows SDK，以及目标架构的 Spectre 缓解库。CLI 会选择装有该库的 MSVC 工具集，不需要删除原生模块的 Spectre 配置。
- 可选的 `.tools/7zip/bin/7za.exe`，或通过 `ELECTRON_BUILDER_7ZIP_PATH` 指定 7za；未提供时由 electron-builder 自动获取。

显式指定构建用 Node：

```powershell
$env:YARKDOWN_NODE = 'D:/Tools/nodejs22/node-v22.21.1-win-x64/node.exe'
node scripts/pack.mjs
```

## 产物

`dist/` 保留为 electron-builder 和上游 CI 的构建暂存目录。
成功后将安装包、便携 zip、更新描述和 blockmap 复制到根目录 `Released/`，并生成 `SHA256SUMS.txt` 和 `build-info.json`。
默认清理旧暂存产物；只有打包完成后才替换 `Released/`。

```powershell
node scripts/pack.mjs --with-unpacked
node scripts/pack.mjs --keep-output
```

`--skip-rebuild` 仅适用于原生模块已针对当前 Electron 和目标架构重建的情况。
Windows x64 为本机已验证目标，其他平台或架构需要各自的工具链验证。

## 发布冒烟验证

```powershell
node scripts/smoke-packaged.mjs
```

该脚本启动 `dist/win-unpacked/YarkDown.exe`，用临时用户配置和文档验证启动、项目文件名搜索、源码模式双向切换和六级标题命令，结束后清理测试数据。
它使用开发依赖 Playwright 连接 Chromium CDP。快捷键映射和冲突由 `windows-keybindings.spec.ts` 单独验证，CDP 合成键盘输入不等同于 Windows 原生快捷键输入。

## 默认快捷键

- `Ctrl+1` 到 `Ctrl+6`：标题 1 到 6。
- 数字定位标签页命令：默认不绑定快捷键。
- `Ctrl+P`：快速查找打开项目文件夹内的 Markdown 文件名，也支持已打开文件；打印默认不绑定快捷键。
- `Ctrl+/`：在源码模式和所见即所得渲染编辑模式之间切换。

用户自己保存的快捷键仍优先于默认值，不会被构建脚本覆盖。
