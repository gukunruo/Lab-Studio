export type StepKind =
  | 'intro'
  | 'goal'
  | 'concept'
  | 'practice'
  | 'checklist'
  | 'preview'
  | 'resume'
  | 'generic'

export interface Step {
  id: string
  title: string
  body: string
  kind: StepKind
}

const KIND_RULES: ReadonlyArray<{ kind: StepKind; keywords: string[] }> = [
  { kind: 'goal', keywords: ['今日目标', '目标'] },
  { kind: 'concept', keywords: ['为什么', '核心概念', '概念'] },
  { kind: 'practice', keywords: ['动手', '练习', '实战'] },
  { kind: 'checklist', keywords: ['自检', '检查'] },
  { kind: 'preview', keywords: ['明日', '预告'] },
  { kind: 'resume', keywords: ['续学', '提示词'] },
]

function detectKind(title: string): StepKind {
  for (const rule of KIND_RULES) {
    if (rule.keywords.some((kw) => title.includes(kw))) return rule.kind
  }
  return 'generic'
}

function slugify(text: string): string {
  const s = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return s || 'step'
}

interface RawStep {
  title: string
  body: string[]
  kind: StepKind
  intro: boolean
}

export function parseWalkthrough(markdown: string): Step[] {
  const lines = markdown.split('\n')
  const raw: RawStep[] = []
  let preH2: string[] = []
  let current: { title: string; body: string[] } | null = null

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) {
        raw.push({ title: current.title, body: current.body, kind: detectKind(current.title), intro: false })
      } else if (preH2.length) {
        raw.push({ title: '导言', body: preH2, kind: 'intro', intro: true })
      }
      current = { title: line.slice(3).trim(), body: [] }
    } else if (current) {
      current.body.push(line)
    } else {
      preH2.push(line)
    }
  }

  if (current) {
    raw.push({ title: current.title, body: current.body, kind: detectKind(current.title), intro: false })
  } else if (preH2.length) {
    raw.push({ title: '导言', body: preH2, kind: 'intro', intro: true })
  }

  return raw
    .map((r, i): Step => {
      const body = (r.intro ? r.body.filter((l) => !l.startsWith('# ')) : r.body).join('\n').trim()
      const id = r.intro ? 'intro' : `${slugify(r.title)}-${i}`
      return { id, title: r.title, body, kind: r.kind }
    })
    .filter((s) => s.body.length > 0)
}
