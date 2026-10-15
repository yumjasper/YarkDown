# 文档缩略图与性能

Markdown 阅读视图、Markdown 源码视图和 TXT 编辑器共用缩略图。默认位于右侧滚动条旁边。

- 点击缩略图定位，拖动视口滑块连续浏览，也可以在缩略图上滚动鼠标滚轮。
- 聚焦缩略图后，方向键、Page Up/Down、Home/End 可以导航。
- 悬浮时显示半透明视口滑块及关闭按钮；关闭后可以右键滚动条重新开启，也可通过“视图 → 显示缩略图”或编辑器/TXT 偏好中的开关恢复。
- 右键滚动条或缩略图，通过勾选项和二级菜单设置字符/色块、按比例/适应/填满、缩放、滑块显示、自动隐藏和左右位置。设置自动保存。
- 字符按统一字宽绘制，不再强制横向压缩；缓存画布采用 2–3 倍像素密度，分块位置对齐像素网格。提高分辨率的成本限于可见区域附近的少量缓存，滚动时继续复用分块。
- 搜索匹配和文本光标位置带有标记。Markdown 按渲染后的段落、代码块和实际块高度绘制，TXT/源码按 CodeMirror 行高定位。

交互参考 [VS Code 的缩略图](https://code.visualstudio.com/docs/editing/getting-started/userinterface)。这是适配现有 Muya/CodeMirror 的轻量实现；没有引入 Monaco，也不包含 VS Code 扩展提供的诊断、Git 状态或折叠区域语义。

## 已实施的优化

1. 编辑窗口在首次绘制准备好后显示，并提供轻量启动提示，避免提前显示空白原生窗口。
2. 偏好页按路由延迟加载；Element Plus 只注册实际使用的组件和样式。Word/图片导出模块及其依赖推迟到实际导出时加载。
3. 大于 160,000 字符的 Markdown 源码启用 CodeMirror 视口渲染，避免把全文行节点同时放入 DOM。
4. 源码光标移动只保存光标，不再反复统计全文字数；内容变化及保存前仍同步文本。
5. 去掉新打开 Markdown 的重复渲染，并用两个 32 位整数执行原有 FNV-1a 64 位计算，保持保存状态指纹完全一致。
6. 缩略图在独立 Worker 中绘制，使用 OffscreenCanvas 和 ImageBitmap，主线程只移动缓存图层。复用 768 像素高的分块，缓存范围限制在可见区域附近，最多并行排队四个绘制任务；关闭缩略图会释放 Worker 和缓存。

## 本机验证记录

- 首屏主脚本约从 6,768 KB 降至 5,017 KB，主样式从 727 KB 降至 486 KB。不同构建的哈希、代码变动会影响精确大小。
- 对 1 MiB 文本建立一次保存状态并计算五次状态指纹，本机约从 117 ms 降至 34 ms；单元测试验证与原算法逐位一致。
- 1,800 段 Markdown 样本的打开时间约 3.26 s / 3.28 s，含测试启动等待；这组数据没有显示可确认的整文件打开提速。新增缩略图后的滚动帧间隔 P95 约 7.9 ms，原样本约 7.2 ms。
- 对包含大量图片及公式的《实时渲染》第 10 章重新测试，Worker 版缩略图启用时，90 帧样本的帧间隔 P95 约 8.4 ms，最慢约 11.7 ms。该结果受系统负载、字体和图像缓存影响，不作为固定帧率保证。
- 大文件阅读视图仍使用 Muya 的完整文档树；大量图片、公式与系统文件缓存、字体和磁盘速度仍会影响实际表现。上述记录来自生产构建代码的本机预览，不能代表所有机器或安装包冷启动。

回归检查：

```powershell
pnpm test:quick
pnpm lint
pnpm typecheck
pnpm build:unpack
pnpm -C packages/desktop exec playwright test test/e2e/minimap.spec.ts test/e2e/menu-zoom-preferences.spec.ts test/e2e/plain-text.spec.ts test/e2e/source-mode-flush.spec.ts
```
