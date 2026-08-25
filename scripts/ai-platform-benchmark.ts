import 'dotenv/config'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { SEED_MODELS, type SeedModel } from '../server/ai-platform-seed'

type BenchmarkTask = {
  id: 'general' | 'reasoning' | 'code' | 'summary' | 'structured'
  prompt: string
  score: (output: string) => number
}

type BenchmarkResult = {
  modelId: string
  taskId: BenchmarkTask['id']
  status: 'completed' | 'skipped' | 'failed'
  ttftMs: number | null
  totalMs: number | null
  outputChars: number
  qualityScore: number | null
  errorCategory?: 'credentials_missing' | 'http_error' | 'timeout' | 'network_error' | 'stream_error'
  errorStatus?: number
  httpError?: {
    providerCode?: string
    retryAfterMs?: number
  }
  outputPreview?: string
}

export type BenchmarkRun = {
  version: 1
  startedAt: string
  completedAt: string
  results: BenchmarkResult[]
}

export type BenchmarkSummary = {
  modelId: string
  completedTasks: number
  failedTasks: number
  skippedTasks: number
  successRate: number
  averageQuality: number | null
  averageTtftMs: number | null
  averageTotalMs: number | null
  outputChars: number
  compositeScore: number | null
}

type Credentials = {
  openai?: { appId: string; appKey: string; baseUrl: string }
  anthropic?: { apiKey: string; baseUrl: string }
}

const MAX_TOKENS = 600

export function getBenchmarkMaxTokens(model: { modelId: string }): number {
  return model.modelId === 'kimi-k3' ? 4096 : MAX_TOKENS
}

const REQUEST_TIMEOUT_MS = 90_000
const OUTPUT_PREVIEW_MAX = 600
const SAFE_PROVIDER_CODES = new Set([
  '400', '401', '403', '404', '408', '409', '413', '422', '429', '500', '502', '503', '504',
  'authentication_error', 'context_length_exceeded', 'content_filter', 'insufficient_quota',
  'invalid_request_error', 'not_found_error', 'overloaded_error', 'permission_error',
  'rate_limit_exceeded', 'server_error', 'service_unavailable',
])

export const BENCHMARK_TASKS: BenchmarkTask[] = [
  {
    id: 'general',
    prompt: '用不超过120个中文字符解释“数据库索引”的作用，并同时说明一个代价。',
    score: (output) => scoreKeywords(output, ['索引', '查询', '代价']),
  },
  {
    id: 'reasoning',
    prompt: '求解并只输出答案与简短推导：一个数的三倍减去7等于38，这个数是多少？',
    score: (output) => output.includes('15') ? 1 : 0,
  },
  {
    id: 'code',
    prompt: '写一个 TypeScript 函数 uniqueSorted(values: number[]): number[]，返回去重且升序排序的新数组。只输出代码。',
    score: (output) => scoreCode(output),
  },
  {
    id: 'summary',
    prompt: '将下面内容概括为不超过80个中文字符的两条要点：团队本周完成了登录模块重构，错误率下降40%。下周将迁移支付回调服务，迁移期间需要保留旧接口兼容并监控失败率。',
    score: (output) => scoreKeywords(output, ['登录', '40', '支付', '兼容']),
  },
  {
    id: 'structured',
    prompt: '只输出合法 JSON，不要 Markdown：{"title":"string","priority":"high|medium|low","steps":["string"]}。为“修复登录超时”生成内容。',
    score: (output) => scoreStructuredOutput(output),
  },
]

export function getBenchmarkModels(models = SEED_MODELS): SeedModel[] {
  return models.filter((model) => model.category === 'chat' || model.category === 'reasoning')
}

export function scoreKeywords(output: string, keywords: string[]): number {
  return keywords.filter((keyword) => output.toLowerCase().includes(keyword.toLowerCase())).length / keywords.length
}

export function scoreCode(output: string): number {
  const checks = [/function\s+uniqueSorted|const\s+uniqueSorted/, /Set\s*\(/, /sort\s*\(/]
  return checks.filter((check) => check.test(output)).length / checks.length
}

export function scoreStructuredOutput(output: string): number {
  const candidate = output.trim().replace(/^```json\s*|^```|```$/g, '').trim()
  try {
    const value = JSON.parse(candidate) as Record<string, unknown>
    return typeof value.title === 'string'
      && ['high', 'medium', 'low'].includes(String(value.priority))
      && Array.isArray(value.steps)
      && value.steps.every((step) => typeof step === 'string')
      ? 1
      : 0
  } catch {
    return 0
  }
}

export function serializeResult(result: BenchmarkResult): BenchmarkResult {
  const { outputPreview, ...safe } = result
  return outputPreview ? { ...safe, outputPreview: outputPreview.slice(0, OUTPUT_PREVIEW_MAX) } : safe
}

export async function extractHttpErrorTelemetry(response: Response): Promise<{ providerCode?: string; retryAfterMs?: number }> {
  const retryAfter = response.headers.get('Retry-After')?.trim()
  const numericRetryAfter = retryAfter && /^\d+(?:\.\d+)?$/.test(retryAfter) ? Number(retryAfter) : null
  const httpDate = retryAfter?.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/)
  const dateRetryAfter = httpDate ? Date.parse(retryAfter) : NaN
  const parsedDate = Number.isFinite(dateRetryAfter) ? new Date(dateRetryAfter) : null
  const hasMatchingHttpDate = parsedDate && httpDate
    && parsedDate.getUTCDay() === ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(httpDate[1])
    && parsedDate.getUTCDate() === Number(httpDate[2])
    && parsedDate.getUTCMonth() === ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(httpDate[3])
    && parsedDate.getUTCFullYear() === Number(httpDate[4])
    && parsedDate.getUTCHours() === Number(httpDate[5])
    && parsedDate.getUTCMinutes() === Number(httpDate[6])
    && parsedDate.getUTCSeconds() === Number(httpDate[7])
  const now = Date.now()
  const retryAfterMs = numericRetryAfter !== null && Number.isFinite(numericRetryAfter)
    ? numericRetryAfter * 1000
    : hasMatchingHttpDate && dateRetryAfter > now
      ? dateRetryAfter - now
      : undefined

  try {
    const body = await response.json() as { error?: { code?: unknown; type?: unknown } }
    const candidate = typeof body.error?.code === 'string'
      ? body.error.code
      : typeof body.error?.type === 'string'
        ? body.error.type
        : undefined
    const providerCode = candidate && SAFE_PROVIDER_CODES.has(candidate) ? candidate : undefined
    return { ...(providerCode === undefined ? {} : { providerCode }), ...(retryAfterMs === undefined ? {} : { retryAfterMs }) }
  } catch {
    return retryAfterMs === undefined ? {} : { retryAfterMs }
  }
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

export function summarizeBenchmark(run: BenchmarkRun): BenchmarkSummary[] {
  const byModel = new Map<string, BenchmarkResult[]>()
  for (const result of run.results) {
    const results = byModel.get(result.modelId) ?? []
    results.push(result)
    byModel.set(result.modelId, results)
  }

  const summaries = [...byModel.entries()].map(([modelId, results]) => {
    const completed = results.filter((result) => result.status === 'completed')
    const quality = average(completed.flatMap((result) => result.qualityScore === null ? [] : [result.qualityScore]))
    const ttft = average(completed.flatMap((result) => result.ttftMs === null ? [] : [result.ttftMs]))
    const total = average(completed.flatMap((result) => result.totalMs === null ? [] : [result.totalMs]))
    return {
      modelId,
      completedTasks: completed.length,
      failedTasks: results.filter((result) => result.status === 'failed').length,
      skippedTasks: results.filter((result) => result.status === 'skipped').length,
      successRate: results.length ? completed.length / results.length : 0,
      averageQuality: quality,
      averageTtftMs: ttft,
      averageTotalMs: total,
      outputChars: completed.reduce((sum, result) => sum + result.outputChars, 0),
      compositeScore: null,
    }
  })
  const eligible = summaries.filter((summary) => summary.completedTasks === BENCHMARK_TASKS.length && summary.averageQuality !== null && summary.averageTtftMs !== null && summary.averageTotalMs !== null)
  const maxTtft = Math.max(...eligible.map((summary) => summary.averageTtftMs ?? 0), 1)
  const maxTotal = Math.max(...eligible.map((summary) => summary.averageTotalMs ?? 0), 1)
  for (const summary of eligible) {
    const speed = 1 - (((summary.averageTtftMs ?? maxTtft) / maxTtft) * 0.6 + ((summary.averageTotalMs ?? maxTotal) / maxTotal) * 0.4)
    summary.compositeScore = ((summary.averageQuality ?? 0) * 0.65 + summary.successRate * 0.2 + Math.max(0, speed) * 0.15) * 100
  }
  return summaries.sort((a, b) => (b.compositeScore ?? -1) - (a.compositeScore ?? -1))
}

function formatMetric(value: number | null, digits = 0): string {
  return value === null ? '—' : value.toFixed(digits)
}

export function renderBenchmarkReport(run: BenchmarkRun): string {
  const summaries = summarizeBenchmark(run)
  const ranked = summaries.filter((summary) => summary.compositeScore !== null)
  const lines = [
    '# AI Playground 模型综合评测',
    '',
    `- 运行开始：${run.startedAt}`,
    `- 运行结束：${run.completedAt}`,
    `- 评测任务：通用问答、逻辑推理、TypeScript 代码、受限摘要、结构化 JSON`,
    `- 可正式排名模型：${ranked.length}/${summaries.length}（仅五项任务均完成的模型参与排名）`,
    `- 综合分：质量 65% + 成功率 20% + 速度 15%；速度同时考虑平均首 token 延迟与平均总时长。`,
    '',
    '## 综合榜单',
    '',
    '| 排名 | 模型 | 完成/失败/跳过 | 成功率 | 质量 | 平均 TTFT (ms) | 平均总时长 (ms) | 综合分 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...summaries.map((summary, index) => `| ${summary.compositeScore === null ? '—' : index + 1} | ${summary.modelId} | ${summary.completedTasks}/${summary.failedTasks}/${summary.skippedTasks} | ${(summary.successRate * 100).toFixed(0)}% | ${formatMetric(summary.averageQuality, 2)} | ${formatMetric(summary.averageTtftMs)} | ${formatMetric(summary.averageTotalMs)} | ${formatMetric(summary.compositeScore, 1)} |`),
    '',
    '## 使用建议',
    '',
    ranked.length
      ? `- 日常默认：${ranked[0].modelId}（本轮综合分最高；请在确认连续多轮结果稳定后再更新产品默认值）。`
      : '- 本轮没有模型完成全部任务，不能据此改变默认模型。请根据失败分类补齐凭据、配额或上游可用性后重跑。',
    '- 代码、推理、长文本和结构化输出的推荐应以对应任务的单项原始结果为准；本表不把失败或跳过伪装为低质量。',
    '',
    '## 失败与跳过说明',
    '',
    ...run.results.filter((result) => result.status !== 'completed').map((result) => `- ${result.modelId} / ${result.taskId}：${result.status}（${result.errorCategory ?? 'unknown'}${result.errorStatus ? `, HTTP ${result.errorStatus}` : ''}）`),
    '',
  ]
  return lines.join('\n')
}

export function readCredentials(): Credentials {
  const openaiAppId = process.env.TAL_MLOPS_APP_ID ?? ''
  const openaiAppKey = process.env.TAL_MLOPS_APP_KEY ?? ''
  const credentials: Credentials = {}
  if (openaiAppId && openaiAppKey) {
    credentials.openai = {
      appId: openaiAppId,
      appKey: openaiAppKey,
      baseUrl: process.env.TAL_AI_BASE_URL ?? 'http://ai-service.tal.com',
    }
  }

  let settingsEnv: Record<string, string> = {}
  try {
    settingsEnv = (JSON.parse(readFileSync(join(homedir(), '.claude', 'settings.json'), 'utf8')) as { env?: Record<string, string> }).env ?? {}
  } catch {
    // Environment variables remain the only source when Claude settings are absent.
  }
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY || settingsEnv.ANTHROPIC_API_KEY || ''
  const anthropicBaseUrl = process.env.ANTHROPIC_BASE_URL || settingsEnv.ANTHROPIC_BASE_URL || ''
  if (anthropicApiKey && anthropicBaseUrl) {
    credentials.anthropic = { apiKey: anthropicApiKey, baseUrl: anthropicBaseUrl }
  }
  return credentials
}

export function buildRequest(model: SeedModel, prompt: string, credentials: Credentials): { request?: Request; skip?: BenchmarkResult['errorCategory'] } {
  if (model.provider === 'anthropic') {
    const config = credentials.anthropic
    if (!config) return { skip: 'credentials_missing' }
    return {
      request: new Request(`${config.baseUrl.replace(/\/$/, '')}/v1/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
          'User-Agent': 'claude-cli/2.0.0 (external, cli)',
          'x-app': 'cli',
          'x-stainless-lang': 'js',
          'x-stainless-runtime': 'node',
        },
        body: JSON.stringify({ model: model.modelId, max_tokens: getBenchmarkMaxTokens(model), stream: true, messages: [{ role: 'user', content: prompt }] }),
      }),
    }
  }

  const config = credentials.openai
  if (!config) return { skip: 'credentials_missing' }
  return {
    request: new Request(`${config.baseUrl.replace(/\/$/, '')}/openai-compatible/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.appId}:${config.appKey}`,
        'api-key': `${config.appId}:${config.appKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model.modelId,
        max_tokens: getBenchmarkMaxTokens(model),
        stream: true,
        messages: [{ role: 'user', content: prompt }],
        ...(model.modelId === 'kimi-k3' ? { reasoning: { mode: 'enabled', effort: 'low' } } : {}),
      }),
    }),
  }
}

function extractText(block: string): string {
  const data = block.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('')
  if (!data || data === '[DONE]') return ''
  try {
    const payload = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }>; type?: string; delta?: { text?: string } }
    return payload.choices?.[0]?.delta?.content ?? (payload.type === 'content_block_delta' ? payload.delta?.text ?? '' : '')
  } catch {
    return ''
  }
}

async function consumeStream(response: Response, startedAt: number): Promise<{ output: string; ttftMs: number | null }> {
  if (!response.body) throw new Error('response body missing')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let output = ''
  let ttftMs: number | null = null
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
    let divider = buffer.indexOf('\n\n')
    while (divider >= 0) {
      const text = extractText(buffer.slice(0, divider))
      if (text && ttftMs === null) ttftMs = performance.now() - startedAt
      output += text
      buffer = buffer.slice(divider + 2)
      divider = buffer.indexOf('\n\n')
    }
  }
  return { output, ttftMs }
}

async function benchmarkTask(model: SeedModel, task: BenchmarkTask, credentials: Credentials): Promise<BenchmarkResult> {
  const built = buildRequest(model, task.prompt, credentials)
  if (!built.request) {
    return { modelId: model.modelId, taskId: task.id, status: 'skipped', ttftMs: null, totalMs: null, outputChars: 0, qualityScore: null, errorCategory: built.skip }
  }

  const startedAt = performance.now()
  try {
    const response = await fetch(built.request, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    if (!response.ok) {
      const httpError = await extractHttpErrorTelemetry(response)
      return {
        modelId: model.modelId,
        taskId: task.id,
        status: 'failed',
        ttftMs: null,
        totalMs: performance.now() - startedAt,
        outputChars: 0,
        qualityScore: null,
        errorCategory: 'http_error',
        errorStatus: response.status,
        ...(Object.keys(httpError).length ? { httpError } : {}),
      }
    }
    const { output, ttftMs } = await consumeStream(response, startedAt)
    if (!output) {
      return { modelId: model.modelId, taskId: task.id, status: 'failed', ttftMs, totalMs: performance.now() - startedAt, outputChars: 0, qualityScore: null, errorCategory: 'stream_error' }
    }
    return { modelId: model.modelId, taskId: task.id, status: 'completed', ttftMs, totalMs: performance.now() - startedAt, outputChars: output.length, qualityScore: task.score(output), outputPreview: output }
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    return { modelId: model.modelId, taskId: task.id, status: 'failed', ttftMs: null, totalMs: performance.now() - startedAt, outputChars: 0, qualityScore: null, errorCategory: name === 'TimeoutError' ? 'timeout' : 'network_error' }
  }
}

function modelDelayMs(model: { rpmLimit?: number }): number {
  return model.rpmLimit ? Math.ceil(60_000 / model.rpmLimit) : 0
}

export function getBenchmarkInterTaskDelayMs(model: { modelId: string; rpmLimit?: number }, elapsedPreviousTaskMs: number): number {
  return model.modelId === 'kimi-k3'
    ? Math.max(0, 61_000 - elapsedPreviousTaskMs)
    : modelDelayMs(model)
}

export async function runBenchmark(models = getBenchmarkModels(), credentials = readCredentials()): Promise<BenchmarkRun> {
  const startedAt = new Date().toISOString()
  const results: BenchmarkResult[] = []
  for (const model of models) {
    for (const [index, task] of BENCHMARK_TASKS.entries()) {
      const taskStartedAt = performance.now()
      const result = await benchmarkTask(model, task, credentials)
      results.push(serializeResult(result))
      console.log(`${model.modelId} ${task.id}: ${result.status}`)
      if (index < BENCHMARK_TASKS.length - 1) {
        const delay = getBenchmarkInterTaskDelayMs(model, performance.now() - taskStartedAt)
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }
  return { version: 1, startedAt, completedAt: new Date().toISOString(), results }
}

function outputPath(run: BenchmarkRun): string {
  const timestamp = run.startedAt.replaceAll(':', '-').replace(/\.\d+Z$/, 'Z')
  const directory = join(process.cwd(), 'data', 'ai-platform-benchmarks')
  mkdirSync(directory, { recursive: true })
  return join(directory, `${timestamp}.json`)
}

function reportPath(): string {
  return join(process.cwd(), 'docs', 'ai-platform-model-benchmark.md')
}

async function main() {
  const run = await runBenchmark()
  const path = outputPath(run)
  writeFileSync(path, `${JSON.stringify(run, null, 2)}\n`)
  writeFileSync(reportPath(), renderBenchmarkReport(run))
  console.log(`Saved benchmark results to ${path}`)
  console.log(`Saved benchmark report to ${reportPath()}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main()
}
