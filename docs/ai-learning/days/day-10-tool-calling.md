# Day 10 · Tool Calling：让模型调用函数

> Phase 1 · 接口与数据 · ~60 min  
> 标签：`tool-calling` `function-calling` `agent-loop` `security`  
> 前置：Day 07（Chat API）、Day 09（结构化输出）  
> 定位：把"模型提议调函数 → 你执行 → 它总结"的闭环跑通。这还不是完整 Agent（Day 15 讲何时上 Agent）。

## 今日目标

搞清 Tool Calling 五步闭环、会用 JSON Schema 声明工具、能跑通一个最小 call→execute→respond、清楚"执行权在应用不在模型"这个安全命门。

## 为什么重要

RAG（Retrieval-Augmented Generation，检索增强生成）（Day 12）、MCP（Model Context Protocol，模型上下文协议）（Day 16）、Agent（Day 15）的底层原语都是 tool calling。理解这一课，你才明白：模型不会"自己去查数据库"，是它**提议**调一个工具，**你的代码**真正去查。所有权限、安全、副作用都在你这边。

## 核心概念

### 1. 五步闭环

```
1. 你声明 tools（name + description + 参数 JSON Schema）
2. 模型可能返回 tool_calls（而不是最终答案）
3. 你的代码执行工具（查 DB / 调 API / 算数）
4. 把 tool 结果以 role=tool 消息回传
5. 模型再生成最终自然语言（或继续 call）
```

**关键心智**：模型只是**提议**调用，它不会执行任何东西。真正执行的是你的运行时代码。所以：

- 模型不能调你没声明的工具
- 你可以在执行前**拦截校验**（这个参数安全吗？要问用户吗？）
- 副作用与权限**完全在你掌控**——这是好事，也是责任

### 2. 工具定义 = JSON Schema

呼应 Day 04 的 MCP tool schema——本质相同，都是"名字 + 描述 + 参数 schema"：

```python
tools = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "查某城市当前天气。用户问实时天气时调用。",
        "parameters": {
            "type": "object",
            "properties": {
                "city": {"type": "string", "description": "城市名，中文或英文"},
            },
            "required": ["city"],
        },
    },
}]
```

**写好 description**：模型靠 description 决定"什么情况下调这个工具"。description 模糊 → 该调不调或不该调乱调。

### 3. 与结构化输出（Day 09）的关系

**tool 的参数本身就是结构化输出**——模型按 tool 的 JSON Schema 填 args。所以 tool calling 是 Day 09 的"更强路线"：它不只保证合法 JSON，还**绑定了语义**（这组参数对应哪个函数）。

### 4. 完整可跑闭环

```python
# scripts/tool_call_demo.py
import os, json, httpx
from dotenv import load_dotenv
load_dotenv()

def get_weather(city: str) -> str:
    # 演示用：真品里这里调真天气 API
    return f"{city} 今天 22°C，多云"

def get_time() -> str:
    import datetime
    return datetime.datetime.now().isoformat()

TOOL_MAP = {"get_weather": get_weather, "get_time": get_time}

tools = [
    {"type": "function", "function": {
        "name": "get_weather",
        "description": "查某城市当前天气。用户问实时天气时调用。",
        "parameters": {"type": "object",
                       "properties": {"city": {"type": "string"}},
                       "required": ["city"]}}},
    {"type": "function", "function": {
        "name": "get_time",
        "description": "返回当前时间。用户问现在几点时调用。",
        "parameters": {"type": "object", "properties": {}}}},
]

def call_api(messages):
    resp = httpx.post(
        f"{os.environ['BASE_URL']}/chat/completions",
        headers={"Authorization": f"Bearer {os.environ['API_KEY']}"},
        json={"model": os.environ.get("MODEL", "gpt-4.1-mini"),
              "messages": messages, "tools": tools,
              "temperature": 0, "max_tokens": 300},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]

messages = [{"role": "user", "content": "北京天气怎样？现在几点？"}]

msg = call_api(messages)
messages.append(msg)

# 模型可能返回多个 tool_calls（并行）
for call in msg.get("tool_calls", []):
    name = call["function"]["name"]
    args = json.loads(call["function"]["arguments"])
    print(f"模型提议调 {name}({args})")
    result = TOOL_MAP[name](**args)   # 你的代码执行
    messages.append({
        "role": "tool", "tool_call_id": call["id"],
        "content": result,
    })

# 第二轮：模型拿到 tool 结果后生成最终回答
final = call_api(messages)
print("最终回答：", final["content"])
```

跑这个能看到完整闭环：模型提议调 `get_weather` + `get_time`（并行）→ 你的代码执行 → 模型总结成自然语言。

### 5. 并行与多轮

- **并行**：模型一次可返回多个 `tool_calls`（如上例同时查天气和时间）→ 你逐个执行，逐个回传
- **多轮**：模型拿到结果后可能**继续 call**（发现要再查一个城市）→ 循环直到 `finish_reason: stop`

**Agent 的雏形**就是"循环跑这个直到 stop"（Day 15 讲何时该上完整 Agent 循环）。

### 6. 失败模式与安全

| 症状 | 多半是 | 对策 |
|---|---|---|
| 模型编不存在的 tool | description 误导或模型幻觉 | 只在 tools 里声明能调的；执行时 name 不在 TOOL_MAP 就报错 |
| 参数幻觉（city 填了模型编的值） | 模型猜而非查 | 关键参数执行前校验/二次确认 |
| 执行超时拖死对话 | tool 没 timeout | 每个 tool 执行带 timeout + 降级 |
| 敏感结果全文回显给用户 | 把 tool 输出直接 dump 到 UI | 模型总结时让它脱敏，或前端不回显原始结果 |
| 被诱导调危险 tool | prompt injection（Day 20） | 写操作必须用户确认 |

**安全命门**：执行权在你。**写操作（发邮件、删数据、付款）的 tool，执行前必须用户确认或可撤销**。Day 20 会讲恶意输入怎么诱导模型调危险工具。

## 动手练习（30–40 min）

1. **跑通闭环**：写 `tool_call_demo.py`（上面那段），跑通"北京天气 + 现在几点"，看到模型提议 → 你执行 → 模型总结。
2. **并行验证**：问一个需要两个工具的问题，确认模型一次返回多个 tool_calls。
3. **多轮**：问"顺便上海呢"，看模型第二轮是否继续 call。
4. **错误注入**：把 `get_weather` 改成抛异常，看模型在 tool 结果是错误信息时怎么回答。

## 自检清单

- [ ] 能口述五步闭环
- [ ] 会用 JSON Schema 声明一个工具
- [ ] 理解 tool args 就是结构化输出（Day 09 的强化）
- [ ] 清楚"执行权在应用不在模型"
- [ ] 知道写操作的 tool 要用户确认（Day 20 的前置）

## 明日预告

Day 11 · Embeddings、向量库与 RAG 架构 —— 检索增强的数学底座与标准架构，Day 12 在这之上跑通实现。

## 续学提示词

```text
按 docs/ai-learning/00-profile.md 教我 Day 10。
文件：docs/ai-learning/days/day-10-tool-calling.md
请检查我的 tool_call_demo.py 是否处理了"模型连续多轮 call"的情况。
不要提前讲 Day 11。
```
