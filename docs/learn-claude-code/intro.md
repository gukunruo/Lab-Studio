# 课程导论

从 0 到 1 构建 nano Claude Code-like agent，每次只加一个机制

[开始学习→](/zh/timeline/)

## 核心模式

所有 AI 编程 Agent 共享同一个循环：调用模型、执行工具、回传结果。生产级系统会在其上叠加策略、权限和生命周期层。

agent\_loop.py

````
while True:
    response = client.messages.create(messages=messages, tools=tools)
    if response.stop_reason != "tool_use":
        break
    for tool_call in response.content:
        result = execute_tool(tool_call.name, tool_call.input)
        messages.append(result)
````

## 消息增长

观察 Agent 循环执行时消息数组的增长

messages[]len=0

[]

## 学习路径

20 个渐进式课程，从简单循环到完整多 Agent Harness

[s01102 行

### The Agent Loop

The smallest useful agent is a loop that calls the model, runs tools, and feeds results back.](/zh/s01/)[s02135 行

### Tool Use

The loop stays stable while capabilities register into a dispatch table.](/zh/s02/)[s03180 行

### Permission

Dangerous actions need a harness decision point before the shell runs.](/zh/s03/)[s04232 行

### Hooks

Cross-cutting behavior belongs around the loop, not tangled inside it.](/zh/s04/)[s05236 行

### TodoWrite

Explicit plans keep long-running work visible and correctable.](/zh/s05/)[s06304 行

### Subagent

Subagents give each subtask a clean message history while preserving the main thread.](/zh/s06/)[s07335 行

### Skill Loading

Inject specialized knowledge only when the task actually needs it.](/zh/s07/)[s08414 行

### Context Compact

Compression keeps the conversation usable when the context window gets crowded.](/zh/s08/)[s09528 行

### Memory

Some facts should survive summarization and future sessions.](/zh/s09/)[s10166 行

### System Prompt

The system prompt is a generated product of policy, tools, skills, and context.](/zh/s10/)[s11287 行

### Error Recovery

A robust harness classifies failures and decides what kind of retry is worthwhile.](/zh/s11/)[s12297 行

### Task System

A task graph turns vague goals into ordered, observable work.](/zh/s12/)[s13379 行

### Background Tasks

The agent can keep reasoning while slow work completes elsewhere.](/zh/s13/)[s14645 行

### Cron Scheduler

Recurring work should be created by the harness, not remembered by the model.](/zh/s14/)[s15745 行

### Agent Teams

Persistent teammates let work continue in parallel without stuffing every thought into one context.](/zh/s15/)[s16709 行

### Team Protocols

Multi-agent systems need explicit message contracts, not vibes.](/zh/s16/)[s17648 行

### Autonomous Agents

Teammates become useful when they can discover and claim work themselves.](/zh/s17/)[s18802 行

### Worktree Isolation

Parallel agents need isolated filesystems as much as isolated conversations.](/zh/s18/)[s19835 行

### MCP Tools

External services can become agent tools through a standard discovery and call protocol.](/zh/s19/)[s201708 行

### Comprehensive Agent

The final harness is still one loop, now surrounded by the systems that make it production-shaped.](/zh/s20/)

## 架构层次

五个正交关注点组合成完整的 Agent

### Tools & Execution

4 个版本

[s01: The Agent Loop](/zh/s01/)[s02: Tool Use](/zh/s02/)[s03: Permission](/zh/s03/)[s04: Hooks](/zh/s04/)

### Planning & Control

5 个版本

[s05: TodoWrite](/zh/s05/)[s06: Subagent](/zh/s06/)[s07: Skill Loading](/zh/s07/)[s10: System Prompt](/zh/s10/)[s11: Error Recovery](/zh/s11/)

### Memory Management

2 个版本

[s08: Context Compact](/zh/s08/)[s09: Memory](/zh/s09/)

### Concurrency & Scheduling

2 个版本

[s13: Background Tasks](/zh/s13/)[s14: Cron Scheduler](/zh/s14/)

### Multi-Agent Platform

7 个版本

[s12: Task System](/zh/s12/)[s15: Agent Teams](/zh/s15/)[s16: Team Protocols](/zh/s16/)[s17: Autonomous Agents](/zh/s17/)[s18: Worktree Isolation](/zh/s18/)[s19: MCP Tools](/zh/s19/)[s20: Comprehensive Agent](/zh/s20/)
