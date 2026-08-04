import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'

// 数据库路径可通过环境变量配置，方便本地开发和部署环境使用不同的数据卷。
const databaseUrl = process.env.DATABASE_URL ?? './data/lab-studio.db'
const databasePath = databaseUrl.startsWith('file:') ? databaseUrl.slice(5) : databaseUrl

mkdirSync(dirname(resolve(databasePath)), { recursive: true })

const sqlite = new Database(databasePath)
sqlite.pragma('journal_mode = WAL')

export const db = drizzle(sqlite)
