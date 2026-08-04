export type PhaseId = 'p0' | 'p1' | 'p2' | 'p3'

export interface PhaseMeta {
  id: PhaseId
  title: { zh: string; en: string }
  blurb: { zh: string; en: string }
  dayStart: number
  dayEnd: number
}

export interface LessonMeta {
  id: string
  day: number
  phase: PhaseId
  /** matches docs/ai-learning/days/<file> */
  file: string
  title: { zh: string; en: string }
  minutes: number
  tags: string[]
}

export const phases: PhaseMeta[] = [
  {
    id: 'p0',
    title: { zh: 'P0 · 地基与语言', en: 'P0 · Foundations & Language' },
    blurb: {
      zh: 'LLM 心智、提示词、模型选型、Rules/Skills/MCP 地图、Python 急救A(同步)、Python 急救B(异步)',
      en: 'LLM mental model, prompts, model routing, Rules/Skills/MCP map, Python refresh A & B',
    },
    dayStart: 1,
    dayEnd: 6,
  },
  {
    id: 'p1',
    title: { zh: 'P1 · 接口与检索', en: 'P1 · APIs & Retrieval' },
    blurb: {
      zh: 'Chat API、Streaming·SSE、结构化输出、Tool Calling、Embeddings·向量库·RAG架构、迷你RAG实现',
      en: 'Chat API, streaming/SSE, structured output, tool calling, embeddings/vectordb/RAG, mini RAG impl',
    },
    dayStart: 7,
    dayEnd: 12,
  },
  {
    id: 'p2',
    title: { zh: 'P2 · 编排与 Agent', en: 'P2 · Orchestration' },
    blurb: {
      zh: 'LangChain(最小链)、LangGraph(状态机)、Agent vs Workflow、MCP实战·Skill固化、错误处理与韧性',
      en: 'LangChain chain, LangGraph state machine, Agent vs Workflow, MCP+Skill, error resilience',
    },
    dayStart: 13,
    dayEnd: 17,
  },
  {
    id: 'p3',
    title: { zh: 'P3 · 产品与工程', en: 'P3 · Product & Eng' },
    blurb: {
      zh: '流式 UI、Chat 交互、Prompt Injection 安全、评测、成本可观测、Context 管理、毕业项目',
      en: 'Streaming UI, chat UX, prompt injection security, eval, cost/observability, context management, capstone',
    },
    dayStart: 18,
    dayEnd: 24,
  },
]

export const lessons: LessonMeta[] = [
  {
    id: 'day-01',
    day: 1,
    phase: 'p0',
    file: 'day-01-llm-mental-model.md',
    title: { zh: 'LLM 心智模型', en: 'LLM mental model' },
    minutes: 60,
    tags: ['llm', 'tokens', 'context'],
  },
  {
    id: 'day-02',
    day: 2,
    phase: 'p0',
    file: 'day-02-prompt-context.md',
    title: { zh: '上下文与提示词工程', en: 'Prompt & context engineering' },
    minutes: 60,
    tags: ['prompt', 'context', 'few-shot', 'cot'],
  },
  {
    id: 'day-03',
    day: 3,
    phase: 'p0',
    file: 'day-03-models-tooling.md',
    title: { zh: '模型选型与工具链', en: 'Models & tooling' },
    minutes: 60,
    tags: ['models', 'cursor', 'cost', 'routing'],
  },
  {
    id: 'day-04',
    day: 4,
    phase: 'p0',
    file: 'day-04-rules-skills-mcp.md',
    title: { zh: 'Rules / Skills / MCP 地图', en: 'Rules / Skills / MCP map' },
    minutes: 60,
    tags: ['rules', 'skills', 'mcp', 'orientation'],
  },
  {
    id: 'day-05',
    day: 5,
    phase: 'p0',
    file: 'day-05-python-basics.md',
    title: { zh: 'Python 急救 A：语法、环境、同步 HTTP', en: 'Python refresh A: sync HTTP' },
    minutes: 60,
    tags: ['python', 'httpx', 'env'],
  },
  {
    id: 'day-06',
    day: 6,
    phase: 'p0',
    file: 'day-06-python-async.md',
    title: { zh: 'Python 急救 B：异步、流式与错误', en: 'Python refresh B: async & streaming' },
    minutes: 60,
    tags: ['python', 'asyncio', 'httpx', 'streaming'],
  },
  {
    id: 'day-07',
    day: 7,
    phase: 'p1',
    file: 'day-07-chat-completions-api.md',
    title: { zh: 'Chat Completions API', en: 'Chat Completions API' },
    minutes: 60,
    tags: ['api', 'messages', 'usage'],
  },
  {
    id: 'day-08',
    day: 8,
    phase: 'p1',
    file: 'day-08-streaming-sse.md',
    title: { zh: 'Streaming：SSE 与增量解析', en: 'Streaming & SSE' },
    minutes: 60,
    tags: ['streaming', 'sse', 'delta'],
  },
  {
    id: 'day-09',
    day: 9,
    phase: 'p1',
    file: 'day-09-structured-output.md',
    title: { zh: '结构化输出与 JSON Mode', en: 'Structured output & JSON mode' },
    minutes: 60,
    tags: ['structured-output', 'json', 'pydantic'],
  },
  {
    id: 'day-10',
    day: 10,
    phase: 'p1',
    file: 'day-10-tool-calling.md',
    title: { zh: 'Tool Calling：让模型调用函数', en: 'Tool calling' },
    minutes: 60,
    tags: ['tool-calling', 'function-calling', 'security'],
  },
  {
    id: 'day-11',
    day: 11,
    phase: 'p1',
    file: 'day-11-embeddings-vectordb-rag.md',
    title: { zh: 'Embeddings、向量库与 RAG 架构', en: 'Embeddings, vectordb & RAG architecture' },
    minutes: 60,
    tags: ['embeddings', 'vectordb', 'rag', 'architecture'],
  },
  {
    id: 'day-12',
    day: 12,
    phase: 'p1',
    file: 'day-12-mini-rag-impl.md',
    title: { zh: '迷你 RAG 实现', en: 'Mini RAG implementation' },
    minutes: 60,
    tags: ['rag', 'implementation', 'cosine', 'evaluation'],
  },
  {
    id: 'day-13',
    day: 13,
    phase: 'p2',
    file: 'day-13-langchain.md',
    title: { zh: 'LangChain：跑通最小链', en: 'LangChain: minimal chain' },
    minutes: 60,
    tags: ['langchain', 'lcel', 'orchestration'],
  },
  {
    id: 'day-14',
    day: 14,
    phase: 'p2',
    file: 'day-14-langgraph.md',
    title: { zh: 'LangGraph：跑通最小状态机', en: 'LangGraph: minimal state machine' },
    minutes: 60,
    tags: ['langgraph', 'state-machine', 'agent'],
  },
  {
    id: 'day-15',
    day: 15,
    phase: 'p2',
    file: 'day-15-agent-vs-workflow.md',
    title: { zh: 'Agent vs Workflow 决策', en: 'Agent vs Workflow' },
    minutes: 60,
    tags: ['agents', 'workflows', 'architecture', 'decision'],
  },
  {
    id: 'day-16',
    day: 16,
    phase: 'p2',
    file: 'day-16-mcp-and-skill.md',
    title: { zh: 'MCP 实战与 Skill 固化', en: 'MCP practice & Skill hardening' },
    minutes: 60,
    tags: ['mcp', 'skills', 'security', 'productivity'],
  },
  {
    id: 'day-17',
    day: 17,
    phase: 'p2',
    file: 'day-17-error-resilience.md',
    title: { zh: '错误处理与生产韧性', en: 'Error handling & resilience' },
    minutes: 60,
    tags: ['errors', 'retry', 'timeout', 'circuit-breaker'],
  },
  {
    id: 'day-18',
    day: 18,
    phase: 'p3',
    file: 'day-18-streaming-ui.md',
    title: { zh: 'AI + 前端：流式 UI', en: 'Streaming UI' },
    minutes: 60,
    tags: ['frontend', 'sse', 'vue', 'abort'],
  },
  {
    id: 'day-19',
    day: 19,
    phase: 'p3',
    file: 'day-19-chat-product-patterns.md',
    title: { zh: 'Chat 产品交互模式', en: 'Chat product patterns' },
    minutes: 60,
    tags: ['product', 'chat-ux', 'trust'],
  },
  {
    id: 'day-20',
    day: 20,
    phase: 'p3',
    file: 'day-20-prompt-injection-security.md',
    title: { zh: 'Prompt Injection 与安全', en: 'Prompt injection & security' },
    minutes: 60,
    tags: ['security', 'prompt-injection', 'owasp'],
  },
  {
    id: 'day-21',
    day: 21,
    phase: 'p3',
    file: 'day-21-eval-iteration.md',
    title: { zh: '评测与 Prompt 迭代', en: 'Eval & iteration' },
    minutes: 60,
    tags: ['eval', 'prompt', 'regression'],
  },
  {
    id: 'day-22',
    day: 22,
    phase: 'p3',
    file: 'day-22-cost-observability.md',
    title: { zh: '成本、延迟、可观测性', en: 'Cost, latency & observability' },
    minutes: 60,
    tags: ['cost', 'latency', 'observability'],
  },
  {
    id: 'day-23',
    day: 23,
    phase: 'p3',
    file: 'day-23-context-management.md',
    title: { zh: 'Context 管理与长对话', en: 'Context management' },
    minutes: 60,
    tags: ['context', 'memory', 'summarization'],
  },
  {
    id: 'day-24',
    day: 24,
    phase: 'p3',
    file: 'day-24-capstone.md',
    title: { zh: '毕业项目：选题与路线图', en: 'Capstone: topic & roadmap' },
    minutes: 60,
    tags: ['capstone', 'portfolio', 'roadmap'],
  },
]

/** Vite raw imports from docs/ (project root). */
const dayModules = import.meta.glob('../../docs/ai-learning/days/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

const guideModules = import.meta.glob('../../docs/ai-learning/{README,00-profile,HOW-TO-RESUME}.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

function fileFromGlobPath(path: string): string {
  return path.split('/').pop() ?? path
}

const dayContentByFile = Object.fromEntries(
  Object.entries(dayModules).map(([path, source]) => [fileFromGlobPath(path), source]),
)

export function lessonSource(lesson: LessonMeta): string {
  return dayContentByFile[lesson.file] ?? `# Missing\n\n${lesson.file} not found.`
}

export const guideSources = {
  readme: Object.entries(guideModules).find(([p]) => p.endsWith('README.md'))?.[1] ?? '',
  profile: Object.entries(guideModules).find(([p]) => p.endsWith('00-profile.md'))?.[1] ?? '',
  resume: Object.entries(guideModules).find(([p]) => p.endsWith('HOW-TO-RESUME.md'))?.[1] ?? '',
}

export function lessonById(id: string): LessonMeta | undefined {
  return lessons.find((l) => l.id === id)
}

export function nextIncomplete(completed: Set<string> | string[]): LessonMeta {
  const set = completed instanceof Set ? completed : new Set(completed)
  return lessons.find((l) => !set.has(l.id)) ?? lessons[lessons.length - 1]!
}
