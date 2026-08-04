# Day 13 · LangChain：跑通最小链

> Phase 2 · 编排与 Agent · ~60 min  
> 标签：`langchain` `lcel` `orchestration` `runnable`  
> 前置：Day 07（Chat API）、Day 09（结构化输出）、Day 12（手搓 RAG）  
> 定位：用 LangChain 重写 Day 12 的一两个组件，看清"抽象对应裸 API 哪一层"；以及什么时候**不必**用它。

## 今日目标

跑通一个 LangChain 最小链（Prompt → Model → Parser），理解 Model / PromptTemplate / Retriever / OutputParser / LCEL（LangChain Expression Language，LangChain 表达式语言）各自把裸 API 的什么包了起来，能判断你的项目该不该引入它。

## 为什么重要

你只听过 LangChain 的名字。两种极端都坑：神化（什么都上 LangChain）或鄙视（玄学不碰）。今天亲手跑一段，把抽象和 Day 07/12 的裸调用做 1:1 对照——**能指出每个抽象底下发生什么，才算会用**。

## 核心概念

### 1. 它解决的痛（手搓时的重复劳动）

Day 12 手搓 RAG 时你重复造了：调 chat、拼 prompt 模板、调 embed、解析输出。换厂商要改一片。LangChain 把这些抽成可复用组件 + 用 LCEL（链表达式）拼管道。

### 2. 核心抽象 1:1 对照

| LangChain 抽象 | 把裸 API 的什么包了 | 对应你手搓的 |
|---|---|---|
| **ChatModel** | chat 调用 + 厂商差异 | Day 07 的 `httpx.post` |
| **PromptTemplate** | 带变量的提示词 | Day 02 的 `[上下文]` 拼接 |
| **Retriever** | 检索接口（抽象掉向量库细节） | Day 12 的 `retrieve()` |
| **OutputParser** | 把文本变结构 | Day 09 的 Pydantic 校验 |
| **LCEL Chain** | 用 `\|` 把上面拼成管道 | 你手写的串调流程 |

**前端类比**：LCEL 的 `prompt | llm | parser` 就像 RxJS 的 `source.pipe(map, filter)`——每段是可组合的算子。

### 3. 可跑最小链

```bash
pip install langchain langchain-openai python-dotenv
```

```python
# scripts/lc_chain.py
import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

load_dotenv()

llm = ChatOpenAI(
    model=os.environ.get("MODEL", "gpt-4.1-mini"),
    base_url=os.environ.get("BASE_URL"),   # 指向你的网关也行
    api_key=os.environ["API_KEY"],
    temperature=0,
)

prompt = ChatPromptTemplate.from_messages([
    ("system", "你是简洁助教，回答不超过两句话"),
    ("user", "{question}"),
])

chain = prompt | llm | StrOutputParser()   # LCEL 管道
print(chain.invoke({"question": "用一句话解释 RAG"}))
```

跑这段等于 Day 07 的非流式调用，但：换厂商只改 `ChatOpenAI` 一行、prompt 复用、parser 可换 Pydantic 解析器。

### 4. 接上检索（对比 Day 12）

把 Day 12 的 `retrieve` 包成 Retriever，就能串进链：

```python
from langchain_core.runnables import RunnableLambda

def retrieve(q: str) -> str:
    hits = retrieve_topk(q, k=4)   # 你 Day 12 的函数
    return "\n\n".join(h["text"] for h in hits)

rag_chain = (
    {"context": RunnableLambda(retrieve), "question": lambda x: x}
    | ChatPromptTemplate.from_messages([
        ("system", "只根据 context 回答，不知则说不知。资料：{context}"),
        ("user", "{question}"),
    ])
    | llm | StrOutputParser()
)
print(rag_chain.invoke("Day 07 学什么？"))
```

看到没：**你已经会裸 RAG 了**，LangChain 只是把它包成可复用算子。懂底层，包不包是你的选择。

### 5. 适合 / 不适合

| 适合 | 不适合（早期） |
|---|---|
| 快速 PoC、多厂商切换、复用现成集成 | 极简单次 Chat（`httpx` 就够） |
| 团队已有 LangChain 资产 | 你还不懂底层（变成调库玄学） |
| 需要现成 retriever/output parser | 强定制协议且包装泄漏严重 |

### 6. 抽象泄漏与失败模式

| 症状 | 多半是 |
|---|---|
| 改一个参数报错看不懂 | 抽象泄漏，没读底层 API |
| 升级版本一片红 | LangChain 历史版本变动大，pin 版本 |
| 链越长越难调试 | LCEL 每段加 `.with_config` 打日志，别黑盒 |
| 比裸 API 慢 | 抽象有开销，性能敏感场景评估 |

**学习策略（对本路径）**：先会 Day 07–12 的裸 API，再看 LangChain 对应哪一层。**不急着把整个项目搬上框架**——能用裸 API 三五十行解决的，别上 LangChain。

### 7. 生态变体

还有 **LlamaIndex**（偏 RAG/数据）、各云厂商编排、或自研薄封装。选型看团队与场景，不是看 Star 数。Day 15 讲何时该上更重的 Agent 编排（LangGraph）。

## 动手练习（30–40 min）

1. **跑通最小链**：装 LangChain，跑 `lc_chain.py`，打印结果。
2. **1:1 对照**：打开 LangChain 文档「Chat model」页，对照 Day 07 的裸请求，列出 1:1 映射（谁包了 messages、谁包了 API Key、谁包了 response 解析）。
3. **接检索**：把 Day 12 的 `retrieve` 包成 RunnableLambda 串进 `rag_chain`，跑通"Day 07 学什么"。
4. **决策**：你的迷你 RAG 第一版用不用框架？写 3 条理由。

## 自检清单

- [ ] 跑通过一个 LangChain 最小链
- [ ] 能把 5 个抽象 1:1 对应到裸 API
- [ ] 能举一个不该引入 LangChain 的场景
- [ ] 明白"先懂裸 API 再看框架"的学习策略

## 明日预告

Day 14 · LangGraph：跑通最小状态机 —— 直线管道不够时，用图表达"带循环与分支的 Agent"。

## 续学提示词

```text
按 docs/ai-learning/00-profile.md 教我 Day 13。
文件：docs/ai-learning/days/day-13-langchain.md
请挑战我"该不该上 LangChain"的 3 条理由。
不要提前讲 Day 14。
```
