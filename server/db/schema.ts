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

export const chatSessions = sqliteTable('chat_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userKey: text('user_key').notNull(),
  lessonId: text('lesson_id').notNull(),
  messages: text('messages', { mode: 'json' }).$type<unknown[]>().notNull().default([]),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})
