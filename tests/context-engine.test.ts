import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPrefixSummary,
  buildSystemPrompt,
  detectContextShift,
  engineerContext,
  estimateTokens,
  looksLikeCodeOrOutput,
  splitWindow,
  truncateHead,
  truncateMessageContent,
  truncateTail,
} from '../server/context-engine'

test('estimateTokens weights CJK characters as full tokens', () => {
  const cjk = estimateTokens('你好世界')
  const latin = estimateTokens('abcd')
  assert.ok(cjk >= 4, 'each CJK char should count as at least one token')
  assert.ok(cjk > latin, 'CJK is denser than latin for the same length')
  assert.equal(estimateTokens(''), 0)
})

test('truncateHead keeps the beginning and appends a marker', () => {
  assert.equal(truncateHead('abcdef', 4), 'abc…')
  assert.equal(truncateHead('abcdef', 10), 'abcdef')
})

test('truncateTail keeps the end and prepends a marker', () => {
  assert.equal(truncateTail('abcdef', 4), '…def')
  assert.equal(truncateTail('abcdef', 10), 'abcdef')
})

test('looksLikeCodeOrOutput detects code fences, errors, and long-line logs', () => {
  assert.equal(looksLikeCodeOrOutput('```js\nconst a = 1;\n```'), true)
  assert.equal(looksLikeCodeOrOutput('Traceback (most recent call last):\n  File "a.py", line 3'), true)
  assert.equal(looksLikeCodeOrOutput('这是一段普通的中文短文，内容不长。'), false)
})

test('truncateMessageContent truncates prose by head and code by head + tail snippet', () => {
  const prose = '这是一段很长的中文说明。'.repeat(4000)
  const proseCut = truncateMessageContent(prose, 200)
  assert.ok(proseCut.length <= 200, 'prose stays within the cap')
  assert.ok(proseCut.endsWith('…'), 'prose truncates by head')

  const code = Array.from({ length: 200 }, (_, i) => `const line${i} = ${'x'.repeat(500)}`).join('\n')
  const codeCut = truncateMessageContent(code, 400)
  assert.ok(codeCut.length <= 400, 'code stays within the cap')
  assert.ok(codeCut.startsWith('const line0'), 'code keeps the leading lines')
  assert.ok(codeCut.includes('已省略'), 'code annotates the omitted range')
  assert.ok(codeCut.endsWith(code.slice(-10)), 'code keeps the trailing lines')
})

test('splitWindow keeps the most recent messages within the window', () => {
  const messages = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `msg ${i}` }))
  const { prefix, recent } = splitWindow(messages, 4)
  assert.equal(prefix.length, 6)
  assert.equal(recent.length, 4)
  assert.equal(recent[0]?.content, 'msg 6')
  assert.equal(recent[recent.length - 1]?.content, 'msg 9')
  assert.equal(splitWindow(messages, 20).prefix.length, 0)
})

test('buildPrefixSummary falls back to the first user question when no summary is provided', () => {
  const prefix = [
    { role: 'user', content: '请帮我设计一个数据库表结构' },
    { role: 'assistant', content: '好的，以下是建议。' },
  ]
  const summary = buildPrefixSummary(prefix)
  assert.ok(summary.includes('2 条消息'))
  assert.ok(summary.includes('请帮我设计一个数据库表结构'))
})

test('buildPrefixSummary prefers a provided summary over deterministic fallback', () => {
  const summary = buildPrefixSummary([{ role: 'user', content: '原始问题很长' }], '用户已整理好早期上下文')
  assert.ok(summary.includes('用户已整理好早期上下文'))
  assert.ok(!summary.includes('原始问题很长'))
})

test('buildSystemPrompt layers base, user, and summary sections', () => {
  const system = buildSystemPrompt({ userSystem: '你是数学老师', summary: '前情：已讨论微积分' })
  assert.ok(system.includes('Lab-Studio'))
  assert.ok(system.includes('【用户设定】'))
  assert.ok(system.includes('你是数学老师'))
  assert.ok(system.includes('【对话前情摘要】'))
  assert.ok(system.includes('前情：已讨论微积分'))
})

test('engineerContext passes a short conversation through untouched', () => {
  const result = engineerContext({
    messages: [
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '你好，有什么可以帮你？' },
    ],
    system: '请简洁回答',
    contextWindow: 128_000,
    maxTokens: 4096,
  })
  assert.deepEqual(result.messages, [
    { role: 'user', content: '你好' },
    { role: 'assistant', content: '你好，有什么可以帮你？' },
  ])
  assert.ok(result.system.includes('请简洁回答'))
  assert.ok(!result.system.includes('【对话前情摘要】'))
  assert.equal(result.maxTokens, 4096)
})

test('engineerContext compacts a long conversation into a windowed history + prefix summary', () => {
  const messages = Array.from({ length: 60 }, (_, i) => ({
    role: i % 2 ? 'assistant' as const : 'user' as const,
    content: `第 ${i} 条消息内容，包含一些讨论。`,
  }))
  const result = engineerContext({
    messages,
    contextWindow: 128_000,
    maxTokens: 4096,
  })
  assert.ok(result.messages.length < messages.length, 'history is windowed')
  assert.ok(result.messages.length >= 2, 'at least the recent window survives')
  assert.equal(result.messages[result.messages.length - 1]?.content, messages[59]?.content, 'latest message kept verbatim')
  assert.ok(result.system.includes('【对话前情摘要】'))
  assert.ok(result.system.includes('已省略'))
})

test('engineerContext uses the provided summary as the compaction text', () => {
  const messages = Array.from({ length: 60 }, (_, i) => ({
    role: i % 2 ? 'assistant' as const : 'user' as const,
    content: `第 ${i} 条`,
  }))
  const result = engineerContext({
    messages,
    summary: '已生成的对话整理摘要',
    contextWindow: 128_000,
    maxTokens: 4096,
  })
  assert.ok(result.system.includes('已生成的对话整理摘要'))
})

test('engineerContext respects a tight context window by truncating and clamping maxTokens', () => {
  const big = '内容'.repeat(200_000)
  const messages = Array.from({ length: 20 }, (_, i) => ({
    role: i % 2 ? 'assistant' as const : 'user' as const,
    content: big,
  }))
  const result = engineerContext({
    messages,
    contextWindow: 8_000,
    maxTokens: 4096,
  })
  assert.ok(result.messages.length < messages.length, 'window shrinks under budget pressure')
  for (const message of result.messages) {
    assert.ok(message.content.length < big.length, 'messages are truncated under budget pressure')
  }
  assert.ok(result.maxTokens <= 8_000, 'maxTokens stays within the context window')
  assert.ok(result.maxTokens >= 256, 'maxTokens keeps a usable floor')
})

// ---- 上下文相关性：主题无关时忽略上文，相关时带上文（豆包式「独立新请求」行为） ----

test('detectContextShift flags an unrelated lookup query as fresh after a design thread', () => {
  const messages = [
    { role: 'user', content: '帮我设计一个 AI Studio 的 logo，画一个科技感的图标' },
    { role: 'assistant', content: '好的，我先给你几个 logo 方向的草稿……' },
    { role: 'user', content: '再画一个更简约的版本，配色用深蓝' },
    { role: 'assistant', content: '这是新的简约 logo 草稿。' },
    { role: 'user', content: '查一下北京的天气' },
  ]
  const decision = detectContextShift(messages)
  assert.equal(decision.mode, 'fresh')
  assert.equal(decision.retainFrom, 4)
  assert.equal(decision.suppressSummary, true)
  assert.ok(decision.note.includes('忽略'))
})

test('detectContextShift keeps a same-domain follow-up in continue', () => {
  const messages = [
    { role: 'user', content: '查一下北京的天气' },
    { role: 'assistant', content: '北京今天晴，26°C。' },
    { role: 'user', content: '再查一下上海的天气' },
  ]
  const decision = detectContextShift(messages)
  assert.equal(decision.mode, 'continue')
  assert.equal(decision.retainFrom, 0)
  assert.equal(decision.suppressSummary, false)
})

test('detectContextShift defaults to continue when the query has no clear domain', () => {
  const messages = [
    { role: 'user', content: '帮我设计一个 logo' },
    { role: 'assistant', content: '好的。' },
    { role: 'user', content: '那杭州呢' },
  ]
  const decision = detectContextShift(messages)
  assert.equal(decision.mode, 'continue')
})

test('detectContextShift treats an explicit reset marker as fresh', () => {
  const messages = [
    { role: 'user', content: '帮我设计一个 logo' },
    { role: 'assistant', content: '好的。' },
    { role: 'user', content: '换个话题，介绍一下量子计算' },
  ]
  const decision = detectContextShift(messages)
  assert.equal(decision.mode, 'fresh')
})

test('engineerContext in fresh mode retains only the current query, drops summary, and injects the note', () => {
  const result = engineerContext({
    messages: [
      { role: 'user', content: '帮我设计一个 logo，科技感' },
      { role: 'assistant', content: '以下是草稿……' },
      { role: 'user', content: '查一下北京的天气' },
    ],
    system: '',
    summary: '用户正在设计一个 AI Studio logo',
    contextWindow: 128_000,
    maxTokens: 4096,
  })
  assert.deepEqual(result.messages, [{ role: 'user', content: '查一下北京的天气' }])
  assert.ok(!result.system.includes('【对话前情摘要】'))
  assert.ok(result.system.includes('忽略'))
})

test('engineerContext keeps context when the topic continues (same domain)', () => {
  const result = engineerContext({
    messages: [
      { role: 'user', content: '查一下北京的天气' },
      { role: 'assistant', content: '晴，26°C' },
      { role: 'user', content: '再查一下上海的天气' },
    ],
    summary: '用户在查询城市天气',
    contextWindow: 128_000,
    maxTokens: 4096,
  })
  assert.equal(result.messages.length, 3, 'continue keeps the full recent context')
  assert.deepEqual(result.messages[result.messages.length - 1], { role: 'user', content: '再查一下上海的天气' })
})

test('engineerContext threads images through untouched for multimodal', () => {
  const result = engineerContext({
    messages: [
      { role: 'user', content: '你好', images: ['/api/ai-platform/images/123e4567-e89b-42d3-a456-426614174000'] },
      { role: 'assistant', content: '你好，有什么可以帮你？' },
    ],
  })
  assert.equal(result.messages.length, 2)
  assert.deepEqual(result.messages[0].images, ['/api/ai-platform/images/123e4567-e89b-42d3-a456-426614174000'])
  assert.equal(result.messages[0].content, '你好')
  assert.equal(result.messages[1].images, undefined)
})
