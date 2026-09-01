import test from 'node:test'
import assert from 'node:assert/strict'
import { eq } from 'drizzle-orm'
import { db } from '../server/db/client'
import { aiImageTemplates } from '../server/db/schema'

test('ai_image_templates table is queryable', async () => {
  const rows = await db.select().from(aiImageTemplates).limit(1)
  assert.ok(Array.isArray(rows))
})

test('ai_image_templates round-trips a row keyed by user_key', async () => {
  const inserted = await db.insert(aiImageTemplates).values({
    userKey: 'template-schema-test',
    name: '测试模板',
    prompt: '一只橘猫',
    aspectRatio: '16:9',
    style: 'cinematic',
    createdAt: new Date(),
  }).returning()

  assert.ok(inserted[0].id)
  assert.equal(inserted[0].aspectRatio, '16:9')
  assert.equal(inserted[0].style, 'cinematic')

  try {
    const found = await db.select().from(aiImageTemplates).where(eq(aiImageTemplates.userKey, 'template-schema-test'))
    assert.equal(found.length, 1)
    assert.equal(found[0].name, '测试模板')
  } finally {
    await db.delete(aiImageTemplates).where(eq(aiImageTemplates.id, inserted[0].id))
  }
})
