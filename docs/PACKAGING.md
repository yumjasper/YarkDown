# Windows 打包

## 程序图标

任务栏、窗口和安装包使用独立的“Y”图标；自定义标题栏、关于页面、README
与官网展示共用同一 LOGO 图。图标设计源是仓库根目录的两张 PNG：
`icon_YarkDown.png`（1024px 母版，用于 96px 及以上尺寸）和
`icon_YarkDown64.png`（小尺寸优化版，用于 64px 及以下）。
修改后运行 `node scripts/generateAppIcons.mjs`，同步生成 PNG、Windows ICO
和 macOS ICNS。输出范围包括程序图标（`build/icons/`、`static/icon.*`）、
标题栏与关于页 LOGO（`renderer/src/assets/images/logo.png`）、文档展示图
（`docs/assets/logo-small.png`）与官网资产（`packages/website/public/`）。
Windows ICO 包含 16、20、24、32、40、48、64、96、128 和 256 像素版本，
用于不同显示缩放比例。重新启动开发预览可加载窗口图标，安装包图标需重新打包。

## 安装界面

安装器沿用 NSIS Modern UI 2 的页面骨架，视觉全部落在黑白灰范围内：侧边栏是
164×314 的近黑位图，页头是 150×57 的白底黑字标，正文字色 `#0F0F11`，次要
说明 `#5B5B62`。欢迎页与卸载页用 `nsDialogs` 自绘同样的布局，把 MUI 自带的
侧栏、页头与分隔线隐藏后重排，因此版式与侧边栏位图对齐。

安装界面由三个文件构成：

- `packages/desktop/build/windows/installer-ui.nsh`：品牌页、文案与复选框。
- `packages/desktop/build/windows/installer.nsh`：初始化、安装、卸载与文件关联逻辑。
- `scripts/generateInstallerArt.mjs`：从 `icon_YarkDown.png` 生成上述三张位图。

位图不手工维护，`build:win`、`build:win:x64` 和 `build:win:arm64` 都会先运行
生成脚本，改 LOGO 后重新打包即可。NSIS 只接受 BMP，且构建机上的 libvips 没有
fontconfig，所以脚本把文字绘成矢量路径并自行写出 24 位自底向上 BMP。单独预览：

```powershell
node scripts/generateInstallerArt.mjs --preview .tmp-shot/art
```

含中文的 `.nsh` 必须以 UTF-8 BOM 保存，否则 makensis 会报 `Bad text encoding`。

## 旧版残留恢复

历史版本卸载失败时，electron-builder 默认弹窗提示后以退出码 2 中止安装，用户
只能手动清理。安装器接管了这条失败分支：`customUnInstallCheck` 与
`customUnInstallCheckCurrentUser` 在旧卸载器返回非零后清掉残留注册项和残留
安装目录，再清除错误状态让流程继续。

安装阶段还会做三项前置清理：删除指向不存在可执行文件的陈旧卸载项、删除另一
用户作用域下的幽灵项、删除注册表记录但未被移除的孤儿目录。三者都校验目录名
是否为 `YarkText`，避免误删用户自己选的目录。

卸载页的「保留设置与最近编辑记录」是页面复选框，不再在文件删除循环里弹窗确认，
因此脚本化卸载不会再卡在对话框上。

## 入口

安装依赖后，从仓库根目录运行：

```powershell
pnpm run pack
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

- Node.js 22。CLI 会优先使用当前 Node 22，或探测 `.tools/nodejs/node.exe`、`D:/Tools/nodejs22` 和 `YARKTEXT_NODE_ROOT`。
- 可用的 pnpm 10 和已安装的工作区依赖。
- VS 2022 C++ 编译工具、Windows SDK，以及目标架构的 Spectre 缓解库。CLI 会选择装有该库的 MSVC 工具集，不需要删除原生模块的 Spectre 配置。
- 可选的 `.tools/7zip/bin/7za.exe`，或通过 `ELECTRON_BUILDER_7ZIP_PATH` 指定 7za；未提供时由 electron-builder 自动获取。

显式指定构建用 Node：

```powershell
$env:YARKTEXT_NODE = 'D:/Tools/nodejs22/node-v22.21.1-win-x64/node.exe'
node scripts/pack.mjs
```

## 产物

`dist/` 保留为 electron-builder 和上游 CI 的构建暂存目录。
成功后将安装包、便携 zip、更新描述和 blockmap 复制到 `Released/v版本号/平台-架构/`，例如 `Released/v1.0.8/win-x64/`，并生成 `SHA256SUMS.txt` 和 `build-info.json`。
默认清理旧暂存产物；只有打包完成后才替换同一版本、平台和架构的输出，保留其他历史版本。

终端显示七个构建阶段的进度条，每个命令显示用时，并保留编译器、下载和 electron-builder 的实时进度。阶段计数不代表时间百分比；完整日志位于 `.tools/pack-logs/`，失败时返回非零退出码。

只检查工具链和输出配置，不构建：

```powershell
node scripts/pack.mjs --check
build.bat --no-pause --check
```

## GitHub Release

发布目标为 https://github.com/yumjasper/YarkDown/releases 。根目录与 desktop 的版本号、标签必须一致。

```powershell
pnpm run release:check
# 完成合并、提交代码后执行：
pnpm run release:publish
# 或：release.bat --publish
```

发布 CLI 要求工作区干净，创建 `vX.Y.Z` 标签并推送到 origin；不会自动提交代码，也不会覆盖已有远端标签。
推送标签触发 `.github/workflows/release.yml`，构建 Windows x64/arm64、macOS Intel/Apple Silicon 和 Linux 下载文件。也可以在 GitHub Actions 的 Release YarkText 页面手动指定已有标签运行。
所有平台成功后汇总更新元数据、生成 SHA-256 校验文件，先上传到草稿再公开 Release。失败时不会公开缺少平台的版本，可在 Actions 查看日志并重跑。

工作流只需要仓库内置的 `GITHUB_TOKEN`，发布任务已声明 `contents: write`。本地推送标签使用已有 Git 登录凭据。

## 发布版性能

本地打包和 Release 工作流都启用 `YARKTEXT_RELEASE=1`：压缩 main/preload/renderer 的生产代码，关闭 sourcemap，使用 ASAR，并排除测试、覆盖率和调试映射文件。原生模块按 Electron 与目标架构构建，自动更新指向本项目仓库。

缩略图 Worker、按需加载和大文件滚动优化同样进入发布包。安装包使用 normal 压缩；maximum 通常只增加打包时间，不会让安装后的编辑器更快。没有强制修改 V8 内存或关闭 GPU 加速。
实际启动和滚动速度仍取决于文件、系统与硬件；每次重要发布应运行下面的打包应用冒烟验证。

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

该脚本启动 `dist/win-unpacked/YarkText.exe`，用临时用户配置和文档验证启动、项目文件名搜索、源码模式双向切换和六级标题命令，结束后清理测试数据。
它使用开发依赖 Playwright 连接 Chromium CDP。快捷键映射和冲突由 `windows-keybindings.spec.ts` 单独验证，CDP 合成键盘输入不等同于 Windows 原生快捷键输入。

## 默认快捷键

- `Ctrl+1` 到 `Ctrl+6`：标题 1 到 6。
- 数字定位标签页命令：默认不绑定快捷键。
- `Ctrl+P`：快速查找打开项目文件夹内的 Markdown 文件名，也支持已打开文件；打印默认不绑定快捷键。
- `Ctrl+/`：在源码模式和所见即所得渲染编辑模式之间切换。

用户自己保存的快捷键仍优先于默认值，不会被构建脚本覆盖。
