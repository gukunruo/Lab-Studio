import test from 'node:test'
import assert from 'node:assert/strict'
import { eq } from 'drizzle-orm'
import { db } from '../server/db/client'
import { aiImageTemplates } from '../server/db/schema'
import { gptImageSizeFromRatio } from '../server/ai-platform'

test('gptImageSizeFromRatio returns undefined for unknown or empty', () => {
  assert.equal(gptImageSizeFromRatio(undefined), undefined)
  assert.equal(gptImageSizeFromRatio(''), undefined)
  assert.equal(gptImageSizeFromRatio('21:9'), undefined)
  assert.equal(gptImageSizeFromRatio('1:1'), '1024x1024')
})

test('insert-and-delete a custom template owns it by user_key', async () => {
  const key = 'template-test-owner'
  const inserted = await db.insert(aiImageTemplates).values({
    userKey: key,
    name: '测试',
    prompt: '一只橘猫',
    aspectRatio: '16:9',
    style: 'cinematic',
    createdAt: new Date(),
  }).returning()
  assert.ok(inserted[0].id)
  try {
    const mine = await db.select().from(aiImageTemplates).where(eq(aiImageTemplates.userKey, key))
    assert.equal(mine.length, 1)
    assert.equal(mine[0].aspectRatio, '16:9')
    assert.equal(mine[0].style, 'cinematic')
  } finally {
    await db.delete(aiImageTemplates).where(eq(aiImageTemplates.id, inserted[0].id))
  }
})
