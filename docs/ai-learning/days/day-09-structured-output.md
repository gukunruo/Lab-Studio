# Day 09 · 结构化输出与 JSON Mode

> Phase 1 · 接口与数据 · ~60 min  
> 标签：`structured-output` `json` `pydantic` `validation`  
> 前置：Day 02（输出格式段）、Day 07（Chat API）、Day 06（异步）  
> 定位：让模型吐"可被代码消费"的结构，告别 `JSON.parse` 偶发崩。Tool Calling 的前置。

## 今日目标

理解为什么"让模型吐 JSON"是应用层的命脉、会两条路线（JSON Mode vs Tool schema）、能用 Pydantic 定义 schema 并校验、知道"合法 JSON 但 schema 不符"这个最常见的坑。

## 为什么重要

应用里你几乎不想要散文——要的是结构化数据：抽字段、分类、路由、生成参数。只要输出要被代码消费，**就必须结构化**。这是 Day 10 工具调用（tool 的参数就是结构化输出）、Day 21 评测（判分要结构化）、Day 18 流式 UI（前端渲染要结构化）的共同前置。

## 核心概念

### 1. 为什么需要结构化

无结构时你只能 `JSON.parse(content)`，然后祈祷。实际会出：

- 模型在 JSON 外加一句"好的，结果如下："
- 用 markdown 围栏 ` ```json ... ``` `
- 漏字段、字段拼错、类型错（把数字写成字符串）
- 偶发合法但 schema 不符

**产品里怎么炸**：前端 `JSON.parse` 直接崩、或字段 undefined 导致渲染异常、或静默取到错值流到数据库。凡是要被解析的输出，必须结构化 + **校验**。

### 2. 两条路线

| 路线 | 怎么做 | 保证什么 | 不保证什么 |
|---|---|---|---|
| **JSON Mode** | `response_format: {"type": "json_object"}` | 输出是合法 JSON | **不保证 schema**（字段可能缺/错类型） |
| **Tool/函数 schema** | 定义 `tools` 的 JSON Schema 参数 | 模型按 schema 填参数（Day 10） | 执行权在你（这是好事） |

**经验**：要严格 schema → 用 Tool schema（Day 10）；只要合法 JSON + 自己 Pydantic 校验补 schema → JSON Mode 够用。两条路都**温度要低**。

### 3. JSON Mode 的坑

`response_format: json_object` 只保证"能 parse 成 JSON"。它**不保证**字段名对、类型对、值域对。所以必须**自己定义 schema 并校验**——校验不过就重试或报错。

### 4. Pydantic schema 定义 + 校验

```python
# scripts/extract_bug.py
import os, json, httpx
from pydantic import BaseModel, ValidationError
from dotenv import load_dotenv
load_dotenv()

class BugReport(BaseModel):
    severity: str            # "low" | "medium" | "high"
    component: str           # 哪个组件/文件
    summary: str             # 一句话摘要

prompt = """从下面用户反馈里抽取 bug 信息，输出 JSON，字段：
severity (low/medium/high), component (字符串), summary (一句话)。
只输出 JSON，不要解释。

用户反馈：播放器拖到屏幕中间时，全屏按钮点不动了，每次都要刷新。
"""

resp = httpx.post(
    f"{os.environ['BASE_URL']}/chat/completions",
    headers={"Authorization": f"Bearer {os.environ['API_KEY']}"},
    json={
        "model": os.environ.get("MODEL", "gpt-4.1-mini"),
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0,
        "max_tokens": 200,
        "response_format": {"type": "json_object"},
    },
    timeout=60,
)
resp.raise_for_status()
raw = resp.json()["choices"][0]["message"]["content"]

try:
    bug = BugReport.model_validate_json(raw)
    print(bug.severity, bug.component, bug.summary)
except ValidationError as e:
    print("schema 不符：", e)
    print("原始输出：", raw)
    # 这里可重试或降级
```

### 5. 失败模式与对策

| 症状 | 多半是 | 对策 |
|---|---|---|
| 合法 JSON 但缺字段 | schema 没强制 | Pydantic 校验 + 失败重试 |
| 类型错（数字成字符串） | 模型按字面吐 | Pydantic 自动 coerce 或报错 |
| 带 markdown 围栏 | 模型"好心"加格式 | 剥围栏再 parse，或用 JSON Mode |
| 偶发不合法 | 温度高 | 温度=0 |
| 同一输入两次结果不同 | 温度高 | 温度=0 + 固定 seed（若支持） |

**重试纪律**：校验不过时，把"你的错误 + 原始输出"塞回 messages 当 user 消息再问一次（"上次输出缺 severity 字段，重出"）。别无限重试，上限 2–3 次。

### 6. 与后续课程的关系

- **Day 02** 讲了 `[输出格式]` 段——今天是用 JSON Mode / schema 把它强制化
- **Day 10** Tool Calling——tool 的**参数本身**就是结构化输出（模型按 tool 的 JSON Schema 填 args），是最强路线
- **Day 18** 流式 UI——结构化输出可流式增量渲染（边 parse 边填表单）
- **Day 21** 评测——判分要结构化（score/reason），否则没法批量统计

记住：**散文给人看，结构给代码吃**。凡是被代码吃的，结构化 + 校验 + 低温度。

## 动手练习（30–40 min）

1. **跑通结构化**：写 `extract_bug.py`（上面那段），对 2–3 条真实用户反馈跑，看 Pydantic 校验是否通过。
2. **对照无结构**：去掉 `response_format`，同样的 prompt 跑 3 次，看输出里有多少次带围栏/缺字段/解释性文字。
3. **重试**：故意把 schema 字段改严（如 `severity: Literal["low","medium","high"]`），观察哪次校验不过，写个重试包装。

## 自检清单

- [ ] 能说清 JSON Mode 保证什么、不保证什么
- [ ] 会用 Pydantic 定义 schema 并校验模型输出
- [ ] 知道校验不过时可把错误塞回去重试
- [ ] 知道凡结构化输出温度必低
- [ ] 知道 Tool schema（Day 10）是更严格的路线

## 明日预告

Day 10 · Tool Calling：让模型调用函数 —— 把结构化输出升级成"模型提议调函数 → 你执行 → 它总结"的闭环。

## 续学提示词

```text
按 docs/ai-learning/00-profile.md 教我 Day 09。
文件：docs/ai-learning/days/day-09-structured-output.md
请审阅我的 extract_bug.py，指出我若把 severity 设成 Literal 会有几次重试。
不要提前讲 Day 10。
```
