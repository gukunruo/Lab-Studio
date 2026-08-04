import 'dotenv/config'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { db } from './client'

migrate(db, { migrationsFolder: './server/db/migrations' })
console.log('Database migrations applied')
