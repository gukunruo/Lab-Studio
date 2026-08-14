import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const learningProgress = sqliteTable('learning_progress', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userKey: text('user_key').notNull().unique(),
  completed: text('completed', { mode: 'json' }).$type<string[]>().notNull().default([]),
  lastOpened: text('last_opened'),
  notes: text('notes').notNull().default(''),
  stepIndex: text('step_index', { mode: 'json' })
    .$type<Record<string, number>>()
    .notNull()
    .default({}),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const adminProfile = sqliteTable('admin_profile', {
  id: integer('id').primaryKey(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url').notNull().default(''),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const adminSessions = sqliteTable('admin_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
})

export const neteaseSessions = sqliteTable('netease_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userKey: text('user_key').notNull().unique(),
  encryptedCookie: text('encrypted_cookie').notNull(),
  iv: text('iv').notNull(),
  authTag: text('auth_tag').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
})

export const chatSessions = sqliteTable('chat_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userKey: text('user_key').notNull(),
  lessonId: text('lesson_id').notNull(),
  messages: text('messages', { mode: 'json' }).$type<unknown[]>().notNull().default([]),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

// 保存管理员对课程 Markdown 的个人覆盖版本；没有记录时前端继续使用仓库基线。
export const lessonDocuments = sqliteTable('lesson_documents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  lessonId: text('lesson_id').notNull().unique(),
  content: text('content').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

// 标注暂以整课 JSON 保存，便于支持同一段文字多种颜色、笔记和失效状态。
export const lessonAnnotations = sqliteTable('lesson_annotations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  lessonId: text('lesson_id').notNull().unique(),
  annotations: text('annotations', { mode: 'json' }).$type<unknown[]>().notNull().default([]),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

// 金融分析自选/关注列表，按管理员身份（userKey）归属。
export const watchlist = sqliteTable('watchlist', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userKey: text('user_key').notNull(),
  quoteId: text('quote_id').notNull(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  typeName: text('type_name').notNull().default(''),
  market: text('market').notNull().default(''),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})
