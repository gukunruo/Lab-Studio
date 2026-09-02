import test from 'node:test'
import assert from 'node:assert/strict'
import { rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { db } from '../server/db/client'
import { aiImageAssets } from '../server/db/schema'
import { decodeBase64File, fileAssetUrl, storeFileAsset } from '../server/ai-file-assets'
import { resolveChatContent } from '../server/ai-platform'

const databaseUrl = process.env.DATABASE_URL ?? './data/lab-studio.db'
const databasePath = databaseUrl.startsWith('file:') ? databaseUrl.slice(5) : databaseUrl
const assetDirectory = process.env.AI_IMAGE_ASSET_DIR
  ? resolve(process.env.AI_IMAGE_ASSET_DIR)
  : join(dirname(resolve(databasePath)), 'ai-images')

function fileAssetPath(id: string, extension: string): string {
  return join(assetDirectory, `${id}.${extension}`)
}

test('resolveChatContent injects the file body as a text block', async () => {
  const decoded = decodeBase64File(Buffer.from('第一行').toString('base64'), { mimeType: 'text/plain', fileName: 'a.txt' })
  assert.ok(decoded)
  const asset = await storeFileAsset('admin', decoded)
  try {
    const resolved = await resolveChatContent([
      { role: 'user', content: '', files: [{ url: fileAssetUrl(asset.id)!, name: 'a.txt' }] },
    ], 'anthropic')
    assert.equal(resolved.length, 1)
    const content = resolved[0].content
    assert.ok(Array.isArray(content), 'file-only message resolves to a content array')
    const parts = content as { type: string; text?: string }[]
    assert.equal(parts[0].type, 'text')
    assert.ok(parts[0].text!.startsWith('[文件：a.txt]\n'), `got ${parts[0].text}`)
  } finally {
    await db.delete(aiImageAssets).where(eq(aiImageAssets.id, asset.id))
    await rm(fileAssetPath(asset.id, asset.extension), { force: true })
    await rm(join(assetDirectory, '.text', `${asset.id}.txt`), { force: true })
  }
})

test('resolveChatContent drops files that are not controlled asset urls', async () => {
  const resolved = await resolveChatContent([
    { role: 'user', content: '', files: [{ url: 'https://evil.example.org/x.txt', name: 'x.txt' }] },
  ], 'anthropic')
  assert.equal(resolved.length, 1)
  assert.equal(resolved[0].content, '')
})
