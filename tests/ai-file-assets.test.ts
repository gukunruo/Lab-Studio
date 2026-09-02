import test from 'node:test'
import assert from 'node:assert/strict'
import { rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { db } from '../server/db/client'
import { aiImageAssets } from '../server/db/schema'
import {
  decodeBase64File,
  fileAssetUrl,
  fileAssetResponse,
  readFileAssetText,
  storeFileAsset,
  MAX_FILE_BYTES,
} from '../server/ai-file-assets'

const databaseUrl = process.env.DATABASE_URL ?? './data/lab-studio.db'
const databasePath = databaseUrl.startsWith('file:') ? databaseUrl.slice(5) : databaseUrl
const assetDirectory = process.env.AI_IMAGE_ASSET_DIR
  ? resolve(process.env.AI_IMAGE_ASSET_DIR)
  : join(dirname(resolve(databasePath)), 'ai-images')

function fileAssetPath(id: string, extension: string): string {
  return join(assetDirectory, `${id}.${extension}`)
}

test('decodeBase64File accepts a text file and derives extension from the name', () => {
  const decoded = decodeBase64File(Buffer.from('你好').toString('base64'), { mimeType: 'text/plain', fileName: 'notes.txt' })
  assert.ok(decoded)
  assert.equal(decoded.extension, 'txt')
  assert.equal(decoded.mimeType, 'text/plain')
  assert.equal(decoded.fileName, 'notes.txt')
  assert.deepEqual(decoded.bytes, Buffer.from('你好'))
})

test('decodeBase64File rejects malformed, oversized, and unsupported payloads', () => {
  assert.equal(decodeBase64File('not base64!'), null)
  assert.equal(decodeBase64File(Buffer.from('data').toString('base64'), { fileName: 'noext' }), null)
  assert.equal(decodeBase64File(Buffer.from('x').toString('base64'), { fileName: 'evil.html' }), null)
  assert.equal(decodeBase64File(Buffer.from('x').toString('base64'), { fileName: 'img.svg', mimeType: 'image/svg+xml' }), null)
  assert.equal(decodeBase64File('A'.repeat(Math.ceil(MAX_FILE_BYTES / 3) * 4 + 8)), null)
})

test('fileAssetUrl only builds paths for UUID asset ids', () => {
  assert.equal(
    fileAssetUrl('b4d7cf09-5548-4c45-ac5a-8f5a5f7e6b56'),
    '/api/ai-platform/files/b4d7cf09-5548-4c45-ac5a-8f5a5f7e6b56',
  )
  assert.equal(fileAssetUrl('../file.txt'), null)
})

test('fileAssetResponse returns the attachment only to its owner', async () => {
  const decoded = decodeBase64File(Buffer.from('文件内容').toString('base64'), { mimeType: 'text/plain', fileName: 'a.txt' })
  assert.ok(decoded)
  const asset = await storeFileAsset('file-test-owner', decoded)
  try {
    const response = await fileAssetResponse('file-test-owner', asset.id)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'text/plain')
    assert.equal(response.headers.get('content-disposition'), 'attachment')
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), decoded.bytes)

    const foreignResponse = await fileAssetResponse('another-user', asset.id)
    assert.equal(foreignResponse.status, 404)

    const invalidResponse = await fileAssetResponse('file-test-owner', 'not-a-uuid')
    assert.equal(invalidResponse.status, 404)
  } finally {
    await db.delete(aiImageAssets).where(eq(aiImageAssets.id, asset.id))
    await rm(fileAssetPath(asset.id, asset.extension), { force: true })
  }
})

test('readFileAssetText falls back to live extraction when the sidecar cache is missing', async () => {
  const decoded = decodeBase64File(Buffer.from('第一行').toString('base64'), { mimeType: 'text/plain', fileName: 'notes.txt' })
  assert.ok(decoded)
  const asset = await storeFileAsset('file-test-owner', decoded)
  try {
    const text = await readFileAssetText('file-test-owner', asset.id)
    assert.equal(text, 'attachment.txt\n第一行')
  } finally {
    await db.delete(aiImageAssets).where(eq(aiImageAssets.id, asset.id))
    await rm(fileAssetPath(asset.id, asset.extension), { force: true })
    await rm(join(assetDirectory, '.text', `${asset.id}.txt`), { force: true })
  }
})
