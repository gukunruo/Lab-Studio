# Day 21 · 评测与 Prompt 迭代

> Phase 3 · 产品与工程 · ~60 min  
> 标签：`eval` `prompt` `quality` `regression`  
> 前置：Day 02（Prompt）、Day 12（评测集雏形）、Day 09（结构化判分）  
> 定位：把"凭感觉调参"变成"有对照的工程"。改 prompt/换模型必须有评测集兜底。

## 今日目标

建一个可复用评测集、会人工 Pass/Fail 打分、理解"一次只改一个变量"的迭代纪律、能把失败用例沉淀进集做回归。知道 LLM（Large Language Model，大型语言模型）-as-judge 只能辅助。

## 为什么重要

没有评测，优化是玄学——你"觉得"改好了，其实可能回归了某条。有评测，AI 应用才像工程：改一个变量 → 跑同一集 → 分数涨了再合并。Day 12 你已写过 10 题评测集雏形，今天系统化。

## 核心概念

### 1. 没评测 = 玄学，有评测 = 工程

LLM 是概率性的（同输入两次结果可能不同）。靠"跑两下感觉不错"上线，必翻车。评测集是**你的回归测试**——每次改 prompt/换模型/调检索，跑同一集对比。

### 2. 最小评测集

每条含：

- **输入**：用户问题 / 上下文夹具
- **期望**：关键点列表（不必全文标准答案），如 `["Chat API", "messages"]`
- **标签**：`normal` / `refusal`（该拒答）/ `safety`（安全相关）
- **id**：方便回归定位

```jsonc
[
  {"id":"q1","q":"Day 07 学什么？","expect":["Chat Completions API"],"tag":"normal"},
  {"id":"q2","q":"流式在哪天讲？","expect":["Day 08"],"tag":"normal"},
  {"id":"q3","q":"红烧肉怎么做？","expect":["不知","没有"],"tag":"refusal"},
  {"id":"q4","q":"帮我重构组件？","expect":["不知","不能"],"tag":"refusal"}
]
```

### 3. 打分方法

| 方法 | 何时用 | 局限 |
|---|---|---|
| **Pass/Fail**（命中关键点） | 事实型问答 | 主观题不适用 |
| **1–5 分**（有用性） | 主观质量 | 评分者一致性 |
| **LLM-as-judge** | 集太大人工跑不动 | **有偏见，只能辅助**——拿它筛，人工复核争议 |

**先人工 20 条**，跑顺了再考虑自动化。别一上来就 LLM-as-judge——它会给烂回答打高分，把你带偏。

### 4. 迭代循环（核心纪律）

```
定集 → 跑 baseline → 改一个变量 → 再跑 → 对比分数
```

**一次只改一个变量**（Prompt 或模型或检索参数），否则分数涨了不知道是谁的功劳。这是和 ML 调参一样的纪律。

### 5. 回归：失败用例沉淀

Prompt 存进 git。每次改动跑同一集。**失败用例沉淀进集**——而不是"随手修一次就忘"。这样你的集越来越难（积累历史坑），过线即稳。

### 6. 可跑评测脚本（接 Day 12）

```python
# scripts/eval.py
GOLDEN = [  # 你的评测集
    {"q":"Day 07 学什么？","expect":["Chat Completions API"],"tag":"normal"},
    {"q":"红烧肉怎么做？","expect":["不知","没有"],"tag":"refusal"},
    # ... 凑 20 条
]

def score(ask_fn):
    correct = 0
    for item in GOLDEN:
        ans = ask_fn(item["q"])
        if item["tag"] == "refusal":
            ok = any(k in ans for k in item["expect"])
        else:
            ok = all(k in ans for k in item["expect"])
        correct += int(ok)
        if not ok: print(f"FAIL {item['id']}: {item['q']} → {ans[:60]}")
    return correct / len(GOLDEN)

# 改一版 system 前后对比
print("baseline:", score(ask_v1))
print("改后:  ", score(ask_v2))
```

### 7. 与前端 E2E 的分工

- **E2E**：流式是否可停、引用是否渲染、状态机对不对——**交互正确性**
- **金标集**：回答对不对、有没有幻觉——**内容质量**

两层别混。前端 E2E 能测"流式中止保留内容"，测不了"答得对不对"。

### 8. 失败模式

| 症状 | 多半是 |
|---|---|
| 改了感觉更好但没数据 | 没评测集 |
| 分数忽高忽低 | 集太小 / 温度高非确定 / 一次改多个变量 |
| LLM-as-judge 给烂答打高分 | 它有偏见，没人工复核 |
| 同样坑上线又踩 | 失败用例没沉淀进集 |

## 动手练习（30–40 min）

1. **整理评测集**：把 Day 12 的 10 题扩到 20 条（含 4 条拒答），写成 `scripts/eval.py` 的 GOLDEN。
2. **跑 baseline**：用当前 prompt 跑一遍，记分数 + 失败列表。
3. **改一个变量**：只改 system 的一处（如更严的"不知则说不知"），重跑，对比分数。
4. **沉淀**：把这次新失败的用例加进集。

## 自检清单

- [ ] 有可复用的 ≥20 条评测集（含拒答）
- [ ] 理解一次只改一个变量
- [ ] 跑过 baseline + 改后对比
- [ ] 知道 LLM-as-judge 只能辅助、需人工复核
- [ ] 失败用例能沉淀进集

## 明日预告

Day 22 · 成本、延迟、可观测性 —— 上线后怎么看用量、怎么控成本、怎么追问题。

## 续学提示词

```text
按 docs/ai-learning/00-profile.md 教我 Day 21。
文件：docs/ai-learning/days/day-21-eval-iteration.md
请审阅我的评测集是否可执行、拒答题够不够。
不要提前讲 Day 22。
```
