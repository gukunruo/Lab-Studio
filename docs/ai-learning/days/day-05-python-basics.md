# Day 05 · Python 急救 A：语法、环境、同步 HTTP

> Phase 0 · 地基 · ~60 min  
> 标签：`python` `httpx` `typing` `env`  
> 前置：Day 01–04  
> 定位：把生疏的 Python 捡到"能读示例、能改脚本、能调 API"。本课只打**同步底子**，异步留 Day 06。

## 今日目标

会建虚拟环境装包、读得懂 f-string/列表推导/类型注解、能用 `httpx` 同步调一个 API 并解析 JSON、知道密钥怎么不进 git。明天在底子上加异步。

## 为什么重要

AI 应用文档与示例大量是 Python（SDK、LangChain、评测脚本）。前端同学卡点常在语法与异步，不在智能本身。今天把"看得懂、改得动"这层先扫平——后面 Day 07 API、Day 08 流式、Day 12 RAG（Retrieval-Augmented Generation，检索增强生成）实现全都站在这层上。

## 核心概念

### 1. 与 JS/TS 的快速对照

| JS/TS | Python |
|---|---|
| `const x = 1` | `x = 1` |
| `let` / `var` | 没有块级变量声明，直接赋值 |
| `object.a` / `obj['a']` | 对象用 `obj.a`；`dict` 用 `d['a']`（不能用点） |
| `arr.map(f)` | `[f(x) for x in arr]`（列表推导） |
| `arr.filter` | `[x for x in arr if cond]` |
| `async/await` | 同名，生态常用 `asyncio` + `httpx` |
| `try/catch` | `try/except` |
| `null`/`undefined` | `None`（只有一个） |
| `===` | `==`（值）/ `is`（同一对象，常用于 `is None`） |
| 模板字符串 `` `hi ${n}` `` | f-string `f"hi {n}"` |

**前端类比**：dict 像 JS 的普通对象但**只能用 `[]` 取值**；列表推导像 `map+filter` 浓缩成一行表达式。

### 2. 虚拟环境（必做习惯）

每个项目一个 `.venv`，依赖隔离，别污染系统 Python：

```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install httpx python-dotenv
```

激活后命令行前缀出现 `(.venv)`。`pip install` 只装进这个 venv。**别 `pip install` 到系统 Python**——迟早搅成一团、版本冲突。

依赖清单固化：

```bash
pip freeze > requirements.txt
# 换机器恢复：
pip install -r requirements.txt
```

### 3. 类型注解（读得懂即可，不必精通）

```python
def embed(texts: list[str]) -> list[list[float]]:
    ...

def chat(messages: list[dict]) -> str:
    ...
```

AI 项目里类型能显著减少 SDK 误用（传错 role/字段时 IDE 能提示）。**你只需读得懂别人的注解**，不必给所有脚本加注解。

### 4. 同步 HTTP 调 API（可跑）

最小可跑示例——调一个 OpenAI 兼容的 chat 接口：

```python
# scripts/chat_ping.py
import os, httpx
from dotenv import load_dotenv

load_dotenv()  # 读 .env 里的环境变量

API_KEY = os.environ.get("API_KEY", "")
BASE_URL = os.environ.get("BASE_URL", "https://api.openai.com/v1")

resp = httpx.post(
    f"{BASE_URL}/chat/completions",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={
        "model": os.environ.get("MODEL", "gpt-4.1-mini"),
        "messages": [{"role": "user", "content": "用一句话解释 token"}],
    },
    timeout=60,
)
resp.raise_for_status()          # 4xx/5xx 抛异常
data = resp.json()
print(data["choices"][0]["message"]["content"])
print("usage:", data.get("usage"))  # token 计数，Day 22 要看
```

跑：

```bash
# .env（不进 git！加进 .gitignore）
API_KEY=sk-xxx
BASE_URL=https://api.openai.com/v1
MODEL=gpt-4.1-mini

python scripts/chat_ping.py
```

> 指向你的网关：把 `BASE_URL` 改成你的代理地址即可，请求体形状不变（OpenAI 兼容）。

### 5. .env 与密钥不进 git

- 密钥写 `.env`，`python-dotenv` 的 `load_dotenv()` 加载
- `.env` 加进 `.gitignore`；只提交 `.env.example`（占位值）
- 真正上线用平台的环境变量，不读 `.env`

```bash
# .gitignore
.env
```

```bash
# .env.example（可提交）
API_KEY=
BASE_URL=https://api.openai.com/v1
MODEL=gpt-4.1-mini
```

### 6. 解析与错误处理

```python
import httpx

try:
    resp = httpx.post(url, json=payload, timeout=60)
    resp.raise_for_status()
    data = resp.json()
except httpx.HTTPStatusError as e:
    print(f"HTTP {e.response.status_code}: {e.response.text}")
except httpx.RequestError as e:
    print(f"网络层错误：{e}")
except KeyError:
    print("响应结构变了，缺字段")
```

**产品里怎么炸**：

- 不 `raise_for_status()` → 4xx/5xx 也当成功，`resp.json()` 取到错误体，下游 `["choices"]` 直接 KeyError
- 不设 `timeout` → 网络卡住时请求永不返回（Day 06/17 会加超时与重试）

## 动手练习（30–40 min）

1. **建环境**：本机建 `.venv`，装 `httpx python-dotenv`，`pip freeze > requirements.txt`。
2. **跑通**：写 `scripts/chat_ping.py`（上面那段），配 `.env`，跑通打印 content 与 usage。没 Key 就写成 **dry-run**：检测到 `API_KEY` 为空时只打印将要发送的 JSON，不发请求。
3. **读示例**：把一段 LangChain 或 OpenAI 官方示例贴出来，用中文注释标出：导入、客户端构造、请求体、响应解析。不要求跑通框架。

## 自检清单

- [ ] 会建 venv 并安装包、固化 requirements
- [ ] 看得懂 f-string、列表推导、try/except、类型注解
- [ ] 能写出或读懂一个 httpx POST JSON 脚本
- [ ] 知道 `.env` + `.gitignore`，密钥不进 git
- [ ] 知道不设 timeout / 不 raise_for_status 会怎么炸

## 明日预告

Day 06 · Python 急救 B（异步·流式）—— 在同步底子上加 `asyncio` + `async httpx`，直接为 Day 08 流式铺路。

## 续学提示词

```text
按 docs/ai-learning/00-profile.md 教我 Day 05。
文件：docs/ai-learning/days/day-05-python-basics.md
我是前端，请用 JS 对照讲；帮我看 chat_ping.py 是否会跑、缺什么。
不要提前讲 Day 06。
```
