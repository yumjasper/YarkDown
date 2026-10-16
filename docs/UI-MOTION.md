# UI 动效

## 覆盖范围

- 侧边栏重新显示：160 毫秒淡入，外框和拖动手柄不位移；文件/搜索/目录内部视图切换：淡入与 6 像素水平位移。
- 文件树目录和分组展开：淡入；折叠箭头通过 transform 旋转。
- 已打开文件条目：短时透明度与位移动画。
- 源代码和预览模式切换：160 毫秒淡入，源码编辑器仍立即卸载并同步内容。
- 编辑器右键菜单与子菜单：淡入；不缩放菜单，不影响边界尺寸计算。
- 搜索栏和文档提示：按显隐状态触发淡入。
- 常用 Element Plus 弹窗：统一短时淡入淡出，面板仅小幅纵向位移。
- 侧边栏按钮、菜单行、模式按钮和设置分类：短时颜色反馈。
- 设置分类选中指示条：scaleY 替代高度变化。
- 设置分类内容：160 毫秒淡入，分类路由变化时触发；页面即时切换，不保留旧页面，不影响保存与滚动布局。
- TXT 工作区显示、格式工具栏挂载与恢复显示：160 毫秒淡入；输入和文档标签切换不触发正文动画。
- 格式、模式、PDF 批注和阅读、TXT 工具按钮及设置按钮：110 毫秒颜色、背景、边框和透明度反馈；可用按钮按下时以 80 毫秒过渡至 0.97 倍，松开复原。
- 标签激活与关闭按钮：统一 110 毫秒颜色和透明度过渡；新建按钮双向淡入淡出，不动画标签位置或宽度。
- 窗口按钮与设置分类图标：短时颜色反馈，窗口控制按钮不缩放。

## 性能约束

- 不新增动画依赖，不使用持续运行的定时器或逐帧 Vue 状态更新。
- 大区域仅动画 opacity / transform，不动画宽度、高度、模糊或阴影。
- 侧边栏占用宽度即时更新，避免每帧重新排版整个编辑器。拖动宽度时不启动动效。
- 指令默认不执行首次挂载动画，避免文件树初始加载及子目录批量挂载时逐项创建动画。仅菜单、提示、源码与 TXT 视图、格式工具栏显式使用 appear。
- 状态相同的编辑更新不触发动画；连续切换先取消旧动画，不排队。
- 动画无 fill 保留，不设置长期 will-change；结束、隐藏和卸载时取消效果并移除监听。窗口切入后台时也取消正在播放的指令动效。
- 不给编辑器添加 transform，避免改变内部 fixed 定位工具的位置。
- 不延迟源码视图卸载，避免内容同步、光标和撤销记录交接改变。
- 后台窗口不播放新增动画。
- 自动遵循 prefers-reduced-motion。设置改变时取消正在播放的指令动画；系统减少动态效果开启后，应用外壳过渡直接完成。
- 减少动态效果的 CSS 覆盖限定在 UI 外壳，不全局关闭 Markdown 用户内容或嵌入游戏的动画。

## 实现

统一时长和 CSS 过渡位于 `packages/desktop/src/renderer/src/assets/styles/motion.css`。
轻量指令位于 `packages/desktop/src/renderer/src/util/uiMotion.ts`。

默认 `v-ui-motion="状态键"` 在键变化且为真时播放淡入；`.slide` 添加小幅水平位移；`.appear` 允许首次挂载播放。对象键按引用比较，不做深层遍历。

## 验证

```powershell
pnpm -C packages/desktop exec vitest run test/unit/specs/ui-motion.spec.ts
pnpm run test:quick
pnpm run typecheck
pnpm run build:unpack
pnpm -C packages/desktop exec playwright test test/e2e/ui-motion.spec.ts test/e2e/ui-controls-motion.spec.ts test/e2e/issue-2421-sidebar-state.spec.ts test/e2e/source-mode-flush.spec.ts test/e2e/editor-context-menu.spec.ts
```

2026-10-16 补齐验证：动效单元测试 7 项、两项 UI 动效 Electron 集成测试、类型检查和构建通过。新集成测试覆盖按钮按压与复原、禁用按钮、格式工具栏恢复、设置分类淡入、减少动态效果，以及结束后无持久动效和无编辑器位移。
