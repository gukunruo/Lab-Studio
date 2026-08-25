import test from 'node:test'
import assert from 'node:assert/strict'
import { rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import {
  generateImage,
  isSafeImageUrl,
  type ImageGenerationInput,
} from '../src/ai-platform/api'
import {
  buildGeminiMultimodalRequest,
  buildGptImageRequest,
  buildImageGenerationRequest,
  imageAssetResponse,
  normalizeGeminiMultimodalResponse,
  normalizeImageGenerationResponse,
} from '../server/ai-platform'
import {
  decodeBase64Image,
  imageAssetUrl,
  readImageAsset,
  storeImageAsset,
} from '../server/ai-image-assets'
import { db } from '../server/db/client'
import { aiImageAssets } from '../server/db/schema'

const databaseUrl = process.env.DATABASE_URL ?? './data/lab-studio.db'
const databasePath = databaseUrl.startsWith('file:') ? databaseUrl.slice(5) : databaseUrl
const imageAssetDirectory = process.env.AI_IMAGE_ASSET_DIR
  ? resolve(process.env.AI_IMAGE_ASSET_DIR)
  : join(dirname(resolve(databasePath)), 'ai-images')

function imageAssetPath(id: string, extension: string): string {
  return join(imageAssetDirectory, `${id}.${extension}`)
}

const input: ImageGenerationInput = {
  modelId: 'gpt-image-2',
  prompt: '电影感的橘猫',
  aspectRatio: '1:1',
  signal: new AbortController().signal,
}

test('generateImage calls the guarded API with only supported input fields', async () => {
  const originalFetch = globalThis.fetch
  let url = ''
  let init: RequestInit | undefined
  globalThis.fetch = async (request, options) => {
    url = String(request)
    init = options
    return Response.json({
      modelId: 'gpt-image-2',
      imageUrl: 'https://cdn.example.test/cat.png',
    })
  }

  try {
    const result = await generateImage(input)

    assert.deepEqual(result, {
      modelId: 'gpt-image-2',
      imageUrl: 'https://cdn.example.test/cat.png',
    })
    assert.equal(url, '/api/ai-platform/images/generations')
    assert.equal(init?.method, 'POST')
    assert.equal(init?.credentials, 'include')
    assert.deepEqual(JSON.parse(String(init?.body)), {
      modelId: 'gpt-image-2',
      prompt: '电影感的橘猫',
      aspectRatio: '1:1',
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('isSafeImageUrl accepts only HTTPS URLs and controlled image asset paths', () => {
  assert.equal(isSafeImageUrl('https://cdn.example.test/image.png'), true)
  assert.equal(isSafeImageUrl('/api/ai-platform/images/b4d7cf09-5548-4c45-ac5a-8f5a5f7e6b56'), true)
  assert.equal(isSafeImageUrl('/api/ai-platform/images/not-a-uuid'), false)
  assert.equal(isSafeImageUrl('http://cdn.example.test/image.png'), false)
  assert.equal(isSafeImageUrl('data:image/png;base64,abc'), false)
})

test('generateImage accepts the Gemini image model', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({
    modelId: 'gemini-3-pro-image',
    imageUrl: 'https://cdn.example.test/gemini.png',
  })

  try {
    const result = await generateImage({ ...input, modelId: 'gemini-3-pro-image' })
    assert.equal(result.modelId, 'gemini-3-pro-image')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('generateImage rejects unsafe or malformed successful responses', async (t) => {
  const originalFetch = globalThis.fetch
  const invalidPayloads = [
    { modelId: 'gpt-image-2', imageUrl: 'http://cdn.example.test/cat.png' },
    { modelId: 'gpt-image-2', imageUrl: 'data:image/png;base64,abc' },
    { modelId: 'gpt-image-2', imageUrl: '' },
    { modelId: 'unknown-image-model', imageUrl: 'https://cdn.example.test/cat.png' },
  ]

  try {
    for (const payload of invalidPayloads) {
      await t.test(`rejects ${String(payload.imageUrl || payload.modelId)}`, async () => {
        globalThis.fetch = async () => Response.json(payload)
        await assert.rejects(() => generateImage(input), {
          message: '图片生成服务返回了无效结果，请稍后重试。',
        })
      })
    }
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('generateImage returns a controlled API error', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({ error: '图片模型当前不可用。' }, { status: 400 })

  try {
    await assert.rejects(() => generateImage(input), {
      message: '图片模型当前不可用。',
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('buildImageGenerationRequest uses the confirmed GPT image endpoint and body', () => {
  const request = buildImageGenerationRequest({
    modelId: 'gpt-image-2',
    prompt: '孙悟空',
    aspectRatio: '16:9',
  }, {
    baseUrl: 'https://ai.example.test/',
    appId: 'test-app',
    appKey: 'test-key',
  })

  assert.equal(request.url, 'https://ai.example.test/openai-compatible/v1/images/generations')
  assert.deepEqual(JSON.parse(request.body), {
    model: 'gpt-image-2',
    prompt: '孙悟空',
  })
})

test('buildGeminiMultimodalRequest uses the confirmed text-only chat-completions contract', () => {
  const request = buildGeminiMultimodalRequest({ prompt: '生成一个猫咪图片' }, {
    baseUrl: 'https://ai.example.test',
    appId: 'test-app',
    appKey: 'test-key',
  })

  assert.equal(request.url, 'https://ai.example.test/openai-compatible/v1/chat/completions')
  assert.deepEqual(JSON.parse(String(request.body)), {
    model: 'gemini-3-pro-image',
    messages: [{ role: 'user', content: '生成一个猫咪图片' }],
    modalities: ['text', 'image'],
  })
})

test('buildGeminiMultimodalRequest includes a server-side image content block', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const request = buildGeminiMultimodalRequest({ prompt: '优化一下' }, {
    baseUrl: 'https://ai.example.test',
    appId: 'test-app',
    appKey: 'test-key',
  }, { bytes: png, mimeType: 'image/png' })
  const body = JSON.parse(String(request.body))

  assert.deepEqual(body.messages[0].content.map((item: { type: string }) => item.type), [
    'text',
    'image_url',
  ])
  assert.deepEqual(body.modalities, ['text', 'image'])
})

test('buildGptImageRequest uses multipart edits only with a private reference image', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const request = buildGptImageRequest({
    modelId: 'gpt-image-2',
    prompt: '改成蓝色',
    aspectRatio: '1:1',
  }, {
    baseUrl: 'https://ai.example.test',
    appId: 'test-app',
    appKey: 'test-key',
  }, { bytes: png, mimeType: 'image/png' })

  assert.equal(request.url, 'https://ai.example.test/openai-compatible/v1/images/edits')
  assert.ok(request.body instanceof FormData)
  assert.equal(request.headers.has('Content-Type'), false)
})

test('normalizeGeminiMultimodalResponse preserves text-only success', () => {
  assert.deepEqual(normalizeGeminiMultimodalResponse({
    choices: [{ message: { content: '请提供一张需要优化的图片。' } }],
  }), { content: '请提供一张需要优化的图片。' })
})

test('normalizeGeminiMultimodalResponse returns text with a decoded image', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const result = normalizeGeminiMultimodalResponse({
    choices: [{
      message: {
        content: '已完成优化。',
        images: [{ image_url: { url: `data:image/png;base64,${png.toString('base64')}` } }],
      },
    }],
  })

  assert.equal(result?.content, '已完成优化。')
  assert.equal(result?.image && 'bytes' in result.image, true)
})

test('normalizeGeminiMultimodalResponse rejects a result without text or image', () => {
  assert.equal(normalizeGeminiMultimodalResponse({ choices: [{ message: {} }] }), null)
})

test('normalizeImageGenerationResponse accepts known HTTPS response shapes only', () => {
  assert.deepEqual(normalizeImageGenerationResponse({
    data: [{ url: 'https://cdn.example.test/gpt.png' }],
  }), { kind: 'url', imageUrl: 'https://cdn.example.test/gpt.png' })

  assert.deepEqual(normalizeImageGenerationResponse({
    choices: [{ message: { images: [{ url: 'https://cdn.example.test/gemini.png' }] } }],
  }), { kind: 'url', imageUrl: 'https://cdn.example.test/gemini.png' })

  assert.deepEqual(normalizeImageGenerationResponse({
    choices: [{ message: { images: [{ image_url: { url: 'https://cdn.example.test/gemini-nested.png' } }] } }],
  }), { kind: 'url', imageUrl: 'https://cdn.example.test/gemini-nested.png' })

  assert.deepEqual(normalizeImageGenerationResponse({
    choices: [{ message: { content: [{ type: 'image_url', image_url: { url: 'https://cdn.example.test/content.png' } }] } }],
  }), { kind: 'url', imageUrl: 'https://cdn.example.test/content.png' })
})

test('normalizeImageGenerationResponse accepts a valid b64_json image payload', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const result = normalizeImageGenerationResponse({ data: [{ b64_json: png.toString('base64') }] })

  assert.equal(result?.kind, 'base64')
  assert.deepEqual(result?.kind === 'base64' ? result.image.bytes : null, png)
})

test('normalizeImageGenerationResponse decodes a Gemini image data URL', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const result = normalizeImageGenerationResponse({
    choices: [{
      message: {
        images: [{
          image_url: { url: `data:image/png;base64,${png.toString('base64')}` },
        }],
      },
    }],
  })

  assert.equal(result?.kind, 'base64')
  assert.deepEqual(result?.kind === 'base64' ? result.image.bytes : null, png)
})


test('normalizeImageGenerationResponse rejects unsafe and malformed image URLs', () => {
  assert.equal(normalizeImageGenerationResponse({ data: [{ url: 'http://cdn.example.test/cat.png' }] }), null)
  assert.equal(normalizeImageGenerationResponse({ data: [{ url: 'data:image/png;base64,abc' }] }), null)
  assert.equal(normalizeImageGenerationResponse({ data: [{}] }), null)
  assert.equal(normalizeImageGenerationResponse(null), null)
})

test('decodeBase64Image accepts valid PNG data without retaining base64', () => {
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d,
  ])
  const decoded = decodeBase64Image(png.toString('base64'))

  assert.deepEqual(decoded, { bytes: png, mimeType: 'image/png', extension: 'png' })
  assert.equal('base64' in (decoded ?? {}), false)
})

test('decodeBase64Image rejects malformed, oversized, and non-image payloads', () => {
  assert.equal(decodeBase64Image('not base64!'), null)
  assert.equal(decodeBase64Image(Buffer.from('not an image').toString('base64')), null)
  assert.equal(decodeBase64Image('A'.repeat(12 * 1024 * 1024)), null)
})

test('imageAssetUrl only builds paths for UUID asset ids', () => {
  assert.equal(
    imageAssetUrl('b4d7cf09-5548-4c45-ac5a-8f5a5f7e6b56'),
    '/api/ai-platform/images/b4d7cf09-5548-4c45-ac5a-8f5a5f7e6b56',
  )
  assert.equal(imageAssetUrl('../image.png'), null)
})

test('imageAssetResponse returns private binary content only to its owner', async () => {
  const png = decodeBase64Image(Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]).toString('base64'))
  assert.ok(png)

  const asset = await storeImageAsset('image-test-owner', png)
  try {
    const response = await imageAssetResponse('image-test-owner', asset.id)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'image/png')
    assert.equal(response.headers.get('content-length'), String(png.bytes.length))
    assert.equal(response.headers.get('cache-control'), 'private, max-age=31536000, immutable')
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png.bytes)

    const foreignResponse = await imageAssetResponse('another-user', asset.id)
    assert.equal(foreignResponse.status, 404)

    const invalidResponse = await imageAssetResponse('image-test-owner', 'not-a-uuid')
    assert.equal(invalidResponse.status, 404)
  } finally {
    await db.delete(aiImageAssets).where(eq(aiImageAssets.id, asset.id))
    await rm(imageAssetPath(asset.id, asset.extension), { force: true })
  }
})

test('imageAssetResponse returns 404 when the asset file is missing', async () => {
  const png = decodeBase64Image(Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]).toString('base64'))
  assert.ok(png)

  const asset = await storeImageAsset('image-test-owner', png)
  const assetPath = imageAssetPath(asset.id, asset.extension)
  try {
    await rm(assetPath)
    const response = await imageAssetResponse('image-test-owner', asset.id)
    assert.equal(response.status, 404)
  } finally {
    await db.delete(aiImageAssets).where(eq(aiImageAssets.id, asset.id))
    await rm(assetPath, { force: true })
  }
})
