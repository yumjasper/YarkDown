# 安装资源完整性

## 2026-11-02 故障与恢复

已安装的 1.0.36 主程序与 `dist/win-unpacked/resources/app.asar` 的 SHA256 相同，但安装目录缺少 `resources/static` 和 `resources/icons`。这导致主进程读取默认偏好失败，尚未解析用户文档就退出。

同版本 ZIP 和 NSIS 安装包都包含这两个目录；已实际从 NSIS 安装包解压静态资源验证。现有安装脚本没有删除这两个目录的步骤，因此不能将本次故障归因于打包遗漏。资源为何从安装目录缺失尚无直接证据，可能与不完整的手工部署、安装释放或安装后删除有关。

当前安装已从主程序哈希匹配的同版本 unpacked 产物补回两个目录。恢复过程不覆盖用户偏好、不修改文档，也不修改文件关联。

## 打包与安装门禁

`electron-builder.yml` 的 `afterPack` 钩子验证默认配置、应用图标、Markdown 关联图标，以及全部十二种语言的压缩配置；JSON 必须是有效且非空的对象。钩子在复制 extraResources 后、生成 ZIP/NSIS 等发行产物之前执行，覆盖 `pnpm pack`、平台构建脚本及直接调用 electron-builder 的入口。

NSIS 的 `customInstall` 在文件释放后、文件关联注册前检查主程序归档、默认偏好、中英文语言包和关联图标。缺失时安装中止并返回错误码 2，交互模式提示重新运行完整安装包，静默模式不弹窗。

`pnpm test:quick` 和 `pnpm test:check` 包含资源验证的回归测试。单独运行：

```powershell
node --test scripts/validate-packaged-resources.test.mjs
```

## 部署要求

优先运行完整 NSIS 安装包，或完整解压 ZIP 到独立目录。不要只替换 `app.asar`：应用版本变更可能同时要求更新 `app.asar.unpacked`、`resources/static`、`resources/icons` 和运行库。不要混用不同版本的资源。

修复或升级前保留用户数据目录，不要删除 `%APPDATA%/YarkText`。验收时正常启动程序打开一个 Markdown 文件，并检查主窗口和本次启动日志。发行构建关闭了 Node 调试参数，不能将 Playwright 调试连接超时直接认定为程序启动失败。

本次未执行真实覆盖重装，以避免自动卸载与注册表变更干扰用户当前安装。已通过同版本 NSIS 有效载荷解压验证资源，以及修复后真实安装的正常启动验证；新增安装校验另通过 NSIS 编译验证。
