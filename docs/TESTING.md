# 日常测试流程

在仓库根目录运行。先安装依赖：`pnpm install`。

| 场景                                 | 命令                                                                    | 是否启动应用 |
| ------------------------------------ | ----------------------------------------------------------------------- | ------------ |
| 每次修改后的默认检查                 | `pnpm test:quick`                                                       | 否           |
| 提交前的完整无窗口检查               | `pnpm test:check`                                                       | 否           |
| UI、IPC、preload、窗口或保存流程变更 | `pnpm test:smoke`                                                       | 一次         |
| 专项界面回归                         | `pnpm -C packages/desktop exec playwright test test/e2e/<name>.spec.ts` | 依用例而定   |
| 发布前的桌面全量回归                 | `pnpm build:unpack`，然后 `pnpm test:e2e`                               | 多次         |

`test:quick` 跑 desktop 和 Muya 两套完整单元测试，不打包、不启动 Electron。
每套最多使用四个 worker，串行执行两套，避免同时占满 CPU 和内存。
不默认使用 Git related/changed 筛选：仓库有读取源码和 CSS 的回归测试，
这种依赖不一定能被测试框架的 import 图识别，筛选可能漏掉测试。

`test:check` 在快速测试之后检查根目录 lint、desktop 类型、Muya lint 和类型，
并运行 CommonMark/GFM 一致性测试。任一步失败立即停止，退出码保留，终端显示失败命令。
它不包含 Muya CSS lint、浏览器 E2E 或打包验证；这些仍按变更范围和 CI 要求执行。

`test:smoke` 先重新构建（包含 locale minify），然后用一个临时文档、一个隔离用户目录、
一次 Electron 启动验证渲染、键盘编辑、源码模式往返、实际保存和新建标签页。
用例用 `test.step` 标记检查点，失败信息指明对应步骤，结束时关闭应用；关闭自动重试以免反复启动。
异常会使测试失败，不依靠错误弹窗提醒人工。它会显示一个真实应用窗口；
Playwright 的 `headless: true` 不控制 Electron 的原生窗口。

冒烟测试覆盖核心链路，不能代替具体功能的回归测试，例如原生对话框、多窗口、
系统快捷键、主题细节和打包后的行为。相关变更仍需运行对应 spec。
打包后的验证使用 `node scripts/smoke-packaged.mjs <exe路径>`。

连续开发时可在单独终端运行：

```sh
pnpm test:watch:desktop
pnpm test:watch:muya
```

针对已知功能可先运行单个单元测试：

```sh
pnpm -C packages/desktop exec vitest run test/unit/specs/editor-default-width.spec.ts
pnpm -C packages/muya exec vitest run src/state/__tests__/tocBlock.spec.ts
```

新增回归优先放在能重现问题的最低层：解析、序列化、状态、路径和命令逻辑用单元测试；
真实浏览器的光标、布局、输入行为用 Muya 浏览器 E2E；跨 Electron 进程和原生功能用 desktop E2E。
等待可观察状态或使用 `expect.poll`，避免用长固定延时掩盖时序问题。
