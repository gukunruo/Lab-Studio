# AI 能力设计方法论

> 为后续所有 AI（Artificial Intelligence，人工智能）能力提供统一设计参考。
> 核心信条：**好的设计都是心有灵犀的** —— 优秀的产品（pi、Claude Code、Cursor、Codex）在同一个问题上，往往收敛到相同的少数几条不变量。
> 我们在设计新能力前，先读参考实现，提炼这些不变量，再落地成自己干净的工程化模块。

## 0. 第一原则：先参考，再设计

不要闭门造车。设计任何一个 AI 能力前，先研读业界公认做得好的实现，列出它在关键决策上"为什么这么做"。研读顺序：

- **首选小型、单文件、可通读的实现**（如 pi agent，核心代码几百行），一个下午能读完，收获密度最高。
- 再看大产品的公开文档 / 源码里对应的模块（Cursor 的上下文压缩、Claude Code 的分层系统提示与 AGENTS.md、Codex 的仓库上下文）。
- 把它们的决策抽象成**不变量**，而不是照抄 API 长相。

## 1. 反复出现的不变量（被验证过的共识）

1. **不要无脑全塞**。上下文是预算（预算 = 上下文窗口 − 输出预留），超出就一定丢信息。
2. **分层系统提示而非单块**。基础行为 / 用户设定 / 历史摘要，逐层叠加，宁可精炼不可堆砌。
3. **用压缩替代丢弃**。旧的、边缘的内容压缩成摘要，不直接删。
4. **内容感知截断**。开头重要（搜索结果、文件读取）→ 保留头；结尾重要（长代码尾部）→ 保留头 + 尾；中间用标注省略。
5. **预算感知的窗口化**。保留最近 N 条，超出部分进摘要；窗口大小和单条上限随预算压力动态收缩。
6. **确定性兜底**。没有模型生成的摘要时，用确定性文本兜底（如"（本轮之前已省略 N 条消息，最初的提问：…）"），保证任何输入下都不坍缩。
7. **核心逻辑与传输解耦**。纯函数、provider 无关；接入层（HTTP、SDK）只做搬运。

## 2. 落地模板：任何 AI 能力都按这个结构组织

```
我的能力 = 纯逻辑模块 + 接入层 + 测试
```

- `server/<capability>-engine.ts`：纯函数、provider 无关、可单测。输入是"用户给了什么"，输出是"工程化后的请求体"。
- `server/ai-platform.ts`（或对应 handler）：在到 provider 之前调用引擎，用其结果替换原请求体。**不改** provider builder 签名，保持现有测试稳定。
- `src/**/api.ts` / composable / component：逐层把新参数透传下去；前端不做复杂逻辑。
- `tests/<capability>-engine.test.ts`：走 `npm test`（node:test）覆盖纯函数。

## 3. 案例：上下文工程（context-engine）

**问题**：`/ai-platform/chat` 原本把最多 500 条 message + system 原样扔给 provider，即"把上下文全塞进 prompt"。

**方案**：在 handler 里、认 modelRow 之后、进 provider switch 之前，插入一次 `engineerContext` 预编：

- 过滤出 user / assistant；窗口化——最近 `HISTORY_WINDOW`（40）条保留精确，其余进摘要。
- system 分层：`BASE_SYSTEM` + 用户设定 + 对话前情摘要。
- 单条内容上限 + 内容感知截断（代码 / 报错 → 头 + 标注 + 尾；正文 → 头截断）。
- 预算 = contextWindow − 输出预留；超了就把窗口 / 单条上限减半，最多 6 轮，直到 `估算token × 1.15 ≤ 预算`。
- `maxTokens` 在窗口内收紧，且保留下限（256）。

**关键函数**：`engineerContext`（编排）、`buildSystemPrompt`（分层）、`splitWindow` / `buildPrefixSummary`（窗口 + 摘要兜底）、`truncateMessageContent` / `looksLikeCodeOrOutput`（内容感知）、`estimateTokens`（CJK 感知）。

**验证**：13 个单测覆盖全部纯函数；端到端实测新对话流式回复正常，分层 system 被网关接受，无 400。

**有意推迟**：Anthropic prompt caching。它在 ai-service.tal.com 网关后难以验证，且收益要在长上下文才明显。等跑在可控 provider 上再引入。

## 4. 应用到后续能力

写新能力前，自问：

- 有没有"预算"概念（token / 次数 / 大小 / 时延）？有 → 必须预算感知，不能无条件放大。
- 有没有"历史 / 旧数据"？有 → 用压缩 + 窗口，不丢弃。
- 有没有"每次都要带的长文本"（模板、工具描述、记忆）？有 → 考虑分层与缓存，但先确认能在真实 provider 上验证再引入缓存。
- 边界输入（空、超长、异常格式）会不会坍缩？→ 加确定性兜底。

## 5. 参考实现的可读清单

- **pi agent**：`truncateHead` 的思路——工具结果哪个部分重要就保留哪部分；一律 truncateHead 会丢掉文件结尾的关键代码。配合分支 / 摘要压缩。核心几百行，值得直接读。
- **Claude Code**：分层 system prompt（核心指令 + 记忆文件），AGENTS.md / CLAUDE.md 的持久项目记忆，工具结果截断。
- **Cursor**：上下文压缩，把长对话历史合并成摘要再进入模型；预算控制。
- **Codex**：仓库级上下文，把当前仓库相关背景注入，而非全量历史。
