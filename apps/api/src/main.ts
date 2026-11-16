import { loadConfig } from './env.ts'
import { createDb, runMigrations } from './db/client.ts'
import { buildApp } from './app.ts'

const config = loadConfig()
const { db, sql } = createDb(config.databaseUrl)
await runMigrations(db)

const app = await buildApp({ config, db })

// Hourly cleanup of expired sessions and nonces.
const cleanup = setInterval(() => {
  app.auth.cleanup().catch((err) => app.log.error({ err }, 'cleanup failed'))
}, 60 * 60 * 1000)
cleanup.unref()

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`)
  clearInterval(cleanup)
  await app.close()
  await sql.end({ timeout: 5 })
  process.exit(0)
}
process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))

await app.listen({ port: config.port, host: config.host })
app.log.info(`API on ${config.network.name}, indexer ${app.balances.indexerEnabled ? 'enabled' : 'disabled'}`)
