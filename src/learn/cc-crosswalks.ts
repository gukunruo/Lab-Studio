// 课程概念 → 自己平台的 crosswalk：把《Learn Claude Code》某章讲的心智模型，
// 映射到 Lab-Studio 的 /ai 平台真实实现（作为课程案例）。key 为 labId（与 cc-lab.ts 对齐）。

export interface CrosswalkRow {
  /** 课程里的概念 / 步骤 */
  concept: string
  /** 你的平台实现 */
  implementation: string
  /** 一句补充说明（可选） */
  note?: string
}

export interface Crosswalk {
  /** 主标题，如「把 Agent Loop 落到你的 /ai 平台」 */
  title: string
  /** 一句导入，说明这门课和平台的关系 */
  intro: string
  /** 概念 → 实现的映射表 */
  rows: CrosswalkRow[]
  /** 一句总结 / 延伸 */
  tip: string
  /** 相关源文件路径 */
  files: string[]
}

export const CC_CROSSWALKS: Record<string, Crosswalk> = {
  s01: {
    title: '把 Agent Loop 落到你的 /ai 平台',
    intro:
      '本章讲的是「LLM 调用 → 有没有工具？→ 执行工具 → 回填结果 → 循环」。这套心智模型在 Lab-Studio 的 /ai 里被落成了 server/agent-engine.ts 的 runAgentLoop。',
    rows: [
      {
        concept: 'LLM Call',
        implementation: 'runAgentLoop 读上游流，readOpenAiTurn / readAnthropicTurn 把两家 SSE 归一成统一的 AgentTurn',
      },
      {
        concept: 'tool_use? 决策',
        implementation: 'turn.toolCalls.length === 0 ? 发 [DONE] 结束 : 继续分发',
      },
      {
        concept: 'Execute Tool',
        implementation: 'registry[toolName].execute(args)；工具不存在→「（工具 X 不存在）」，抛错→「（工具 X 出错：…）」确定性兜底',
      },
      {
        concept: 'Append Result',
        implementation: 'appendToolMessages 回填 assistant 的 tool_calls + 各 tool 结果，再 buildRequest 重建请求继续',
      },
      {
        concept: 'repeat until done',
        implementation: 'while 循环 + maxRounds 预算硬上限，防止模型无限精化工具递归',
      },
    ],
    tip: '前端零改动：runAgentLoop 统一输出 OpenAI 格式 SSE（data: {choices:[{delta:{content}}]} + data: [DONE]），streamChat 本来就认得。',
    files: ['server/agent-engine.ts', 'server/ai-platform.ts'],
  },
  s02: {
    title: '把 Tool Use 落到你的 /ai 平台',
    intro:
      '本章讲「加一个工具」= 声明 schema + 写 handler + 让模型自动 dispatch。Lab-Studio 用工具注册表做单一事实源：加一个工具 = 在 buildAgentRegistry 注册一行。',
    rows: [
      {
        concept: 'declare tool schema',
        implementation: 'AgentTool = { name, description, parameters, execute }，一条即所有；parameters 正是给模型的 JSON Schema',
      },
      {
        concept: '给模型看工具',
        implementation: 'buildOpenAiTools / buildAnthropicTools 按 provider 把注册表渲染成工具定义（openai 只收 type:\'function\'）',
      },
      {
        concept: 'handler / dispatch',
        implementation: 'runAgentLoop 按 call.name 查 registry；查到就 execute，查不到回填「（工具 X 不存在）」',
      },
      {
        concept: '同一工具不同实现',
        implementation: 'provder 无关：web_search 的检索复用 Claude 落地（零新增 Key），finance_quote 复用 server/finance.ts',
      },
    ],
    tip: '实际新增 finance_quote：只注册一行 + 一个 executor，runAgentLoop 完全没改——这就是「注册表单一事实源」的收益。',
    files: ['server/ai-platform.ts (buildAgentRegistry)', 'server/agent-engine.ts'],
  },
}

export function ccCrosswalkFor(labId: string): Crosswalk | null {
  return CC_CROSSWALKS[labId] ?? null
}
