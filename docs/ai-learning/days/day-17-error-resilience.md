# Day 17 · 错误处理与生产韧性

> Phase 2 · 编排与 Agent · ~60 min  
> 标签：`errors` `retry` `timeout` `fallback` `circuit-breaker`  
> 前置：Day 06（重试基础）、Day 07（API 失败模式）、Day 08（流式中断）  
> 定位：AI 应用错误的特殊性 + 生产级重试/超时/降级/熔断设计。

## 今日目标

理解 AI 应用错误为何不同于传统应用（概率性、成本敏感、部分成功），会做错误分类与匹配的重试策略，能给一个 AI 功能设计"重试 + 超时 + 降级 + 熔断"的完整韧性方案。

## 为什么重要

Demo 里一切顺利，生产里天天 429/超时/部分 JSON/限流/内容安全拒绝。AI 应用错误有四个特殊性，传统重试逻辑不够：

1. **概率性**：同样输入两次结果可能不同（模型非确定性）
2. **成本敏感**：重试 = 再花钱，乱重试 = 账单爆
3. **部分成功**：流式吐到一半断了，已收内容算不算成功？
4. **内容层失败**：HTTP 200 但输出是"我不能回答"——status code 看不出

## 核心概念

### 1. 错误分类与匹配策略

| 错误类型 | 例子 | 可重试？ | 策略 |
|---|---|---|---|
| 网络层 | 连接超时、DNS | 是 | 指数退避重试 |
| 限流 429 | rate limit | 是 | 读 `Retry-After` 头，等够再试 |
| 服务端 5xx | 厂商抖动 | 是 | 退避重试 |
| 客户端 4xx | 401/400 参数错 | **否** | 重试也一样错，改代码/改 key |
| 内容安全拒绝 | 200 但被拒 | 视情况 | 改写 prompt 重试一次 |
| 上下文超长 400 | token 超窗口 | 否 | 裁剪历史重试（Day 23） |
| 部分 JSON | 流式结构破损 | 视情况 | 重新生成或降级到非结构化 |

**核心纪律**：**只重试可重试的**。4xx 重试 = 浪费钱 + 一样失败。Day 06 已埋下这条，今天系统化。

### 2. 重试：指数退避 + 抖动

```python
import asyncio, random

async def with_retry(fn, retries=3, base=1.0):
    for attempt in range(retries):
        try:
            return await fn()
        except (httpx.TimeoutException, httpx.HTTPStatusError) as e:
            if isinstance(e, httpx.HTTPStatusError) and e.response.status_code < 500:
                raise  # 4xx 不重试
            if attempt == retries - 1:
                raise
            wait = base * (2 ** attempt) + random.uniform(0, 0.5)  # 抖动防雪崩
            await asyncio.sleep(wait)
```

**抖动（jitter）**：多个客户端同时失败同时重试会雪崩——加随机抖动错峰。**指数退避**：1s→2s→4s，给服务端喘息。

### 3. 超时设计（每层都要）

```
httpx timeout=30        # 单次请求
tool 执行 timeout=10     # 每个 tool
整体 Agent timeout=120   # 整个循环
用户可容忍 = ?            # 产品视角，决定上面三个
```

**产品里怎么炸**：只设 httpx timeout，没设 tool timeout → 某个 tool 卡住拖死整个对话；或整体没上限 → Agent 无限转烧钱。**每层都要 timeout**，从用户可容忍倒推。

### 4. 降级与 Fallback

重试用完还失败，别让用户看 raw stack。降级链：

1. **模型降档**：旗舰失败 → 中档重试（更便宜更稳）
2. **缓存**：同样问题近期答过 → 返回缓存（标注"可能非实时"）
3. **默认回复**："服务忙，稍后再试" + 降级到 FAQ/搜索
4. **部分结果**：流式断了 → 展示已收内容 + "（生成中断）"

```python
async def chat_resilient(q):
    try:
        return await with_retry(lambda: call_model(q, model="flagship"))
    except Exception:
        try:
            return await call_model(q, model="mid")  # 降档
        except Exception:
            return cache.get(q) or "服务忙，请稍后再试"
```

### 5. 熔断与限流（防刷防雪崩）

- **熔断器（circuit breaker）**：连续失败 N 次就"断开"一段时间，直接降级不再调上游——保护被自己打挂的厂商
- **限流**：按用户/IP 限频——防恶意刷你的 key（Day 20 安全 + Day 22 成本）
- **配额**：每用户每天 token 上限——防失控

**前端类比**：熔断器像断路器，过载跳闸保护电路；限流像令牌桶限流中间件。

### 6. 部分成功与流式中断

Day 08 讲了中断保留。生产策略：

- 流式断了，已收内容**保留并展示**（标注中断），别丢弃用户已见的内容
- 后端记 `finish_reason: length/error/null`，区分正常结束 vs 截断 vs 异常
- 用户可点"继续生成"重试——但要传已收内容做续写上下文

### 7. 可观测（错误要能归因）

错误不能只 `print`。每个错误要记：

- 哪一层（httpx/tool/模型/内容校验）
- 状态码/类型
- 耗时与重试了几次
- 用户可见文案是什么
- 归因到成本（这次失败花了多少 token，Day 22 接）

日志带 trace id，能从一个用户报错倒查全链路。

### 8. 失败模式速查

| 症状 | 多半是 |
|---|---|
| 账单暴涨 | 4xx 也在重试 / 无重试上限 / Agent 无步数限制 |
| 用户等死 | 只设 httpx timeout 没设整体上限 |
| 雪崩 | 重试没抖动，多客户端同时重试 |
| 厂商被你打挂 | 没熔断，失败还猛调 |
| 用户看 raw stack | 没降级默认回复 |
| 失败查不到原因 | 没带 trace id + 层级日志 |

## 动手练习（30–40 min）

1. **重试包装**：给 Day 07 的 `chat` 加 `with_retry`（指数退避 + 抖动 + 只重试可重试），故意把 timeout 设 0.01 触发，看日志。
2. **降级链**：实现一个"旗舰失败 → 中档 → 缓存 → 默认回复"的降级链，全失败时返回友好文案。
3. **超时分层**：给 Day 10 的 tool calling 加每层 timeout（httpx/tool/整体），注释标清。
4. **熔断**：写一个简单 circuit breaker（连续 3 次失败断开 30 秒），测试它。

## 自检清单

- [ ] 能区分可重试 vs 不可重试错误
- [ ] 会写指数退避 + 抖动重试
- [ ] 知道每层都要 timeout，从用户可容忍倒推
- [ ] 有降级链（模型降档/缓存/默认回复）
- [ ] 知道熔断与限流防什么（雪崩/被刷）
- [ ] 错误日志带 trace id + 层级 + 成本归因

## 明日预告

Day 18 · AI + 前端：流式 UI —— 把 Day 08 的 SSE（Server-Sent Events，服务器推送事件）接到 Vue 前端，做产品级的流式对话手感。

## 续学提示词

```text
按 docs/ai-learning/00-profile.md 教我 Day 17。
文件：docs/ai-learning/days/day-17-error-resilience.md
请审阅我的降级链，指出哪一环会让用户等死。
不要提前讲 Day 18。
```
