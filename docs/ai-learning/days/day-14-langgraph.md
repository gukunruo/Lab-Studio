# Day 14 · LangGraph：跑通最小状态机

> Phase 2 · 编排与 Agent · ~60 min  
> 标签：`langgraph` `state-machine` `agent` `graph`  
> 前置：Day 10（Tool Calling）、Day 13（LangChain）  
> 定位：直线 Chain 不够时，用"图 + 状态"表达带循环与分支的 Agent。跑通一个含条件边的最小图。

## 今日目标

理解为什么 Agent 本质是状态机而非直线管道、能画出含条件边与循环的图、跑通 LangGraph 最小状态机、知道要限制步数与副作用。

## 为什么重要

真实任务有重试、人工确认、工具失败、分支。Day 13 的直线链处理不了"模型可能连续调工具直到满意"。LangGraph 把 Agent 从"隐式 while 循环"变成"显式图"——可可视化、可限制、可调试。

## 核心概念

### 1. Agent 的朴素循环（ReAct）

```
思考 → 选工具 → 执行 → 观察 →（再思考…）→ 结束
```

这就是 ReAct（Reason+Act，推理+行动）模式。问题：**隐式 while 循环**——失控、成本爆炸、难调试、不知道卡在哪。

**前端类比**：像把 `while(true)` 写在组件里——能跑但不可观测。LangGraph 把它变成显式状态机，像把副作用抽到 XState/Pinia 里管理。

### 2. LangGraph 四要素

| 概念 | 是什么 | 例子 |
|---|---|---|
| **State** | 全局状态对象（消息、中间结果、计数器） | `{messages: [...], step: 0}` |
| **Node** | 一步计算（调 LLM（Large Language Model，大型语言模型）/ 调工具 / 更新 state） | `call_model`, `call_tool` |
| **Edge** | 下一步走哪 | 固定边 / 条件边 |
| **Cycle** | 允许回到某节点 | tool → model → tool → ... |

**关键**：State 在节点间传递并累积（用 reducer 合并）。每个 Node 拿 state、做事、返回**对 state 的更新**。

### 3. 可跑最小图

```bash
pip install langgraph langchain-openai python-dotenv
```

```python
# scripts/lg_graph.py
import os, operator
from typing import TypedDict, Annotated
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import StateGraph, END

load_dotenv()
llm = ChatOpenAI(
    model=os.environ.get("MODEL", "gpt-4.1-mini"),
    base_url=os.environ.get("BASE_URL"),
    api_key=os.environ["API_KEY"], temperature=0,
)

class State(TypedDict):
    messages: Annotated[list, operator.add]   # 累积合并
    step: int

def call_model(state: State):
    resp = llm.invoke(state["messages"])
    return {"messages": [resp], "step": state["step"] + 1}

def should_continue(state: State):
    # 条件边：步数到 3 就停（防失控循环）
    return "end" if state["step"] >= 3 else "continue"

graph = StateGraph(State)
graph.add_node("model", call_model)
graph.set_entry_point("model")
graph.add_conditional_edges(
    "model", should_continue,
    {"continue": "model", "end": END},
)
app = graph.compile()

result = app.invoke({"messages": [HumanMessage("数到 5")], "step": 0})
print([(m.__class__.__name__, getattr(m, "content", "")) for m in result["messages"]])
```

跑这段能看到 State 在 `model` 节点间循环，步数到 3 自动停——这就是"显式图 + 限制循环"。

### 4. 加工具节点（接上 Day 10）

把 Day 10 的 tool calling 放进图：

```python
def call_tool(state):
    last = state["messages"][-1]
    # 取 tool_calls 执行（Day 10 的闭环）
    return {"messages": [ToolMessage(...)], "step": state["step"] + 1}

def should_continue(state):
    last = state["messages"][-1]
    if state["step"] >= 5: return "end"          # 防失控
    if hasattr(last, "tool_calls") and last.tool_calls:
        return "tool"
    return "end"

graph.add_node("tool", call_tool)
graph.add_conditional_edges("model", should_continue,
    {"tool": "tool", "end": END})
graph.add_edge("tool", "model")   # 工具结果回模型，形成 cycle
```

这就把 Day 10 的 tool calling 闭环画成了**显式图**：`model ↔ tool` 循环，条件边控制何时停。

### 5. 工程关注点

- **最大步数 / 超时**：每个图必须有上限，防失控烧钱
- **幂等与副作用**：tool 节点重放时要安全（Day 17 错误处理展开）
- **human-in-the-loop**：关键节点可设断点，等人确认再继续
- **每步 state diff 日志**：出问题时能看到卡在哪一步、state 长啥样
- **流式**：LangGraph 支持流式输出各节点事件（Day 18 流式 UI 可接）

### 6. 失败模式

| 症状 | 多半是 |
|---|---|
| 循环不停烧钱 | 没设最大步数 / 条件边写错 |
| state 越滚越大 | 没 reducer 控制合并，全 append |
| 工具副作用重放出错 | tool 不幂等，没设计重试安全 |
| 调试黑盒 | 没 dump 每步 state diff |

## 动手练习（30–40 min）

1. **跑通最小图**：跑 `lg_graph.py`，观察 state 在节点间传递、步数到 3 自动停。
2. **画图**：选一个任务（"根据问题，可能查文档也可能查天气，最后总结"），画出节点与边（mermaid 或文字）。
3. **加工具**：把 Day 10 的一个 tool 加进图，形成 `model ↔ tool` 循环，条件边控制何时停。
4. **日志**：在每个节点 dump state diff，跑一次看卡在哪步。

## 自检清单

- [ ] 能解释为何 Agent 适合用图表达（vs 直线 Chain）
- [ ] 跑通过含条件边与循环的最小图
- [ ] 知道必须设最大步数防失控
- [ ] 知道 human-in-the-loop 断点的用途
- [ ] 能 dump 每步 state diff 调试

## 明日预告

Day 15 · Agent vs Workflow 决策 —— 不是所有智能都要上 Agent，很多时候确定性 Workflow 更稳更省。

## 续学提示词

```text
按 docs/ai-learning/00-profile.md 教我 Day 14。
文件：docs/ai-learning/days/day-14-langgraph.md
请点评我的节点/边草图，指出哪条条件边会失控。
不要提前讲 Day 15。
```
