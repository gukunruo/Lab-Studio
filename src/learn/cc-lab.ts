// 《Learn Claude Code》配套的原站交互数据（github.com/shareAI-lab/learn-claude-code, MIT）。
// 大体积 JSON/PY 放 public/learn-cc/ 按需 fetch；本章 id 与原站课程 id 不同，经 LAB_CHAPTER_MAP 映射。

export type SimStepType =
  | 'user_message'
  | 'assistant_text'
  | 'tool_call'
  | 'tool_result'
  | 'system_event'

export interface SimStep {
  type: SimStepType
  content: string
  annotation: string
  toolName?: string
  toolInput?: string
}

export interface Scenario {
  version: string
  title: string
  description: string
  steps: SimStep[]
}

export interface LabDecision {
  id: string
  title: string
  description: string
  alternatives: string
  zh?: { title: string; description: string }
}

export interface LabAnnotations {
  version: string
  decisions: LabDecision[]
}

export interface LabClass {
  name: string
  startLine: number
  endLine: number
}

export interface LabFunction {
  name: string
  signature: string
  startLine: number
}

export interface LabVersion {
  id: string
  title: string
  subtitle: string
  loc: number
  tools: string[]
  newTools: string[]
  coreAddition: string
  keyInsight: string
  classes: LabClass[]
  functions: LabFunction[]
  layer: string
}

export interface LabDiff {
  from: string
  to: string
  newClasses: string[]
  newFunctions: string[]
  newTools: string[]
  locDelta: number
}

export interface LabVersions {
  versions: LabVersion[]
  diffs: LabDiff[]
}

// 我们的章节 id → 原站课程 id。原站独有课程（System Prompt / Error Recovery / Worktree
// Isolation）在开源仓库中不存在，对应章节无交互数据。
const LAB_CHAPTER_MAP: Record<string, string> = {
  s01: 's01',
  s02: 's02',
  s03: 's03',
  s04: 's04',
  s05: 's05',
  s06: 's06',
  s07: 's07',
  s08: 's08',
  s09: 's09',
  s12: 's10',
  s13: 's11',
  s14: 's12',
  s15: 's13',
  s16: 's16',
  s17: 's17',
  s19: 's14',
  s20: 's15',
}

export function labIdForChapter(chapterId: string): string | null {
  return LAB_CHAPTER_MAP[chapterId] ?? null
}

const dataCache = new Map<string, unknown>()

function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}learn-cc/${path}`
}

async function fetchJson<T>(path: string): Promise<T | null> {
  const cacheKey = `json:${path}`
  if (dataCache.has(cacheKey)) return dataCache.get(cacheKey) as T
  try {
    const res = await fetch(assetUrl(path))
    if (!res.ok) return null
    const data = (await res.json()) as T
    dataCache.set(cacheKey, data)
    return data
  } catch {
    return null
  }
}

const textCache = new Map<string, string>()

export async function loadScenario(labId: string): Promise<Scenario | null> {
  return fetchJson(`scenarios/${labId}.json`)
}

export async function loadAnnotations(labId: string): Promise<LabAnnotations | null> {
  return fetchJson(`annotations/${labId}.json`)
}

export async function loadSource(labId: string): Promise<string | null> {
  const cacheKey = labId
  if (textCache.has(cacheKey)) return textCache.get(cacheKey)!
  try {
    const res = await fetch(assetUrl(`sources/${labId}.py`))
    if (!res.ok) return null
    const text = await res.text()
    textCache.set(cacheKey, text)
    return text
  } catch {
    return null
  }
}

export async function loadVersions(): Promise<LabVersions | null> {
  return fetchJson('versions.json')
}
