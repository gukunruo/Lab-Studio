import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'

const databaseUrl = process.env.DATABASE_URL ?? './data/lab-studio.db'
const databasePath = databaseUrl.startsWith('file:') ? databaseUrl.slice(5) : databaseUrl

mkdirSync(dirname(resolve(databasePath)), { recursive: true })

const sqlite = new Database(databasePath)
sqlite.pragma('journal_mode = WAL')

export const db = drizzle(sqlite)
