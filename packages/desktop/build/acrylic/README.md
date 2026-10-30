# YarkText 原生 Acrylic 安装界面

插件负责窗口与控件渲染。文件解压、升级恢复、文件关联、PDF 选项和静默更新仍由 NSIS 脚本负责。

背景使用 Windows Accent Acrylic，前景使用带预乘 Alpha 的 Direct2D/DirectWrite 表面。主窗口不使用整体透明度。路径输入使用独立原生 Edit 控件，白底与深色文字通过 Alpha 为 255 的 layered 子窗口保持不透明，宿主 manifest 必须声明 Windows 8 及以上兼容。Accent 属于未公开接口，系统策略及未来系统更新可能影响效果；接口不可用时回退为实色背景。

## 构建

需要 Windows、CMake 3.24 及以上和 Visual Studio 2022 桌面 C++ 工作负载。NSIS 插件固定为 Win32 Unicode，使用静态 MSVC 运行库。

```powershell
node scripts/buildInstallerAcrylic.mjs
```

Windows 皮肤生成脚本会自动构建该插件。

## 事件与退出安全

窗口消息处理只将动作入队。ProcessCallbacks 返回一个 NSIS 函数地址或 0，宿主 Pop 后用 Call 执行。插件不调用 ExecuteCodeSegment，避免嵌套插件调用。

页面退出后的消息清理只移除 WM_MOUSEFIRST 至 WM_MOUSELAST。不能不加过滤地丢弃 WM_PAINT：未完成绘制的更新区域会使 Windows 持续生成 WM_PAINT，导致 PeekMessage 清理循环永不结束。此前取消卡死的实际包诊断显示，取消函数与等待循环已返回，卡死发生在这个清理循环。

按钮与复选框支持 hover、pressed、鼠标捕获和移出取消点击。只有在同一控件内按下并释放才触发动作；切页和失去捕获时清除按下状态。

## 不抢焦点的测试

```powershell
& ./packages/desktop/build/acrylic/out/Release/acrylic-smoke.exe --acrylic-preview
python packages/desktop/build/acrylic/test-packaged-cancel.py D:/Tools/YarkDown/dist/acrylic-input-fix/yarktext-win-x64-1.0.33-setup.exe
```

原生测试验证四页渲染、所有按钮与复选框的按下释放、悬停状态、移出取消、路径配色、事件轮询、销毁及前台焦点不变。smoke.nsi 验证真实 NSIS 参数栈、宿主 Call 与插件生命周期。

实际安装包测试只离屏启动并点击取消，检查本次进程族全部退出；失败时只清理本次启动的进程，不执行安装。完全离屏的窗口可能不自动产生绘制消息，因此测试显式投递 WM_PAINT 建立控件命中区域。

## 验证边界

离屏测试不等于完整安装、升级、卸载或最终视觉验收，也不能证明桌面背景的模糊强度。高 DPI、键盘导航与辅助技术仍需专项验证。
