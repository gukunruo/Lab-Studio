# bloub 吉祥物工作台（步 1）设计

## Context

最终目标是把项目品牌升级为 **G's bot**（用户名字首字母 G 的专属吉祥物，GroK bot 风格：圆润黑色小团子、两只跟随鼠标的眼睛、多种表情/状态动画）。先用开源项目 **bloub** 搭一个可交互的工作台作为底盘，步 2 再据此做 G's bot 定制与全局悬浮拖拽吉祥物。

`bloub`（[jeremy-prt/bloub](/tmp/bloub)）正是对 xAI Grok bot 头像的 SVG 复刻——一个黑色形状在 14 个状态间 morph、两只眼睛独立 morph、眼睛跟随指针。MIT 开源，技术栈与我们一致（Vue3 + Vite + TS）。

## 核心洞察

`src/bot/` 是**框架无关、无时钟的纯引擎**：`engine.sample(t)` 是时间的纯函数。暂停/跳转/测试都得到同一帧。这带来三个对我们极有利的性质：

1. 可整体移植（零 Vue 依赖，全部 `./` 内部导入）。
2. 天然支持冻结帧 / 导出 / 状态板。
3. 形状/颜色/表情/状态都可通过面向外部的 setter 定制，正好支撑步 2 的 G's bot 定制。

## 引擎架构（移植后保留，不重写）

- **形状 = 径向 profile**：统一角度采样（`PROFILE_SAMPLES`），morph = 半径线性插值。新形状走 `profileFromPolygon` / `superellipseProfile` / `regularPolygonProfile` / `unionOfCirclesProfile`。
- **眼睛 = `<mask>` 里的洞**，不是白形状覆盖，自动被轮廓剪裁。
- **`radiusAtAngle`**：贴体元素（眼睛、通知 pastille）跟随真实半径。
- **`Look` 系统**：`yaw/pitch/mix/spin/wander`，绝对方向，引擎负责混合；眼球跟随指针、脚本、漂移在此统一。
- **`eyefit`**：导入期构建的表（非渲染循环求解器），在 customiser 形状上给双眼一个共同偏移。
- **14 个状态**：以 `ArcSpec` 声明，只有引擎栅格化；transition = 指数 ease-out，主体不 overshoot（唯一 spring 是通知 pop `NOTIF_POP=1.14`）。
- **形状双源**：`profiles.ts`（来自视频，驱动动画状态）+ `skins.ts`（customiser 形状，解析构造）。

## 步 1 范围（用户已确认「核心」）

**做**：
- 移植 `src/bot/*` 引擎（`engine/shape/states/skins/profiles/eyefit/face/expressions/decor/cycles/repere/math`）。
- 移植 `src/ui/gaze.ts`。
- 移植 `src/components/BloubBot.vue`（把 i18n `t()` 换成硬编码 aria-label）。
- 新增 `/bloub` top-level 路由 + `src/views/BloubView.vue` 工作台：大机器人（`follow` 开启）+ 控制面板（形状 / 颜色 / 表情 / 状态 / 冻结帧 / 播放）+ 导出 SVG / PNG。
- 引擎回归测试（node:test，与现有 `tests/*.test.ts` 统一）。

**不做**（留到后续）：timeline 编辑器、GIF/MP4 导出、三语 i18n、完整 Settings。步 2 的 G's bot 定制与全局悬浮拖拽另起。

## 落地布局（本项目）

| 来源 | 目标 |
|---|---|
| `/tmp/bloub/src/bot/*.ts` | `src/bot/*.ts` |
| `/tmp/bloub/src/ui/gaze.ts` | `src/ui/gaze.ts` |
| `/tmp/bloub/src/components/BloubBot.vue` | `src/components/BloubBot.vue`（改 aria-label） |
| —（新增） | `src/views/BloubView.vue`、`src/router/index.ts` 注册 `/bloub`、`tests/bloub-engine.test.ts` |

`@` 别名已映射 `src/`，`@/bot/*`、`@/ui/*` 导入直接可用。

## 数据流 / 交互

`BloubBot.vue` 用 `props: size/shape/color/expression/paper/frozenAt/cycle/follow/gaze` + `v-model: block/state/playing/elapsed`。工作台把面板选择（shape/color/expression）绑给组件；`frozenAt` 提供冻结帧；`follow` 提供指针跟随；导出 SVG/PNG 通过序列化 `<svg>` 实现。

## 测试

`tests/bloub-engine.test.ts`（node:test）覆盖最敏感不变量：
- `sample(t)` 确定性 / 纯函数（同 t 同帧）。
- 状态切换产生 morph（中间帧在两端之间）。
- `setShape` / `setExpression` 产生 morph 而非跳变。
- `reset(id)` 清空历史（prev=null），重播首帧不再是「末态 × 首态」混合。
- 冻结帧可复现（`frozenAt` 同值同像素）。

## MIT 署名

`bloub` MIT 许可（作者 Jérémy Perret）。在 `src/bot/` 或组件头部保留版权声明与来源链接。`Grok`/`x.ai` 属其所有者；本项目仅致敬视觉行为，非官方。

## 步 2（后续，不在本 spec 实现）

用引擎定制 G's bot：G's 专属颜色/形状/表情 → 做成全局悬浮可拖拽、拖拽带表情动效的吉祥物，并替换全局 logo、刷新圆角/设计标准。

## 风险与对策

- **`profiles.ts` 是生成数据，勿手改**：来自视频逐帧测量，改动破坏相似度。保留原文。
- **数值是「测量值」非「设置值」**：`docs/measurements.md` 列出的陷阱（眼偏 `\` 约 26°、身体是正圆、过渡是无 overshoot 的指数 ease-out 等）一律不「修正」。
- **BloubBot 的 i18n 依赖**：仅 `t('app.botAria')` 一处，硬编码替换即可，不引入 bloub 的 i18n 层。
