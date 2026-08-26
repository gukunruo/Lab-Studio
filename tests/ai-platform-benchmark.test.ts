import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BENCHMARK_TASKS,
  buildRequest,
  extractHttpErrorTelemetry,
  getBenchmarkModels,
  getBenchmarkMaxTokens,
  getBenchmarkInterTaskDelayMs,
  scoreCode,
  scoreStructuredOutput,
  serializeResult,
  renderBenchmarkReport,
  summarizeBenchmark,
} from '../scripts/ai-platform-benchmark'

test('benchmark covers every non-image seed model with five fixed tasks', () => {
  const models = getBenchmarkModels()
  assert.equal(models.length, 16)
  assert.ok(models.some((model) => model.modelId === 'kimi-k3'))
  assert.equal(BENCHMARK_TASKS.length, 5)
  assert.deepEqual(BENCHMARK_TASKS.map((task) => task.id), ['general', 'reasoning', 'code', 'summary', 'structured'])
  assert.ok(models.every((model) => model.category !== 'image'))
})

test('benchmark gives Kimi K3 the extended output budget', () => {
  assert.equal(getBenchmarkMaxTokens({ modelId: 'kimi-k3' }), 4096)
  assert.equal(getBenchmarkMaxTokens({ modelId: 'gpt-4.1' }), 600)
})

test('benchmark enables Kimi K3 reasoning with low effort', async () => {
  const model = getBenchmarkModels().find((candidate) => candidate.modelId === 'kimi-k3')
  assert.ok(model)
  const built = buildRequest(model, 'test prompt', {
    openai: { appId: 'test-app', appKey: 'test-key', baseUrl: 'https://ai.example.test/' },
  })

  assert.ok(built.request)
  assert.deepEqual(await built.request.json(), {
    model: 'kimi-k3',
    max_tokens: 4096,
    stream: true,
    messages: [{ role: 'user', content: 'test prompt' }],
    reasoning: { mode: 'enabled', effort: 'low' },
  })
})

test('benchmark applies Kimi start-to-start pacing while retaining other model delays', () => {
  assert.equal(getBenchmarkInterTaskDelayMs({ modelId: 'kimi-k3', rpmLimit: 50 }, 5_000), 56_000)
  assert.equal(getBenchmarkInterTaskDelayMs({ modelId: 'kimi-k3', rpmLimit: 50 }, 61_000), 0)
  assert.equal(getBenchmarkInterTaskDelayMs({ modelId: 'gpt-4.1', rpmLimit: 50 }, 5_000), 1_200)
  assert.equal(getBenchmarkInterTaskDelayMs({ modelId: 'gpt-4.1', rpmLimit: 50 }, 61_000), 1_200)
})

test('benchmark quality scorers accept valid code and structured JSON', () => {
  assert.equal(scoreCode('function uniqueSorted(values: number[]) { return [...new Set(values)].sort((a, b) => a - b) }'), 1)
  assert.equal(scoreStructuredOutput('{"title":"修复登录超时","priority":"high","steps":["检查超时"]}'), 1)
  assert.equal(scoreStructuredOutput('{"title":"缺少字段"}'), 0)
})

test('extracts provider code and Retry-After telemetry from an HTTP error response', async () => {
  const telemetry = await extractHttpErrorTelemetry(new Response(
    JSON.stringify({ error: { code: 'rate_limit_exceeded' } }),
    { status: 429, headers: { 'Retry-After': '2', 'Content-Type': 'application/json' } },
  ))

  assert.deepEqual(telemetry, { providerCode: 'rate_limit_exceeded', retryAfterMs: 2000 })
})

test('omits error messages and invalid Retry-After values from telemetry', async () => {
  for (const retryAfter of ['-1', '2.5']) {
    const telemetry = await extractHttpErrorTelemetry(new Response(
      JSON.stringify({ error: { code: 'rate_limit_exceeded', message: 'account quota details' } }),
      { status: 429, headers: { 'Retry-After': retryAfter, 'Content-Type': 'application/json' } },
    ))

    assert.deepEqual(telemetry, { providerCode: 'rate_limit_exceeded' })
  }
})

test('omits untrusted provider error codes while retaining safe retry telemetry', async () => {
  const telemetry = await extractHttpErrorTelemetry(new Response(
    JSON.stringify({ error: { code: 'sk-test-should-not-be-persisted' } }),
    { status: 429, headers: { 'Retry-After': '2', 'Content-Type': 'application/json' } },
  ))

  assert.deepEqual(telemetry, { retryAfterMs: 2000 })
})

test('omits oversized provider error codes', async () => {
  const telemetry = await extractHttpErrorTelemetry(new Response(
    JSON.stringify({ error: { type: `error_${'x'.repeat(64)}` } }),
    { status: 500, headers: { 'Content-Type': 'application/json' } },
  ))

  assert.deepEqual(telemetry, {})
})

test('omits unknown machine-formatted provider codes', async () => {
  const telemetry = await extractHttpErrorTelemetry(new Response(
    JSON.stringify({ error: { type: 'session_abc123' } }),
    { status: 429, headers: { 'Retry-After': '2', 'Content-Type': 'application/json' } },
  ))

  assert.deepEqual(telemetry, { retryAfterMs: 2000 })
})

test('extracts a future HTTP-date Retry-After delay and provider error type', async () => {
  const telemetry = await extractHttpErrorTelemetry(new Response(
    JSON.stringify({ error: { type: 'overloaded_error' } }),
    { status: 529, headers: { 'Retry-After': new Date(Date.now() + 5_000).toUTCString(), 'Content-Type': 'application/json' } },
  ))

  assert.equal(telemetry.providerCode, 'overloaded_error')
  assert.ok(telemetry.retryAfterMs && telemetry.retryAfterMs > 3_000 && telemetry.retryAfterMs <= 5_000)
})

test('ignores future dates that are not valid HTTP-date Retry-After values', async () => {
  for (const retryAfter of ['2027-01-01', '12/31/2999']) {
    const telemetry = await extractHttpErrorTelemetry(new Response(
      JSON.stringify({ error: { code: 'rate_limit_exceeded' } }),
      { status: 429, headers: { 'Retry-After': retryAfter, 'Content-Type': 'application/json' } },
    ))

    assert.deepEqual(telemetry, { providerCode: 'rate_limit_exceeded' })
  }
})

test('ignores impossible and wrong-weekday IMF-fixdate Retry-After values', async () => {
  for (const retryAfter of ['Thu, 31 Apr 2027 00:00:00 GMT', 'Thu, 01 Jan 2027 00:00:00 GMT']) {
    const telemetry = await extractHttpErrorTelemetry(new Response(
      JSON.stringify({ error: { code: 'rate_limit_exceeded' } }),
      { status: 429, headers: { 'Retry-After': retryAfter, 'Content-Type': 'application/json' } },
    ))

    assert.deepEqual(telemetry, { providerCode: 'rate_limit_exceeded' })
  }
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
