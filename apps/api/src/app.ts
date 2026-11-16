import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import type { Config } from './env.ts'
import type { Db } from './db/client.ts'
import { AuthService } from './services/auth.ts'
import { BalanceService } from './services/balances.ts'
import { RpcProxy } from './services/rpc-proxy.ts'
import { authRoutes, SESSION_COOKIE } from './routes/auth.ts'
import { meRoutes } from './routes/me.ts'
import { balanceRoutes } from './routes/balances.ts'
import { rpcRoutes } from './routes/rpc.ts'

export interface AppDeps {
  config: Config
  db: Db
  auth?: AuthService
  balances?: BalanceService
  rpc?: RpcProxy
}

declare module 'fastify' {
  interface FastifyInstance {
    config: Config
    db: Db
    auth: AuthService
    balances: BalanceService
    rpc: RpcProxy
    requireUser: (req: FastifyRequest) => Promise<void>
  }
  interface FastifyRequest {
    user: { userId: string, evmAddress: string } | null
  }
}

/** Fields that must never reach the logs, even if a client sends them by mistake. */
const REDACT = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  '*.seed', '*.seedPhrase', '*.mnemonic', '*.privateKey', '*.signature'
]

export async function buildApp (deps: AppDeps): Promise<FastifyInstance> {
  const { config, db } = deps

  const app = Fastify({
    logger: { level: config.logLevel, redact: { paths: REDACT, censor: '[redacted]' } },
    trustProxy: true,
    bodyLimit: 256 * 1024
  }).withTypeProvider<TypeBoxTypeProvider>()

  app.decorate('config', config)
  app.decorate('db', db)
  app.decorate('auth', deps.auth ?? new AuthService(db, { webOrigin: config.webOrigin, chainId: config.network.evm.chainId }))
  app.decorate('balances', deps.balances ?? new BalanceService(config.network, config.indexerApiKey))
  app.decorate('rpc', deps.rpc ?? new RpcProxy(config.network))
  app.decorateRequest('user', null)

  await app.register(helmet)
  await app.register(cors, {
    origin: config.webOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  })
  await app.register(cookie)
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' })

  // CSRF defence: state-changing requests must come from the web app's origin.
  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return
    if (req.headers.origin !== config.webOrigin) {
      return reply.code(403).send({ error: 'Forbidden origin' })
    }
  })

  // Resolve the session (if any) for every request.
  app.addHook('preHandler', async (req) => {
    const token = req.cookies[SESSION_COOKIE]
    if (token) req.user = await app.auth.resolveSession(token)
  })

  app.decorate('requireUser', async (req: FastifyRequest) => {
    if (!req.user) {
      const err = new Error('Not signed in') as Error & { statusCode: number }
      err.statusCode = 401
      throw err
    }
  })

  app.get('/health', async () => ({ status: 'ok', network: config.network.name, indexer: app.balances.indexerEnabled }))

  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(meRoutes, { prefix: '/me' })
  await app.register(balanceRoutes)
  await app.register(rpcRoutes, { prefix: '/rpc' })

  return app
}
