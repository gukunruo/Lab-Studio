# Day 07 · Chat Completions API

> Phase 1 · 接口与数据 · ~60 min  
> 标签：`api` `openai-compatible` `messages` `usage`  
> 前置：Day 05（同步 httpx）、Day 06（异步）、Day 01（消息角色）  
> 定位：亲手打通一次非流式 Chat API，搞清每个字段在产品里意味什么。

## 今日目标

能手写最小 `messages` 请求、读懂响应里 `choices` 与 `usage`、用多轮历史实现追问、知道为什么浏览器不能直接持 key 必须 BFF。Cursor 替你藏了 API，做应用时你要自己控模型、超时、重试、鉴权、日志。

## 为什么重要

这是应用层最基础的接口——流式（Day 08）、结构化（Day 09）、工具调用（Day 10）、RAG（Retrieval-Augmented Generation，检索增强生成）（Day 12）全在它之上加参数。今天把"裸调用"打通，后面所有课都是"在这之上加东西"。

## 核心概念

### 1. OpenAI 兼容是事实标准

绝大多数厂商（含国内网关、开源部署）都提供 `POST /v1/chat/completions`，请求体形状一致。学一个，到处能用。

```jsonc
{
  "model": "gpt-4.1-mini",
  "messages": [
    { "role": "system", "content": "你是简洁的助教" },
    { "role": "user", "content": "用一句话解释 RAG" }
  ],
  "temperature": 0.2,
  "max_tokens": 200
}
```

### 2. 请求字段全解（产品里意味什么）

| 字段 | 意味 | 产品决策 |
|---|---|---|
| `model` | 用哪档模型 | 按 Day 03 路由表选；别写死，配置化 |
| `messages` | 这次全部上下文 | 多轮时历史也进这里（见下） |
| `temperature` | 随机性 | 要被解析的输出 → 低（0–0.3） |
| `max_tokens` | 输出上限 | 防失控烧钱；但要给够，否则截断 |
| `top_p` | 采样限制 | 与 temperature 二选一，别同时调 |
| `stream` | 是否流式 | Day 08 专题 |
| `tools` | 工具定义 | Day 10 专题 |

**产品里怎么炸**：不设 `max_tokens` → 模型一口气吐 4000 token，账单和延迟双爆。永远设上限。

### 3. 响应结构

```jsonc
{
  "choices": [{
    "message": { "role": "assistant", "content": "RAG 是先检索再生成……" },
    "finish_reason": "stop"
  }],
  "usage": { "prompt_tokens": 25, "completion_tokens": 12, "total_tokens": 37 }
}
```

- `choices[0].message.content` —— 你要的回复
- `finish_reason` —— `stop` 正常结束 / `length` 撞 max_tokens 被截 / `tool_calls` 要调工具（Day 10）
- `usage` —— **token 账单**，Day 22 成本观测就看它。流式时可能只在末帧或不返回（Day 08 坑）

### 4. 多轮 = 你自己维护历史

服务端无状态（Day 01 已讲）。多轮对话的"记忆"是**你每轮把历史 messages 重发**。完整两轮：

```python
# scripts/multi_turn.py
import os, httpx
from dotenv import load_dotenv
load_dotenv()

history = [{"role": "system", "content": "你是简洁助教"}]

def ask(user_text):
    history.append({"role": "user", "content": user_text})
    resp = httpx.post(
        f"{os.environ['BASE_URL']}/chat/completions",
        headers={"Authorization": f"Bearer {os.environ['API_KEY']}"},
        json={"model": os.environ.get("MODEL", "gpt-4.1-mini"),
              "messages": history, "temperature": 0.2, "max_tokens": 200},
        timeout=60,
    )
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"]
    history.append({"role": "assistant", "content": content})
    return content

print(ask("用一句话解释 RAG"))
print(ask("它和微调的区别是什么？"))  # 模型能答，因为历史在数组里
```

**应用层职责**（关键决策）：

- 保留几轮？（太长裁剪/摘要 → Day 23 Context 管理）
- 是否保留 tool 细节？（tool 结果很长会占窗口，可压缩）
- 谁的对话？（多用户隔离，别串台）

### 5. 密钥安全与 BFF

**浏览器绝不能直持用户级 API Key**——任何用户都能 F12 抓走、被刷爆账单。标准架构：

```
浏览器 → 你的 BFF (/api/ai/chat) → 模型厂商
         ↑ key 在这层，不下发浏览器
```

这正好是 Lab-Studio 的既有模式（`src/learn/ai.ts` 调 `/api/ai/chat`，key 留 Node 侧 dev middleware）。**做产品时 BFF 还要加**：限流（按用户/按 IP）、日志、脱敏、成本归因（Day 22）。

### 6. 失败模式速查（给用户看什么）

| 状态码 | 多半是 | 给用户 |
|---|---|---|
| 401 | 密钥错/过期 | "服务未配置"，别暴露 key |
| 429 | 限流 | "请稍后再试" + 退避重试 |
| 400 (context) | 上下文超长 | 自动裁剪历史重试 |
| 400 (content) | 内容安全拒绝 | "换个问法" |
| 5xx / 超时 | 厂商抖动 | 重试 + 降级模型 |

**产品纪律**：永远 `timeout`、永远 `raise_for_status`、给用户**可读**的错误（不是 raw stack）、可重试的才重试（Day 06/17）。

## 动手练习（30–40 min）

1. **打通非流式**：基于 Day 05 的 `chat_ping.py`，把响应解析完整——打印 `content`、`finish_reason`、`usage` 三项。
2. **两轮追问**：写 `multi_turn.py`（上面那段），第二轮问"它和微调的区别"，验证模型能引用第一轮内容。
3. **故意失败**：用错 Key 或错 model 名制造一次失败，记录状态码与 body，写清你打算给用户什么文案。

## 自检清单

- [ ] 能手写最小 `messages` 请求，不用抄
- [ ] 理解多轮历史由应用维护（无状态）
- [ ] 能解释 `finish_reason` 三种值
- [ ] 看过真实 `usage` 字段，知道 Day 22 要它
- [ ] 知道为何浏览器不持 key、生产要 BFF + 限流

## 明日预告

Day 08 · Streaming：SSE（Server-Sent Events，服务器推送事件）与增量解析 —— 加 `stream: true` 后，响应变成一串 delta，怎么边收边渲染、怎么处理中断。

## 续学提示词

```text
按 docs/ai-learning/00-profile.md 教我 Day 07。
文件：docs/ai-learning/days/day-07-chat-completions-api.md
请审阅我的 multi_turn.py，指出我若上 10 轮会有什么上下文问题。
不要提前讲 Day 08。
```
