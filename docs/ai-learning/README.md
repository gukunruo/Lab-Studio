# AI 应用开发 · 学习路径

> 给前端工程师的 AI Application Engineering 课表。  
> 每天约 1 小时，主攻**应用**而非模型训练。  
> 仓库内入口：Lab Studio 顶栏右侧 **Learn** → `/learn`

---

## 你是谁 / 目标是什么

| 项 | 内容 |
|---|---|
| 背景 | 前端工程师；Python 学过但生疏 |
| 已会 | Cursor / Claude Code；多模型（Auto、Gemini、ChatGPT、Claude、GLM）；偶用 API；试过 MCP、Skill |
| 听说过 | LangChain、LangGraph、RAG（只听过名字） |
| 目标 | 理解 AI 应用层知识；更好用 AI 开发与调优；做 **AI + 前端/全栈** 产品 |
| 不做 | 不主攻算法与模型训练 |
| 节奏 | 工作日每天约 1 小时 |

详细人设与约束见 [`00-profile.md`](./00-profile.md)。  
换工具续学见 [`HOW-TO-RESUME.md`](./HOW-TO-RESUME.md)。

---

## 四周课表总览

24 节，约 5 工作周。每日文件在 [`days/`](./days/)，格式统一：今日目标 → 为什么重要 → 核心概念 → 动手练习 → 自检清单 → 明日预告 → 续学提示词。

| 阶段 | 天数 | 课表 | 你要带走的能力 |
|---|---|---|---|
| **P0 地基与语言** | Day 01–06 | LLM 心智模型 / 提示词工程 / 模型选型与工具链 / Rules·Skills·MCP 地图 / Python 急救A(同步) / Python 急救B(异步·流式) | 能说清 AI 在干什么，会用 Python 打通一次调用 |
| **P1 接口与检索** | Day 07–12 | Chat API / Streaming·SSE / 结构化输出·JSON Mode / Tool Calling / Embeddings·向量库·RAG 架构 / 迷你 RAG 实现 | 能调 API、解析流式、做一次可跑的 RAG |
| **P2 编排与 Agent** | Day 13–17 | LangChain(最小链) / LangGraph(状态机) / Agent vs Workflow / MCP 实战·Skill 固化 / 错误处理与韧性 | 能选对编排方式，会控住失败与重试 |
| **P3 产品与工程** | Day 18–24 | 流式 UI / Chat 交互模式 / Prompt Injection 安全 / 评测与迭代 / 成本·延迟·可观测 / Context 管理 / 毕业项目 | 能把 AI 做成可上线、安全、可评测的前端产品 |

**可跑代码的 9 节**（必须本机跑通）：Day 05、06、07、08、10、12、13、14（Python）+ Day 18（Vue 流式 UI）。
**概念深化的新增节**：Day 09（结构化输出）、Day 12（RAG 实现）、Day 17（错误韧性）、Day 20（安全）、Day 23（Context 管理）。

---

## 进度追踪（可手改）

在下面把完成的打成 `[x]`。应用内进度存在浏览器 `localStorage`，**以本文件为权威备份**（换机器/换 AI 时看这里）。

### P0 · 地基与语言
- [ ] Day 01 · LLM 心智模型
- [ ] Day 02 · 上下文与提示词工程
- [ ] Day 03 · 模型选型与工具链
- [ ] Day 04 · Rules / Skills / MCP 地图
- [ ] Day 05 · Python 急救 A：语法、环境、同步 HTTP
- [ ] Day 06 · Python 急救 B：异步、流式与错误

### P1 · 接口与检索
- [ ] Day 07 · Chat Completions API
- [ ] Day 08 · Streaming：SSE 与增量解析
- [ ] Day 09 · 结构化输出与 JSON Mode
- [ ] Day 10 · Tool Calling：让模型调用函数
- [ ] Day 11 · Embeddings、向量库与 RAG 架构
- [ ] Day 12 · 迷你 RAG 实现

### P2 · 编排与 Agent
- [ ] Day 13 · LangChain：跑通最小链
- [ ] Day 14 · LangGraph：跑通最小状态机
- [ ] Day 15 · Agent vs Workflow 决策
- [ ] Day 16 · MCP 实战与 Skill 固化
- [ ] Day 17 · 错误处理与生产韧性

### P3 · 产品与工程
- [ ] Day 18 · AI + 前端：流式 UI
- [ ] Day 19 · Chat 产品交互模式
- [ ] Day 20 · Prompt Injection 与安全
- [ ] Day 21 · 评测与 Prompt 迭代
- [ ] Day 22 · 成本、延迟、可观测性
- [ ] Day 23 · Context 管理与长对话
- [ ] Day 24 · 毕业项目：选题与路线图

**当前进度备注（自由写）：**

```
最近完成：
卡点：
下一步：
```

---

## 每日学习节奏（建议 60 分钟）

| 分钟 | 做什么 |
|---|---|
| 0–5 | 打开当日 `days/day-XX-*.md`，扫「今日目标」 |
| 5–25 | 读「核心概念」，对照自己日常开发场景 |
| 25–50 | 做「动手练习」（写代码 / 调 API / 改 Prompt） |
| 50–60 | 勾自检清单；把续学提示词存好；更新本 README 进度 |

卡住超过 15 分钟：把卡点 + 已试过的步骤贴给任意 AI，附上 [`HOW-TO-RESUME.md`](./HOW-TO-RESUME.md) 里的续学模板。

---

## 仓库地图

```
docs/ai-learning/           ← 权威课程文档（任意工具可读）
  README.md                 ← 你在这里
  00-profile.md
  HOW-TO-RESUME.md
  days/day-01-llm-mental-model.md
       … day-12-mini-rag-impl.md
       … day-24-capstone.md

src/learn/curriculum.ts     ← 课表元数据（供 UI）
src/views/LearnView.vue     ← 全屏学习页（路由 /learn）
```

---

## 原则

1. **应用优先**：每课都能对应到「写产品 / 调工具 / 排问题」。
2. **概念够用就停**：不追论文，追可迁移的心智模型。
3. **文档即记忆**：聊天记录会丢；本目录不会。
4. **前端优势要保留**：UI、交互、工程化是你的护城河，AI 是放大器。
