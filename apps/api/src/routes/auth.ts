import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from 'typebox'
import { AuthError, SESSION_TTL_MS } from '../services/auth.ts'

export const SESSION_COOKIE = 'buchki_session'

const authRateLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }

export const authRoutes: FastifyPluginAsyncTypebox = async (app) => {
  const cookieOptions = {
    httpOnly: true,
    secure: app.config.secureCookies,
    sameSite: 'lax' as const, // web and API must share a registrable domain (e.g. wallet.x.com + api.x.com)
    path: '/'
  }

  /** Step 1: get a message to sign with the EVM account. */
  app.post('/nonce', {
    ...authRateLimit,
    schema: { body: Type.Object({ address: Type.String({ pattern: '^0x[0-9a-fA-F]{40}$' }) }) }
  }, async (req) => {
    return app.auth.createChallenge(req.body.address)
  })

  /** Step 2: send back the signature; on success a session cookie is set. */
  app.post('/verify', {
    ...authRateLimit,
    schema: {
      body: Type.Object({
        nonce: Type.String({ pattern: '^[0-9a-f]{32}$' }),
        signature: Type.String({ pattern: '^0x[0-9a-fA-F]{130}$' })
      })
    }
  }, async (req, reply) => {
    try {
      const { token, expiresAt } = await app.auth.verifyChallenge(req.body.nonce, req.body.signature)
      reply.setCookie(SESSION_COOKIE, token, { ...cookieOptions, expires: expiresAt, maxAge: SESSION_TTL_MS / 1000 })
      return { ok: true }
    } catch (err) {
      if (err instanceof AuthError) return reply.code(401).send({ error: err.message })
      throw err
    }
  })

  app.post('/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE]
    if (token) await app.auth.revokeSession(token)
    reply.clearCookie(SESSION_COOKIE, cookieOptions)
    return { ok: true }
  })
}
