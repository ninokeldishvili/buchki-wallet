import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from 'typebox'
import type { ChainKey } from '@buchki/wallet-core'
import { loadAddresses } from './me.ts'

export const balanceRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.addHook('preHandler', app.requireUser)

  /** Native + tracked token balances for every linked address of the signed-in user. */
  app.get('/balances', async (req) => {
    const { userId, evmAddress } = req.user!
    const addresses = await loadAddresses(app, userId, evmAddress)
    return { network: app.config.network.name, balances: await app.balances.getBalances(addresses) }
  })

  /** Token transfer history (indexer-backed tokens only, e.g. USD₮). */
  app.get('/history', {
    schema: {
      querystring: Type.Object({
        chain: Type.Union([Type.Literal('ethereum'), Type.Literal('solana'), Type.Literal('bitcoin'), Type.Literal('spark')]),
        token: Type.String({ pattern: '^[a-z0-9]{2,10}$' }),
        limit: Type.Integer({ minimum: 1, maximum: 100, default: 20 })
      })
    }
  }, async (req, reply) => {
    const { userId, evmAddress } = req.user!
    const { chain, token, limit } = req.query
    const address = (await loadAddresses(app, userId, evmAddress))[chain as ChainKey]
    if (!address) return reply.code(404).send({ error: `No ${chain} address linked` })

    const supported = app.config.network.indexerTokens.some((t) => t.chain === chain && t.token === token)
    if (!supported) return reply.code(404).send({ error: `No history available for ${token} on ${chain}` })
    if (!app.balances.indexerEnabled) return reply.code(503).send({ error: 'History is unavailable (indexer not configured)' })

    return { transfers: await app.balances.getHistory(chain as ChainKey, token, address, limit) }
  })
}
