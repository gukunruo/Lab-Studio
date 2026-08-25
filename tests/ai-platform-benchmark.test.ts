import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BENCHMARK_TASKS,
  getBenchmarkModels,
  scoreCode,
  scoreStructuredOutput,
  serializeResult,
  renderBenchmarkReport,
  summarizeBenchmark,
} from '../scripts/ai-platform-benchmark'

test('benchmark covers every non-image seed model with five fixed tasks', () => {
  const models = getBenchmarkModels()
  assert.equal(models.length, 17)
  assert.ok(models.some((model) => model.modelId === 'kimi-k3'))
  assert.equal(BENCHMARK_TASKS.length, 5)
  assert.deepEqual(BENCHMARK_TASKS.map((task) => task.id), ['general', 'reasoning', 'code', 'summary', 'structured'])
  assert.ok(models.every((model) => model.category !== 'image'))
})

test('benchmark quality scorers accept valid code and structured JSON', () => {
  assert.equal(scoreCode('function uniqueSorted(values: number[]) { return [...new Set(values)].sort((a, b) => a - b) }'), 1)
  assert.equal(scoreStructuredOutput('{"title":"修复登录超时","priority":"high","steps":["检查超时"]}'), 1)
  assert.equal(scoreStructuredOutput('{"title":"缺少字段"}'), 0)
})

test('benchmark result serialization keeps metrics but truncates output previews', () => {
  const safe = serializeResult({
    modelId: 'example',
    taskId: 'general',
    status: 'completed',
    ttftMs: 12,
    totalMs: 44,
    outputChars: 1000,
    qualityScore: 1,
    outputPreview: 'x'.repeat(1000),
  })
  assert.equal(safe.modelId, 'example')
  assert.equal(safe.outputPreview?.length, 600)
  assert.equal(JSON.stringify(safe).includes('api-key'), false)
})

test('benchmark ranking only ranks models that complete all tasks', () => {
  const complete = BENCHMARK_TASKS.map((task) => ({
    modelId: 'complete', taskId: task.id, status: 'completed' as const, ttftMs: 100, totalMs: 500, outputChars: 20, qualityScore: 1,
  }))
  const incomplete = [{ modelId: 'incomplete', taskId: 'general' as const, status: 'failed' as const, ttftMs: null, totalMs: 100, outputChars: 0, qualityScore: null, errorCategory: 'http_error' as const }]
  const run = { version: 1 as const, startedAt: '2026-08-23T00:00:00.000Z', completedAt: '2026-08-23T00:01:00.000Z', results: [...complete, ...incomplete] }
  const summaries = summarizeBenchmark(run)
  assert.equal(summaries.find((summary) => summary.modelId === 'complete')?.compositeScore !== null, true)
  assert.equal(summaries.find((summary) => summary.modelId === 'incomplete')?.compositeScore, null)
  assert.match(renderBenchmarkReport(run), /日常默认：complete/)
})
