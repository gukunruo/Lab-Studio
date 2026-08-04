# Day 08 · Streaming：SSE 与增量解析

> Phase 1 · 接口与数据 · ~60 min  
> 标签：`streaming` `sse` `delta` `abort`  
> 前置：Day 06（async httpx）、Day 07（Chat API）  
> 定位：流式专题。Tool Calling 已拆到 Day 10，今天只讲流式传输与增量解析。

## 今日目标

理解流式为何决定 Chat 产品手感、能解析 SSE 的 `data:` 帧与 delta、能处理中断与 `usage` 末帧坑。学完你能跑一个"边收边打印"的最小流式客户端。

## 为什么重要

用户感知的"快"来自**首 token 延迟 + 边收边渲染**，不是整段生成结束。非流式要等 5 秒一把吐出，流式 0.3 秒就开吐——体感差 10 倍。Day 18 流式 UI 会把它接到前端，今天先打通协议与解析。

## 核心概念

### 1. 为什么流式

LLM（Large Language Model，大型语言模型）逐 token 生成。非流式 = 等全部生成完再返回整段；流式 = 生成一个就推一个。

- **TTFT（Time To First Token，首 Token 延迟）**：用户看到第一个字的等待——决定"快不快"
- **吐字速度**：后续 token 速率——决定"卡不卡"
- 总时长差不多，但**体感天差地别**

**前端类比**：像 Vue 的 SSR 流式渲染（`renderToNodeStream` 边算边推）vs 等整页 HTML。先 paint 关键内容，用户立刻有反馈。

### 2. SSE 协议（Server-Sent Events，服务器推送事件）

加 `stream: true` 后，响应 `Content-Type: text/event-stream`，是一串文本帧：

```
data: {"choices":[{"delta":{"content":"RAG"}}]}

data: {"choices":[{"delta":{"content":" 是"}}]}

data: [DONE]
```

- 每帧以 `data:` 开头，帧间空行分隔
- 帧里是 JSON，`delta.content` 是**增量片段**（不是整段，要累积）
- `data: [DONE]` 标志流结束
- 一条 JSON 可能被 TCP 拆成多块到达——要按空行切块、跨块拼接

### 3. delta 增量 vs 整段 message

非流式响应是 `choices[0].message.content`（整段）。流式是 `choices[0].delta.content`（片段）。**你要自己累积**：

```python
full = ""
async for line in resp.aiter_lines():
    if not line.startswith("data:"):
        continue
    data = line[5:].strip()
    if data == "[DONE]":
        break
    evt = json.loads(data)
    delta = evt["choices"][0].get("delta", {}).get("content")
    if delta:
        full += delta          # 累积
        print(delta, end="", flush=True)  # 边收边渲
```

**产品里怎么炸**：以为是整段、直接 `JSON.parse` 取 content → 拿到一堆碎片或报错。流式必须累积。

### 4. 完整可跑流式客户端

```python
# scripts/stream_chat.py
import asyncio, os, json, httpx
from dotenv import load_dotenv
load_dotenv()

async def stream_chat(user_text: str):
    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream(
            "POST",
            f"{os.environ['BASE_URL']}/chat/completions",
            headers={"Authorization": f"Bearer {os.environ['API_KEY']}"},
            json={
                "model": os.environ.get("MODEL", "gpt-4.1-mini"),
                "messages": [{"role": "user", "content": user_text}],
                "stream": True,
                "temperature": 0.2,
            },
        ) as resp:
            resp.raise_for_status()
            full = ""
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    evt = json.loads(data)
                except json.JSONDecodeError:
                    continue  # 跨块断行，等下一帧
                choice = evt.get("choices", [{}])[0] or {}
                delta = choice.get("delta", {}).get("content")
                if delta:
                    full += delta
                    print(delta, end="", flush=True)
            print()
            return full

asyncio.run(stream_chat("用三步解释什么是上下文窗口"))
```

### 5. usage 在流式的坑

非流式响应里 `usage` 直接在顶层。流式时：

- 多数厂商只在**末帧**带 `usage`（或单独的 `stream_options: {include_usage: true}`）
- 有的厂商流式根本不返回 usage

**产品里怎么炸**：默认按非流式从顶层取 `usage` → 流式拿到 `None`，成本统计全空。要么开 `include_usage`、要么用"输入 token = 历史 token 数"自己粗估。

### 6. 中断与取消

用户点"停止"要能立即中断生成，且**别浪费已收的内容**：

- Python：`asyncio.CancelledError` 捕获，保留已累积的 `full`
- 前端（Day 18）：`AbortController` + `fetch` signal；中断时把已收文本当作"被截断的回答"保留

```python
try:
    full = await stream_chat(q)
except asyncio.CancelledError:
    full = "<已中断>"  # 实际保留已累积的 full
```

### 7. 失败模式速查

| 症状 | 多半是 |
|---|---|
| 只收到一半就停 | 没 break on `[DONE]`、或异常没处理就退出 |
| 收到碎片或 raw JSON | 以为是整段没累积，或没跨块拼接 |
| 成本统计是 0 | 流式没取末帧 usage |
| 停不掉 | 没传 signal/cancel，或没清理 in-flight 连接 |
| 首帧很慢 | 服务端 TTFT 高（模型大/思考长），非客户端 bug |

## 动手练习（30–40 min）

1. **跑通流式**：写 `stream_chat.py`（上面那段），跑通看到 token 逐段打印。
2. **累积校验**：流结束后，把累积的 `full` 和非流式同问题的输出对比，验证内容一致。
3. **中断测试**：跑流式时 Ctrl+C，观察 `CancelledError` 是否被捕获、已收内容是否保留。
4. **usage 探针**：打印末帧的完整 JSON，看 `usage` 在不在、在哪。

## 自检清单

- [ ] 能解释首 token 延迟决定体感
- [ ] 能解析 SSE 的 `data:` 帧与 `[DONE]`
- [ ] 知道 delta 要累积、跨块断行要等下一帧
- [ ] 知道流式 usage 的坑与解法
- [ ] 会在中断时保留已收内容

## 明日预告

Day 09 · 结构化输出与 JSON Mode —— 让模型吐可被代码消费的结构，告别"JSON.parse 偶发崩"。

## 续学提示词

```text
按 docs/ai-learning/00-profile.md 教我 Day 08。
文件：docs/ai-learning/days/day-08-streaming-sse.md
请检查我的 stream_chat.py 会不会漏处理 [DONE] 或跨块断行。
不要提前讲 Day 09。
```
