import 'dotenv/config'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { db } from './client'

// 迁移需要显式执行且可以重复运行；部署新环境前先执行此脚本。
migrate(db, { migrationsFolder: './server/db/migrations' })
console.log('Database migrations applied')
