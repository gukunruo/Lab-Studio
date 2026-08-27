export type CcGroupId = 'tools' | 'planning' | 'memory' | 'concurrency' | 'multi-agent' | 'advanced'

export interface CcGroupMeta {
  id: CcGroupId
  title: { zh: string; en: string }
}

export interface CcChapter {
  id: string
  group: CcGroupId
  /** matches docs/learn-claude-code/<file> */
  file: string
  title: { zh: string; en: string }
  minutes: number
}

export const ccCourseMeta = {
  id: 'learn-claude-code',
  title: { zh: 'Learn Claude Code', en: 'Learn Claude Code' },
  blurb: {
    zh: '从 0 到 1 构建 Claude Code 式 Agent：每章只加一个机制，覆盖循环、工具、权限、记忆到多 Agent 平台。',
    en: 'Build a Claude Code-like agent from scratch, one mechanism at a time.',
  },
  source: 'learn.shareai.run (shareAI Lab, MIT)',
}

export const ccGroups: CcGroupMeta[] = [
  { id: 'tools', title: { zh: '工具与执行', en: 'Tools & Execution' } },
  { id: 'planning', title: { zh: '规划与协调', en: 'Planning & Coordination' } },
  { id: 'memory', title: { zh: '记忆管理', en: 'Memory' } },
  { id: 'concurrency', title: { zh: '并发', en: 'Concurrency' } },
  { id: 'multi-agent', title: { zh: '多 Agent 平台', en: 'Multi-Agent Platform' } },
  { id: 'advanced', title: { zh: '进阶与综合', en: 'Advanced & Capstone' } },
]

export const ccIntro: CcChapter = {
  id: 'intro',
  group: 'tools',
  file: 'intro.md',
  title: { zh: '课程导论', en: 'Introduction' },
  minutes: 10,
}

export const ccChapters: CcChapter[] = [
  { id: 's01', group: 'tools', file: 's01.md', title: { zh: 'Agent Loop：一切从循环开始', en: 'Agent Loop' }, minutes: 15 },
  { id: 's02', group: 'tools', file: 's02.md', title: { zh: 'Tool Use：多加一个工具', en: 'Tool Use' }, minutes: 15 },
  { id: 's03', group: 'tools', file: 's03.md', title: { zh: 'Permission：权限守门', en: 'Permission' }, minutes: 20 },
  { id: 's04', group: 'tools', file: 's04.md', title: { zh: 'Hooks：生命周期钩子', en: 'Hooks' }, minutes: 25 },
  { id: 's05', group: 'planning', file: 's05.md', title: { zh: 'TodoWrite：任务清单', en: 'TodoWrite' }, minutes: 15 },
  { id: 's06', group: 'planning', file: 's06.md', title: { zh: 'Subagent：子代理', en: 'Subagent' }, minutes: 20 },
  { id: 's07', group: 'planning', file: 's07.md', title: { zh: 'Skills：技能加载', en: 'Skills' }, minutes: 15 },
  { id: 's10', group: 'planning', file: 's10.md', title: { zh: 'System Prompt：系统提示词', en: 'System Prompt' }, minutes: 20 },
  { id: 's11', group: 'planning', file: 's11.md', title: { zh: 'Error Recovery：错误恢复', en: 'Error Recovery' }, minutes: 25 },
  { id: 's08', group: 'memory', file: 's08.md', title: { zh: 'Context Compact：上下文压缩', en: 'Context Compact' }, minutes: 30 },
  { id: 's09', group: 'memory', file: 's09.md', title: { zh: 'Memory：记忆系统', en: 'Memory' }, minutes: 25 },
  { id: 's13', group: 'concurrency', file: 's13.md', title: { zh: 'Background Tasks：后台任务', en: 'Background Tasks' }, minutes: 25 },
  { id: 's14', group: 'concurrency', file: 's14.md', title: { zh: 'Cron Scheduler：定时调度', en: 'Cron Scheduler' }, minutes: 25 },
  { id: 's12', group: 'multi-agent', file: 's12.md', title: { zh: 'Task System：任务系统', en: 'Task System' }, minutes: 25 },
  { id: 's15', group: 'multi-agent', file: 's15.md', title: { zh: 'Agent Teams：智能体团队', en: 'Agent Teams' }, minutes: 20 },
  { id: 's16', group: 'multi-agent', file: 's16.md', title: { zh: 'Team Protocols：团队协议', en: 'Team Protocols' }, minutes: 20 },
  { id: 's17', group: 'multi-agent', file: 's17.md', title: { zh: 'Autonomous Agents：自治智能体', en: 'Autonomous Agents' }, minutes: 25 },
  { id: 's18', group: 'advanced', file: 's18.md', title: { zh: 'Worktree Isolation：工作树隔离', en: 'Worktree Isolation' }, minutes: 20 },
  { id: 's19', group: 'advanced', file: 's19.md', title: { zh: 'MCP Tools：外接工具', en: 'MCP Tools' }, minutes: 25 },
  { id: 's20', group: 'advanced', file: 's20.md', title: { zh: 'Comprehensive Agent Turn：综合回合', en: 'Comprehensive Agent Turn' }, minutes: 15 },
]

const ccModules = import.meta.glob('../../docs/learn-claude-code/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

function fileFromGlobPath(path: string): string {
  return path.split('/').pop() ?? path
}

const ccContentByFile = Object.fromEntries(
  Object.entries(ccModules).map(([path, source]) => [fileFromGlobPath(path), source]),
)

export function ccChapterSource(chapter: CcChapter): string {
  return ccContentByFile[chapter.file] ?? `# Missing\n\n${chapter.file} not found.`
}

export function ccChapterById(id: string): CcChapter | undefined {
  if (id === ccIntro.id) return ccIntro
  return ccChapters.find((c) => c.id === id)
}

export function ccChaptersByGroup(): Array<{ group: CcGroupMeta; chapters: CcChapter[] }> {
  return ccGroups
    .map((group) => ({ group, chapters: ccChapters.filter((c) => c.group === group.id) }))
    .filter((entry) => entry.chapters.length > 0)
}

export function ccNextChapter(id: string): CcChapter | undefined {
  const all = [ccIntro, ...ccChapters]
  const index = all.findIndex((c) => c.id === id)
  if (index === -1) return all[0]
  return all[index + 1]
}
