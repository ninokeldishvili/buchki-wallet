import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { fileURLToPath } from 'node:url'
import * as schema from './schema.ts'

export type Db = ReturnType<typeof createDb>['db']

export function createDb (databaseUrl: string) {
  const sql = postgres(databaseUrl, { max: 10, onnotice: () => {} })
  const db = drizzle(sql, { schema })
  return { db, sql }
}

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))

export async function runMigrations (db: Db): Promise<void> {
  await migrate(db, { migrationsFolder })
}
