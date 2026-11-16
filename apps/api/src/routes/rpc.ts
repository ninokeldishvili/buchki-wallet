import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from 'typebox'
import { RpcProxyError } from '../services/rpc-proxy.ts'

/**
 * Authenticated JSON-RPC proxy for Ethereum and Solana. Keeps paid RPC keys
 * off the client. The browser broadcasts already-signed transactions here;
 * no keys pass through.
 */
export const rpcRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.addHook('preHandler', app.requireUser)

  app.post('/:chain', {
    config: { rateLimit: { max: 300, timeWindow: '1 minute' } },
    schema: {
      params: Type.Object({ chain: Type.Union([Type.Literal('ethereum'), Type.Literal('solana')]) }),
      body: Type.Union([Type.Object({}, { additionalProperties: true }), Type.Array(Type.Object({}, { additionalProperties: true }))])
    }
  }, async (req, reply) => {
    try {
      const upstream = await app.rpc.forward(req.params.chain, req.body)
      return reply.code(upstream.status).type('application/json').send(upstream.body)
    } catch (err) {
      if (err instanceof RpcProxyError) return reply.code(err.statusCode).send({ error: err.message })
      req.log.warn({ err }, 'rpc upstream failed')
      return reply.code(502).send({ error: 'Upstream RPC unavailable' })
    }
  })
}
