import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from 'typebox'
import { eq } from 'drizzle-orm'
import { isValidAddress, type ChainKey } from '@buchki/wallet-core'
import { userAddresses } from '../db/schema.ts'

/** Chains whose address the client registers (the EVM address comes from sign-in). */
const LINKABLE: readonly Exclude<ChainKey, 'ethereum'>[] = ['solana', 'bitcoin', 'spark']

/** All of a user's addresses, keyed by chain. */
export async function loadAddresses (app: Parameters<FastifyPluginAsyncTypebox>[0], userId: string, evmAddress: string) {
  const rows = await app.db.select().from(userAddresses).where(eq(userAddresses.userId, userId))
  const addresses: Partial<Record<ChainKey, string>> = { ethereum: evmAddress }
  for (const row of rows) addresses[row.chain as ChainKey] = row.address
  return addresses
}

export const meRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.addHook('preHandler', app.requireUser)

  app.get('/', async (req) => {
    const { userId, evmAddress } = req.user!
    return { userId, network: app.config.network.name, addresses: await loadAddresses(app, userId, evmAddress) }
  })

  /**
   * Links the user's other chain addresses. They are public data derived from the
   * same seed in the browser; the server only uses them for read-only lookups.
   */
  app.put('/addresses', {
    schema: {
      body: Type.Object({
        solana: Type.Optional(Type.String({ maxLength: 128 })),
        bitcoin: Type.Optional(Type.String({ maxLength: 128 })),
        spark: Type.Optional(Type.String({ maxLength: 160 }))
      }, { additionalProperties: false })
    }
  }, async (req, reply) => {
    const { userId, evmAddress } = req.user!
    const network = app.config.network.name

    const invalid = LINKABLE.filter((chain) => req.body[chain] !== undefined && !isValidAddress(chain, req.body[chain]!, network))
    if (invalid.length) return reply.code(400).send({ error: `Invalid ${network} address for: ${invalid.join(', ')}` })

    const values = LINKABLE.filter((chain) => req.body[chain] !== undefined)
      .map((chain) => ({ userId, chain, address: req.body[chain]!, updatedAt: new Date() }))

    if (values.length) {
      for (const value of values) {
        await app.db.insert(userAddresses).values(value)
          .onConflictDoUpdate({ target: [userAddresses.userId, userAddresses.chain], set: { address: value.address, updatedAt: value.updatedAt } })
      }
    }
    return { addresses: await loadAddresses(app, userId, evmAddress) }
  })
}
