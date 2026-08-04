# Day 12 · 迷你 RAG 实现

> Phase 1 · 接口与数据 · ~60 min  
> 标签：`rag` `implementation` `embeddings` `cosine` `evaluation`  
> 前置：Day 05（httpx）、Day 06（异步）、Day 07（Chat API）、Day 11（RAG 架构）  
> 定位：把 Day 11 的架构跑成可执行代码。不急上框架——先纯 `httpx` + `numpy` 手搓，看清每一层。

## 今日目标

跑通一个最小 RAG（Retrieval-Augmented Generation，检索增强生成）：索引 `docs/ai-learning/` 里的 md 文件，问"Day 07 学什么"能答并引用文件名。带一个 10 题评测集（含 2 题该拒答的）。这是你成功标准 #3 的核心交付。

## 为什么重要

Day 11 讲了架构，但"画过"和"跑过"差一个数量级。手搓一遍你才懂：切片细节、cosine 的快与糙、Top-K 取几个、"不知则说不知"怎么约束。Day 13 才看 LangChain 怎么把这些组件包起来——**先懂裸的，才不被框架牵着走**。

## 核心概念

### 1. 三个最小组件

```
1. embed(text)         → 向量        # 调 embedding API
2. cosine_topk(q, vs, k) → [(idx, score)]  # 纯 numpy 余弦 + Top-K
3. chat(messages)      → 回答        # 调 Chat API（Day 07）
```

就这三个，拼起来就是 RAG。

### 2. 离线建索引

```python
# scripts/rag_build.py
import os, json, glob, httpx, numpy as np
from dotenv import load_dotenv
load_dotenv()

BASE_URL = os.environ.get("BASE_URL", "https://api.openai.com/v1")
API_KEY = os.environ["API_KEY"]
EMB_MODEL = os.environ.get("EMB_MODEL", "text-embedding-3-small")

def embed(texts: list[str]) -> list[list[float]]:
    resp = httpx.post(f"{BASE_URL}/embeddings",
        headers={"Authorization": f"Bearer {API_KEY}"},
        json={"model": EMB_MODEL, "input": texts}, timeout=120)
    resp.raise_for_status()
    return [d["embedding"] for d in resp.json()["data"]]

def chunk_markdown(text: str, max_chars: int = 600, overlap: int = 80) -> list[str]:
    # 按段落切 + 长片段再按 max_chars 切 + overlap
    paras = [p for p in text.split("\n\n") if p.strip()]
    chunks = []
    for p in paras:
        for i in range(0, len(p), max_chars - overlap):
            chunks.append(p[i:i + max_chars])
            if i + max_chars >= len(p):
                break
    return chunks

files = glob.glob("docs/ai-learning/days/*.md")
records = []  # {file, chunk}
for f in files:
    text = open(f).read()
    for i, c in enumerate(chunk_markdown(text)):
        records.append({"file": os.path.basename(f), "idx": i, "text": c})

vecs = np.array(embed([r["text"] for r in records]), dtype=np.float32)
np.savez("rag_index.npz", vecs=vecs, records=np.array(records, dtype=object))
print(f"索引完成：{len(records)} 片，维度 {vecs.shape[1]}")
```

### 3. 在线查询

```python
# scripts/rag_query.py
import os, httpx, numpy as np
from dotenv import load_dotenv
load_dotenv()

BASE_URL = os.environ.get("BASE_URL", "https://api.openai.com/v1")
API_KEY = os.environ["API_KEY"]

def embed(texts):
    r = httpx.post(f"{BASE_URL}/embeddings",
        headers={"Authorization": f"Bearer {API_KEY}"},
        json={"model": os.environ.get("EMB_MODEL", "text-embedding-3-small"),
              "input": texts}, timeout=60)
    r.raise_for_status()
    return [d["embedding"] for d in r.json()["data"]]

data = np.load("rag_index.npz", allow_pickle=True)
vecs, records = data["vecs"], data["records"]

def retrieve(q, k=4):
    qv = np.array(embed([q])[0], dtype=np.float32)
    qv /= np.linalg.norm(qv) + 1e-9
    mat = vecs / (np.linalg.norm(vecs, axis=1, keepdims=True) + 1e-9)
    scores = mat @ qv
    top = scores.argsort()[-k:][::-1]
    return [(records[i], float(scores[i])) for i in top]

def chat(messages):
    r = httpx.post(f"{BASE_URL}/chat/completions",
        headers={"Authorization": f"Bearer {API_KEY}"},
        json={"model": os.environ.get("MODEL", "gpt-4.1-mini"),
              "messages": messages, "temperature": 0, "max_tokens": 400},
        timeout=60)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]

def ask(q):
    hits = retrieve(q, k=4)
    context = "\n\n---\n\n".join(
        f"[来源: {h[0]['file']} 片段{h[0]['idx']}]\n{h[0]['text']}" for h in hits)
    sources = sorted({h[0]['file'] for h in hits})
    messages = [
        {"role": "system", "content": "只根据下方资料回答。不知就说不知。"
         "回答末尾列出引用来源文件名。资料：\n" + context},
        {"role": "user", "content": q},
    ]
    return chat(messages), sources

print(ask("Day 07 学什么？"))
print(ask("流式和 tool calling 分别在哪天讲？"))
print(ask("红烧肉怎么做？"))  # 该拒答
```

### 4. 评测集（呼应 Day 21）

```python
# scripts/rag_eval.py
GOLDEN = [
    ("Day 07 学什么？", "Chat Completions API"),
    ("流式在哪天讲？", "Day 08"),
    ("tool calling 在哪天讲？", "Day 10"),
    ("结构化输出用哪个库校验？", "pydantic"),
    # ... 凑 10 条
    ("红烧肉怎么做？", None),   # 该拒答
    ("帮我重构这个组件？", None), # 该拒答
]

def score():
    correct = 0
    for q, expect in GOLDEN:
        ans, _ = ask(q)
        if expect is None:
            ok = "不知" in ans or "没有" in ans
        else:
            ok = expect in ans
        correct += int(ok)
        print(f"{'✓' if ok else '✗'} {q}")
    print(f"通过 {correct}/{len(GOLDEN)}")
```

没有金标集，你会"觉得挺好"直到用户喷。10 道题也够开始——这是 Day 21 评测的前置。

### 5. 失败模式与改进方向

| 症状 | 改进方向 |
|---|---|
| 答不出该答的 | 切片调小/加 overlap；Top-K 调大；查 query 改写 |
| 答了不该答的 | system 更严格"不知则说不知"；Top-K 调小 |
| 引用对但答偏 | 给模型少点噪声片段（Top-K 精选） |
| 同义词检索不到 | 混合检索：向量 + 关键词（BM25（Best Matching 25，经典词频检索算法）） |
| 排序不准 | 加 reranker（小模型重排 Top-K） |
| 慢 | 换专用向量库（Chroma/Qdrant）替代 numpy |

**改进顺序**：先评测集定量 → 改一处 → 重新评测看分数涨没涨。凭感觉调参 = 玄学。

## 动手练习（30–40 min）

1. **建索引**：跑 `rag_build.py`，打印片数与维度。
2. **问答**：跑 `rag_query.py`，问 3 个问题（含一个该拒答的），看引用是否准确。
3. **评测**：凑 10 题（含 2 拒答）跑 `rag_eval.py`，记下分数。改一个参数（如 Top-K 4→6 或切片大小）重跑，看分数怎么变。
4. **观察**：找一个答错的案例，逐层看是切坏了、检索错了、还是生成跑偏了。

## 自检清单

- [ ] 跑通过索引 + 查询 + 带引用回答
- [ ] 有 ≥10 条评测集（含拒答）
- [ ] 体验过"改一个参数看分数变化"的闭环
- [ ] 能定位答错是"切坏/检索错/生成偏"哪一层
- [ ] 明确了"不知则说不知"的产品策略

## 明日预告

Day 13 · LangChain：跑通最小链 —— 今天手搓的三个组件，LangChain 怎么用 Model/PromptTemplate/Retriever/OutputParser 包起来；以及什么时候**不必**用它。

## 续学提示词

```text
按 docs/ai-learning/00-profile.md 教我 Day 12。
文件：docs/ai-learning/days/day-12-mini-rag-impl.md
请按我的评测集结果，定位我最差的那个案例是哪一层（切/检/生）出错。
不要提前讲 Day 13。
```
