import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>

let _db: DrizzleDB | null = null

export function getDb(): DrizzleDB {
  if (_db) return _db
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Missing required env var: DATABASE_URL')
  const sqlite = new Database(url)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  _db = drizzle(sqlite, { schema })
  return _db
}
