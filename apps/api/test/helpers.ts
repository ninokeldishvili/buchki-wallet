import postgres from 'postgres'
import { NETWORKS } from '@buchki/wallet-core'
import { buildApp, type AppDeps } from '../src/app.ts'
import { createDb, runMigrations } from '../src/db/client.ts'
import type { Config } from '../src/env.ts'

export const WEB_ORIGIN = 'http://localhost:5173'
const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL ?? 'postgres://buchki:buchki@127.0.0.1:5433/buchki'
const TEST_DB = 'buchki_test'

export const testConfig: Config = {
  port: 0,
  host: '127.0.0.1',
  databaseUrl: ADMIN_URL.replace(/\/[^/]+$/, `/${TEST_DB}`),
  webOrigin: WEB_ORIGIN,
  secureCookies: false,
  network: NETWORKS.testnet,
  indexerApiKey: undefined,
  logLevel: 'silent'
}

/** Recreates the test database and runs migrations. */
export async function resetTestDb (): Promise<void> {
  const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {} })
  await admin.unsafe(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`)
  await admin.unsafe(`CREATE DATABASE ${TEST_DB}`)
  await admin.end()
  const { db, sql } = createDb(testConfig.databaseUrl)
  await runMigrations(db)
  await sql.end()
}

export async function createTestApp (overrides: Partial<AppDeps> = {}) {
  const { db, sql } = createDb(testConfig.databaseUrl)
  const app = await buildApp({ config: testConfig, db, ...overrides })
  return { app, close: async () => { await app.close(); await sql.end() } }
}

/** Extracts the session cookie value from a response's set-cookie header. */
export function sessionCookie (res: { cookies: { name: string, value: string }[] }): string {
  const c = res.cookies.find((c) => c.name === 'buchki_session')
  if (!c) throw new Error('no session cookie set')
  return `buchki_session=${c.value}`
}
