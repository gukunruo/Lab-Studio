# Day 04 · Rules / Skills / MCP 地图

> Phase 0 · 地基 · ~60 min  
> 标签：`rules` `skills` `mcp` `agents` `orientation`  
> 前置：Day 02（分层存放指令）、Day 03（工具链分工）  
> 定位：**取向地图**，不深讲 tool calling（留给 Day 10）与 MCP 实战（留给 Day 16）

## 今日目标

分清 Rule、Skill、MCP 三者的边界。学完你能把一个新需求归到正确的层，避免"所有东西都塞进超长 System Prompt"。你已试用过 MCP 和 Skill，今天补的是**分类法 + 心智模型**，让你之后的固化有的放矢。

## 为什么重要

AI 能力一旦重复多了，就要从"聊天里说清"升级到"可复用、可插拔"。但三者职责不同，塞错层会让 Rule 臃肿、Skill 跑偏、MCP 漏权限。这节课是 Day 16（MCP 实战 + Skill 固化）的前置地图。

## 核心概念

### 1. 一句话区分

| 概念 | 一句话 | 像前端的什么 |
|---|---|---|
| **Rules** | 长期有效的文字约束与偏好 | ESLint 规则 + 团队规范文档 |
| **Skills** | 可被触发的流程说明书（怎么做某类任务） | 运行手册 / Playbook / npm script |
| **MCP** | 模型调用外部工具与数据的**标准协议** | 前端调 BFF / 插件 API |

### 2. Rules：底色

- **适合**：回答语言、代码风格、安全红线、提交习惯、框架约定
- **不适合**：易变的业务细节、需要实时数据的步骤、具体流程剧本
- **失效模式**：太长 → 占上下文且模型"选择性遵守"。**保持短而硬**，长内容拆进 Skill 或文档+检索。

Rule 示例（项目级，5 行）：

```markdown
- 回答用中文，代码标识符英文
- 技术栈：Vue3 + SCSS tokens（见 src/styles/_tokens.scss）
- 不擅自 git commit / push
- 组件用 <script setup> + Composition API
```

### 3. Skills：剧本

- **适合**：重复流程（发 PR、排障、生成 changelog、做代码评审）
- **常见结构**：何时用 → 输入 → 步骤 → 输出 → 禁止事项
- **与 Rule 关系**：Rule 是底色（永远生效），Skill 是剧本（被触发才执行）

Skill 骨架（20 行以内）：

```markdown
### 何时用
需要给 Lab-Studio 发 PR 时

### 输入
- 改动摘要（一句话）

### 步骤
1. 跑 npm run type-check，不过则停
2. 按改动类型选 commit type：feat/fix/refactor/docs
3. 生成 PR 描述：Summary + Test plan

### 禁止
- 不要 --no-verify 跳过 hook
- 不要替我 push
```

### 4. MCP：协议本身

MCP（Model Context Protocol，模型上下文协议）让 Agent 通过**标准接口**读资源、调工具、取提示模板。它是 client/server 架构：

- **Host / Client**：你的 AI 工具（Cursor、Claude Code）——MCP 客户端
- **Server**：你或别人写的进程，对外暴露能力——MCP 服务端
- **三类原语**：
  - **Tools**：有副作用的函数调用（发请求、写文件、查 DB）——对应 Day 10 的 tool calling
  - **Resources**：可读的数据源（只读，如"项目里的某个文件"）
  - **Prompts**：预置的提示模板

**你关心三件事**：

1. 有哪些 tool / resource（能力清单）
2. 每个 tool 的参数 schema（决定模型能不能调对）
3. 副作用（会不会写生产、会不会花钱、要不要二次确认）

**安全**：只开需要的 server；**写操作必须可被用户确认或可撤销**（见 Day 20 prompt injection——恶意输入可能诱导模型调用危险工具）。

### 5. 决策树

```
需要实时/外部数据或副作用动作？     → MCP 工具（Day 10/16）
是重复的多步骤工作流？             → Skill（Day 16 固化）
是长期偏好与红线？                 → Rule（Day 02 已讲分层）
是一次性任务？                     → 当前对话说清即可
```

### 6. 三者与后续课程的关系

- **Rule** → Day 02 已讲分层（全局/项目/Skill/对话）
- **Skill 固化** → Day 16 实战把你的 Playbook 落成可触发 Skill
- **MCP 工具调用底层** → Day 10 tool calling（模型怎么决定调哪个 tool）
- **MCP 实战** → Day 16 接一个 server、读 schema、做安全只读调用

记住：**Rule 改偏好、Skill 改流程、MCP 改能力边界**。三者正交，别混。

## 动手练习（30–40 min）

1. **盘点**：把你现有的 Cursor Rule / Skill / MCP 列一张表：名称、类型、是否仍需要、是否塞错了层。
2. **写 Skill 草稿**：选一个每周至少做 2 次的流程，写成 20 行以内的 Skill（可先放笔记，Day 16 再正式化）。
3. **读 MCP schema**：打开任意已配置 MCP，用"列出工具 → 读 schema → 想一个安全只读调用"走一遍（不必真改生产数据）。记下哪个 tool 有写副作用。

## 自检清单

- [ ] 能向同事讲清 Rule vs Skill vs MCP 的边界
- [ ] 会用决策树归类一个新需求
- [ ] 知道 MCP 的三类原语（Tools / Resources / Prompts）
- [ ] 意识到 MCP 写操作的风险面（Day 20 会展开）

## 明日预告

Day 05 · Python 急救 A（同步 HTTP）—— 把生疏的 Python 捡到"能读示例、能改脚本、能调 API"，先打同步底子，Day 06 再上异步。

## 续学提示词

```text
按 docs/ai-learning/00-profile.md 教我 Day 04。
文件：docs/ai-learning/days/day-04-rules-skills-mcp.md
请审阅我的 Skill 草稿是否过长或职责不清，并指出我盘点表里哪项塞错了层。
不要提前讲 Day 05。
```
