import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildTemplateSummaryRequest,
  DEFAULT_TEMPLATE_MODEL,
  deriveTemplateName,
  extractTemplateSummary,
  summarizeTemplatePrompt,
} from '../server/image-template-prompter'

const config = {
  apiKey: 'sk-anthropic-test',
  baseUrl: 'https://ai.example.test/',
  model: 'claude-sonnet-4.6',
}

const input = {
  imageBase64: 'aGVsbG8=',
  mediaType: 'image/png' as const,
  prompt: '竖版海报，西瓜味的夏天',
  aspectRatio: '3:4' as const,
  style: 'cartoon',
}

test('buildTemplateSummaryRequest targets the Anthropic messages endpoint with gateway headers', () => {
  const request = buildTemplateSummaryRequest(input, config)

  assert.equal(request.url, 'https://ai.example.test/v1/messages')
  assert.equal(request.headers.get('x-api-key'), 'sk-anthropic-test')
  assert.equal(request.headers.get('anthropic-version'), '2023-06-01')
  assert.equal(request.headers.get('x-app'), 'cli')
})

test('buildTemplateSummaryRequest sends an image block plus a text block with the original prompt', () => {
  const request = buildTemplateSummaryRequest(input, config)
  const body = JSON.parse(String(request.body))

  assert.equal(body.model, DEFAULT_TEMPLATE_MODEL)
  assert.equal(typeof body.system, 'string')
  assert.match(body.system, /<name>/)

  const content = body.messages[0].content
  const imageBlock = content.find((b: { type: string }) => b.type === 'image')
  const textBlock = content.find((b: { type: string }) => b.type === 'text')

  assert.deepEqual(imageBlock, {
    type: 'image',
    source: { type: 'base64', media_type: 'image/png', data: 'aGVsbG8=' },
  })
  assert.match(textBlock.text, /西瓜味的夏天/)
  assert.match(textBlock.text, /3:4/)
})

test('extractTemplateSummary parses the <name> and <prompt> markers', () => {
  const payload = {
    content: [
      { type: 'text', text: '旁白' },
      { type: 'text', text: '<name>西瓜味的夏天</name>\n<prompt>竖版海报，西瓜味的夏天，马克笔手绘质感。</prompt>' },
    ],
  }
  const result = extractTemplateSummary(payload)

  assert.deepEqual(result, { name: '西瓜味的夏天', prompt: '竖版海报，西瓜味的夏天，马克笔手绘质感。' })
})

test('extractTemplateSummary returns null when the markers are missing', () => {
  const payload = { content: [{ type: 'text', text: '只有一段文字，没有标记' }] }
  assert.equal(extractTemplateSummary(payload), null)
})

test('deriveTemplateName strips punctuation, trims, and caps at 12 chars', () => {
  assert.equal(deriveTemplateName('  拼贴风海边画报，竖版构图。  '), '拼贴风海边画报')
  assert.equal(deriveTemplateName('一个非常非常非常非常非常非常长的名字'), '一个非常非常非常非常非常')
  assert.equal(deriveTemplateName('   '), '新模板')
})

test('summarizeTemplatePrompt returns null on a non-ok upstream response', async () => {
  const server = (await import('node:http')).createServer((_req, res) => {
    res.statusCode = 500
    res.end('boom')
  }).listen(0)
  const port = (server.address() as { port: number }).port
  try {
    const result = await summarizeTemplatePrompt(input, { ...config, baseUrl: `http://127.0.0.1:${port}` })
    assert.equal(result, null)
  } finally {
    server.close()
  }
})
