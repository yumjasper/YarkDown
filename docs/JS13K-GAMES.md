# 离线移植游戏：来源与构建

当前 js13k 仅保留 Q1K3；另提供公路赛车与俄罗斯方块。三款在“小憩 → 经典精选”或 Markdown 指令中启动，语法见 [GAME-MARKDOWN.md](GAME-MARKDOWN.md)。

## 来源与许可

| 游戏       | 源码与固定版本                                                                                                               | 许可                      |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Q1K3       | [phoboslab/q1k3](https://github.com/phoboslab/q1k3) · 8ee934856c3f5de3c584724b9dd554314a911694                               | MIT；Sonant-X 合成器 zlib |
| 公路赛车   | [jakesgordon/javascript-racer](https://github.com/jakesgordon/javascript-racer) · 3e8a060b5900755db27f899612a74a77427c853e   | MIT 代码                  |
| 俄罗斯方块 | [jakesgordon/javascript-tetris](https://github.com/jakesgordon/javascript-tetris) · e5c0c42f7dac0f3514a55eff656c6e22e95d68ed | MIT                       |

Q1K3 是 js13k 2021 作品，曾入选 [GitHub 编辑推荐](https://github.blog/open-source/gaming/13-tiny-and-terrific-entries-from-the-js13kgames-competition/)，不标注未经确认的总榜名次。赛车为经典 OutRun 风格伪 3D 公路竞速。方块是红白机时代经典消行玩法的开源复刻，不是任天堂 ROM。

赛车上游 README 对音乐和借用的 OutRun 贴图注明了单独限制。本移植只保留 MIT 代码、README 和 LICENSE；所有图形由适配器使用 Canvas 几何图形重新绘制，不复制上游图片、音乐或商标。两款 Jake Gordon 游戏的 stats.js 性能统计库均未引入，生成代码也移除了相关调用。无新增 npm 运行时依赖。

## 固定输入与离线生成

历史目录名保留为 packages/desktop/vendor/js13k/ 和 packages/desktop/src/renderer/public/js13k/，内部实际只包含 q1k3、racer、tetris 三款。vendor 保持上游文件原样；自有适配在 scripts/game-adapters/ 中。运行：

```sh
node scripts/build-js13k.mjs
pnpm run build:unpack
```

构建全程离线。脚本从现有 Vite 依赖取得 esbuild，合并原始脚本、汉化文字、注入存档和输入桥接，生成独立 HTML，并复制许可。Q1K3 地图与模型来自作者发布站 https://phoboslab.org/q1k3/ 的 l、m 文件并内嵌；SHA-256 分别为 f3e89b9c58d343dbcf16803adcfab0f5df5fd5146b533faa10c98a1ab31f7dbb 和 7cf7e7cd8279ec527bf51cf5bcfc85fee8e7c0a09e35ac5610f8afa1fa0cc60d。

## 隔离与生命周期

游戏 iframe 只有 allow-scripts；Q1K3 额外允许 Pointer Lock。没有同源权限及 Electron bridge。每个 HTML 的 CSP 使用脚本 SHA-256，不允许网络请求或运行时 eval。父页面核验消息来源，且只接收各游戏白名单内不超过 4096 字符的存档。

存档仍使用历史前缀 yarktext-js13k:，赛车只允许 fast_lap_time，方块只允许 best，Q1K3 不接受存档。局面不写入 Markdown；每次关闭 iframe 均释放动画及音频。赛车与方块可用 P 或按钮暂停，失焦时也暂停。

验证入口：arcade-classics.spec.ts 验证真实驾驶、消行、记录恢复、离线运行与隔离；arcade-js13k-3d.spec.ts 验证 Q1K3 键鼠与锁定；markdown-games.spec.ts 验证编辑、嵌入及模式切换；js13k.spec.ts 验证存档白名单与桥接。
