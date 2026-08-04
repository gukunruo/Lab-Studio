# Day 06 · Python 急救 B：异步、流式与错误

> Phase 0 · 地基 · ~60 min  
> 标签：`python` `asyncio` `httpx` `streaming` `retry`  
> 前置：Day 05（同步 httpx、venv、.env）  
> 定位：在同步底子上加异步，直接为 Day 08 流式 UI、Day 12 RAG（Retrieval-Augmented Generation，检索增强生成）并发、Day 17 重试铺路。

## 今日目标

理解 Python `async/await` 与 JS 的异同、能用 `async httpx` 跑流式请求（SSE（Server-Sent Events，服务器推送事件）增量解析）、会写超时与简单重试、知道"阻塞事件循环"这个最常见的炸点。

## 为什么重要

LLM（Large Language Model，大型语言模型）流式输出是 SSE，SDK 与 LangChain 大量异步，并发调多个 embedding/检索也靠异步。Day 05 的同步 `httpx.post` 拿到的是整段响应——但流式要"边收边处理"，必须异步。这课把异步最小必要一次讲清。

## 核心概念

### 1. 为什么 AI 用异步

- **流式**：token 一段段吐，要边收边渲染（不等整段）→ 异步读流
- **并发**：同时调 embedding + 检索 + 另一个模型 → `asyncio.gather` 并发
- **不阻塞**：一个请求等 API 时，别的请求能继续

**前端类比**：和浏览器 `fetch` + `await` 完全一样的心智——单线程事件循环，IO 不阻塞。Python `asyncio` 就是浏览器的 event loop，`httpx.AsyncClient` 就是 `fetch`。

### 2. asyncio 基础

```python
import asyncio, httpx

async def main():
    print("hi")
    # await 才会让出事件循环

asyncio.run(main())  # 启动事件循环跑 main
```

**与 JS 的关键差异**：

| | JS | Python |
|---|---|---|
| 顶层 await | 支持 | 不支持，必须 `asyncio.run()` 启动 |
| 事件循环 | 浏览器/Node 内建 | 需显式 `asyncio.run` 或框架提供 |
| `await` 忘写 | 报错明显 | **返回协程对象而非结果，静默出错**——最常见坑 |

**记住**：Python 里 `await` 忘写不会报错，会拿到一个没跑的 coroutine 对象——这是新手最痛的坑。

### 3. 异步调 API（对比 Day 05）

```python
# scripts/chat_async.py
import asyncio, os, httpx
from dotenv import load_dotenv

load_dotenv()

async def chat():
    API_KEY = os.environ["API_KEY"]
    BASE_URL = os.environ.get("BASE_URL", "https://api.openai.com/v1")
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {API_KEY}"},
            json={
                "model": os.environ.get("MODEL", "gpt-4.1-mini"),
                "messages": [{"role": "user", "content": "用一句话解释 context window"}],
            },
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]

print(asyncio.run(chat()))
```

`AsyncClient` 复用连接池——并发场景比每次新建 client 高效得多。

### 4. 流式读取 SSE（为 Day 08 铺路）

加 `stream: True`，响应变成一串 `data:` 事件，要**边收边处理**：

```python
# scripts/stream_demo.py
import asyncio, os, json, httpx
from dotenv import load_dotenv

load_dotenv()

async def stream_chat():
    API_KEY = os.environ["API_KEY"]
    BASE_URL = os.environ.get("BASE_URL", "https://api.openai.com/v1")
    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream(
            "POST",
            f"{BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {API_KEY}"},
            json={
                "model": os.environ.get("MODEL", "gpt-4.1-mini"),
                "messages": [{"role": "user", "content": "数到 5，每个数字单独一行"}],
                "stream": True,
            },
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    evt = json.loads(data)
                except json.JSONDecodeError:
                    continue  # 跨块断行，跳过等下一帧
                delta = evt.get("choices", [{}])[0].get("delta", {}).get("content")
                if delta:
                    print(delta, end="", flush=True)
        print()  # 收尾换行

asyncio.run(stream_chat())
```

关键点：

- `client.stream()` 是上下文管理器，进去后**不立即拿到 body**，而是拿一个可迭代的流
- `async for line in resp.aiter_lines()` 逐行收
- `data: [DONE]` 是流结束标志
- 一条 SSE 事件可能被 TCP 拆成多块——`JSONDecodeError` 时等下一帧再拼，别崩

### 5. 超时、异常与简单重试

```python
async def chat_with_retry(client, payload, retries=3):
    for attempt in range(retries):
        try:
            resp = await client.post(url, json=payload, timeout=30)
            resp.raise_for_status()
            return resp.json()
        except httpx.TimeoutException:
            if attempt == retries - 1:
                raise
            await asyncio.sleep(2 ** attempt)  # 指数退避
        except httpx.HTTPStatusError as e:
            if e.response.status_code < 500 or attempt == retries - 1:
                raise  # 4xx 不重试，5xx 才重试
            await asyncio.sleep(2 ** attempt)
```

**重试纪律**：

- 只重试**可重试**的错（超时、5xx、429 限流），**不重试** 4xx（参数错，重试也一样错）
- 指数退避（`2 ** attempt`）避免冲撞
- 有上限，别无限重试（Day 17 会加熔断器）

### 6. 失败模式速查

| 症状 | 多半是 |
|---|---|
| 拿到 coroutine 对象而非结果 | 忘了 `await` |
| 整个程序卡死不动 | 同步阻塞调用（如 `time.sleep`、`httpx.post`）跑进 async 函数，堵住事件循环 |
| 流只收到一半就停 | 没 break on `[DONE]`，或异常没处理 |
| 并发反而更慢 | 每次 `httpx.AsyncClient()` 新建（没复用） |
| 4xx 也在重试 | 没区分可重试错误 |

## 动手练习（30–40 min）

1. **异步对照**：把 Day 05 的 `chat_ping.py` 改写成 `chat_async.py`（`AsyncClient`），跑通打印同样内容。
2. **流式**：写 `stream_demo.py`（上面那段），跑通看到 token 逐字/逐段打印。没 Key 就用 `httpx` mock 一个本地 SSE 响应（自己起个小 server 吐 `data: {...}` 行）。
3. **重试**：给 `chat_async.py` 加一个 `chat_with_retry` 包装，故意把 `timeout` 设成 0.01 触发超时，观察重试日志。

## 自检清单

- [ ] 理解 Python `async/await` 与 JS 的异同（顶层 await、忘 await）
- [ ] 会用 `httpx.AsyncClient` 异步调 API
- [ ] 能跑流式 SSE 并处理 `data:` / `[DONE]` / 跨块断行
- [ ] 会写超时 + 指数退避重试，且只重试可重试错误
- [ ] 知道"同步调用堵住事件循环"这个坑

## 明日预告

Day 07 · Chat Completions API —— 正式进入应用层接口，把今天和 Day 05 的脚本升级成完整的调用与解析。

## 续学提示词

```text
按 docs/ai-learning/00-profile.md 教我 Day 06。
文件：docs/ai-learning/days/day-06-python-async.md
我是前端，请用 JS fetch/async 对照讲；帮我看 stream_demo.py 是否会漏处理 [DONE]。
不要提前讲 Day 07。
```
