# Day 16 · MCP 实战与 Skill 固化

> Phase 2 · 编排与 Agent · ~60 min  
> 标签：`mcp` `tools` `skills` `security` `productivity`  
> 前置：Day 04（Rules/Skills/MCP 地图）、Day 10（Tool Calling）  
> 定位：把"外部能力"做成标准 MCP（Model Context Protocol，模型上下文协议）工具；把"重复流程"做成可触发 Skill。两件都是"把个人方法论产品化"。

## 今日目标

从"试过 MCP"升级到会读 tool schema、会评估权限面、会设计一个有用的只读 tool；从"写过 Skill 草稿"（Day 04）升级到落成可触发、可验收的 Skill。覆盖你成功标准 #4（Rule/Skill/MCP 固化工作流）。

## 为什么重要

MCP 是把模型接到真实世界的插线板——插错会泄露数据或误操作。Skill 是你产能的放大器——AI 应用工程师很大一部分价值来自"把个人方法论产品化"。两者都是**可复用、可迭代**的能力包。

## 核心概念

### 1. 复习协议角色（呼应 Day 04）

- **Host**：Cursor 等客户端（MCP 客户端）
- **Server**：暴露 tools / resources / prompts 的进程
- **Model**：经 Host 决定调哪些 tool

**MCP tool = 标准化的、可插拔的 tool 实现**。模型侧仍是 Day 10 的 function calling 闭环；变的是工具怎么被发现与托管。

### 2. 好 tool 的设计

- **单一职责、名字动词化**：`search_docs` 而非 `do_stuff`
- **参数有 JSON Schema、枚举清晰**：`{"scope": {"type":"string","enum":["docs","code"]}}`
- **描述写清何时用 / 不要何时用**：模型靠描述决定调不调
- **默认只读；写入要二次确认或分 server**
- **返回结构稳定**：别一会儿对象一会儿数组，模型会乱

### 3. 设计一个只读 tool（你今天产出）

```jsonc
{
  "name": "search_ai_learning",
  "description": "在 docs/ai-learning/ 里检索相关课程片段。用户问课程内容、某天学什么时调用。不用于改代码或查非课程内容。",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {"type": "string", "description": "检索问题，中英文均可"},
      "k": {"type": "integer", "default": 4, "minimum": 1, "maximum": 10}
    },
    "required": ["query"]
  }
}
```

返回 `{ "hits": [{ "file": "day-11-...", "text": "...", "score": 0.82 }] }`。这其实就是把 Day 12 的 `retrieve()` 暴露成 MCP tool——**你手搓的 RAG 直接能变成可插拔能力**。

### 4. MCP 安全清单

- [ ] 最小权限（只开需要的 server）
- [ ] 无密钥进日志（脱敏 token/Key）
- [ ] 生产写操作隔离（单独 server + 用户确认）
- [ ] 超时与速率限制（每个 tool 带 timeout）
- [ ] 用户可感知"Agent 正在调什么"（UI 显示"正在查询…"）

**威胁建模**：若该 tool 被滥用，最坏发生什么？只读 tool 最坏是泄露文档内容（低危）；写操作 tool 最坏是删生产数据（高危）。**写操作必须可被用户确认或可撤销**（Day 20 prompt injection 会讲恶意输入怎么诱导）。

### 5. Skill 该长什么样（Day 04 草稿正式化）

```
1. 名称与一句话用途
2. 何时使用 / 何时不用
3. 输入（用户要提供什么）
4. 步骤（可检查，每步有产出物）
5. 输出格式
6. 禁止事项
```

**好 Skill 的特质**：

- **短**：能进上下文，经验 < 80 行
- **可验证**：每步有产出物，能判做完没
- **与 Rule 不重复**：Rule 说原则，Skill 说流程
- **有"何时不用"**：防止误触发

### 6. 示例 Skill：ai-daily-lesson

```markdown
### 何时用
开始本课程每日 1 小时学习时

### 输入
- 今天第几天（或读 docs/ai-learning/README.md 进度）

### 步骤
1. 打开对应 days/day-XX-*.md，扫「今日目标」
2. 带「为什么重要」的类比讲「核心概念」每个子节
3. 让我做「动手练习」，不提前给答案
4. 做完带我过「自检清单」，逐条抽问
5. 把「续学提示词」存好

### 输出
- 当日学习记录（概念 + 卡点 + 自检结果）

### 禁止
- 不提前讲后面的课
- 不替我做练习
```

### 7. 迭代方式

用两次真实任务跑 Skill → 把失败处补进"禁止/步骤"→ 删废话。**Skill 是用出来的，不是写出来的**——第一版必不完美，跑两轮才知道哪步漏了、哪步啰嗦。

### 8. 三者关系收口（Day 04 决策树的实操）

- **Rule** 改偏好（永远生效）→ Day 02 分层
- **Skill** 改流程（被触发）→ 今天正式化
- **MCP** 改能力边界（外部数据/副作用）→ 今天设计 tool

记住：**Rule 改偏好、Skill 改流程、MCP 改能力边界**。三者正交，别混。

## 动手练习（30–40 min）

1. **盘点 MCP**：列出你已启用的 MCP server 与 tools，标每个 tool 是只读/写、是否仍需要。
2. **设计 tool**：写 `search_ai_learning` 的完整 schema（上面那段），做一次威胁建模（被滥用最坏怎样？如何限制？）。
3. **写 Skill**：把 Day 04 的 Skill 草稿正式化（结构六段），或新写 `ai-daily-lesson` Skill。删到 < 80 行。
4. **跑 Skill**：用它在对话里走一遍"模拟当日学习"开场（即使今天 Day 16，也演练流程），记下哪步漏了。

## 自检清单

- [ ] 能读懂一个 tool 的 JSON Schema
- [ ] 能区分只读与写工具的风险面
- [ ] 产出过 `search_ai_learning` tool 设计
- [ ] 有一份 < 80 行、含"何时不用"的 Skill
- [ ] 用 Skill 真跑过一遍并发现改进点

## 明日预告

Day 17 · 错误处理与生产韧性 —— AI 应用的错误概率性、成本敏感，重试/超时/降级/熔断怎么设计。

## 续学提示词

```text
按 docs/ai-learning/00-profile.md 教我 Day 16。
文件：docs/ai-learning/days/day-16-mcp-and-skill.md
请审阅我的 search_ai_learning tool schema 与 Skill 草稿，指出哪步漏了/哪步啰嗦。
不要提前讲 Day 17。
```
