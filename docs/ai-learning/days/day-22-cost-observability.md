# Day 22 · 成本、延迟、可观测性

> Phase 3 · 产品与工程 · ~60 min  
> 标签：`cost` `latency` `observability` `ops`  
> 前置：Day 03（成本直觉）、Day 07（usage 字段）、Day 17（错误日志）  
> 定位：上线后怎么看用量、怎么控成本、怎么追问题。

## 今日目标

会粗算一次请求的成本与延迟构成、知道要打哪些日志/指标、能用限流配额控住失控、知道隐私边界。

## 为什么重要

AI 功能"能 demo"容易，"可控地跑"难。工程师要看用量与体验数字——不然上线就是黑盒：账单爆了不知道哪条对话、慢了不知道卡在哪步、错了查不到原因。Day 03 讲过 Agent 成本放大，今天把它量化、可观测化。

## 核心概念

### 1. 成本粗算

```
单次成本 ≈ (input_tokens × 价_in + output_tokens × 价_out)
总成本  = 单次 × 调用次数 × (Agent 放大倍数)
```

**Agent 放大**：一个 10 步 Agent = 单次的 20–40 倍 token（每步 input + output 都计）。

**杠杆**（按 ROI 排）：

- 缩短 system prompt（长期 prompt 占窗口又计费）
- 缩小检索片段（Top-K 别贪多）
- 用更小模型做非关键步（如摘要/分类用轻量，关键生成用中档）
- 缓存重复查询
- 限制 Agent 步数

### 2. 延迟构成

| 段 | 影响体感 |
|---|---|
| 排队 / 网络 | 中 |
| **TTFT（Time To First Token，首 Token 延迟）** | **大**——决定"快不快" |
| 吐字速度 | 中——决定"卡不卡" |
| 整段完成时间 | 中——非流式才敏感 |
| 工具调用 RTT | 大——每步加往返 |
| 检索耗时 | 中——可离线预算 |

**优化常先盯 TTFT 与工具步数**。TTFT 高多半是模型大/思考长；工具步数多多半是 Agent 失控。

### 3. 必打日志字段

每次调用记：

- `request_id`、`user_id`（注意隐私）
- `model`、`prompt_version`
- `input_tokens`、`output_tokens`、`cost_estimate`
- `ttft`、`total_latency`、`tool_steps`、每 tool 耗时
- `error_code`、`aborted`
- `trace_id`（能从用户报错倒查全链路，呼应 Day 17）

### 4. 产品限流配额

- 每用户 RPM（每分钟请求数）
- 最大输入长度（防塞巨长上下文）
- 最大工具步数（防 Agent 失控，呼应 Day 14/17）
- 预算熔断（按用户/全局日预算超了降级）

### 5. 隐私

日志**不要默认存完整 prompt**——用户会粘贴密钥、个人信息、商业机密。可哈希或截断，特别敏感字段单独脱敏。Day 20 已讲输出不可信，这里讲输入也要防泄露。

### 6. 可观测工具

| 选项 | 何时用 |
|---|---|
| 自研日志 + Grafana | 已有基建 |
| **LangSmith / LangFuse** | 想要现成的 trace + 评测 + 成本一体面板 |
| 厂商自带面板 | 起步 |

LangSmith/LangFuse 能把"一次对话 = 多步 trace"可视化，调试 Agent 与 RAG 特别有用（每步看到 input/output/latency/cost）。

### 7. 失败模式

| 症状 | 多半是 |
|---|---|
| 账单爆不知道哪条 | 没按 user_id 归因成本 |
| 慢不知道卡哪步 | 没 trace 每步 latency |
| 被 429 刷爆 | 没限流 |
| 日志泄密钥 | 存了完整 prompt |
| 优化半天没数据 | 没 baseline 指标 |

## 动手练习（30–40 min）

1. **成本估算**：假设 input 2k、output 500、自查一档模型单价，算 1k 次对话成本。再算"如果上 10 步 Agent"的版本，对比倍数。
2. **指标看板**：为"文档问答"列 5 个指标 + 告警阈值（如 TTFT > 2s 告警、单用户 > 60 RPM 限流）。
3. **补 usage 日志**：检查 Day 06/07 脚本是否打印了 usage，没有就补；加 trace_id。
4. **配额设计**：给你 Day 18 的 Chat 定一组限流配额（RPM/最大输入/最大步数/日预算）。

## 自检清单

- [ ] 会做 token 成本估算 + Agent 放大倍数
- [ ] 知道 TTFT 的意义与优化方向
- [ ] 能列出最小可观测字段 + trace_id
- [ ] 有产品限流配额方案
- [ ] 知道日志不存完整 prompt 的隐私边界

## 明日预告

Day 23 · Context 管理与长对话 —— 历史越长越贵越超窗口，怎么裁剪、摘要、外存。

## 续学提示词

```text
按 docs/ai-learning/00-profile.md 教我 Day 22。
文件：docs/ai-learning/days/day-22-cost-observability.md
请审我的指标看板是否过于空洞、配额是否合理。
不要提前讲 Day 23。
```
