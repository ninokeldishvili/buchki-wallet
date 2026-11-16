import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, isNull, lt, or } from 'drizzle-orm'
import { getAddress, verifyMessage } from 'ethers'
import type { Db } from '../db/client.ts'
import { authNonces, sessions, users } from '../db/schema.ts'

const NONCE_TTL_MS = 5 * 60 * 1000
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

export class AuthError extends Error {}

/**
 * Sign-in with an EVM account, following the EIP-4361 (Sign-In with Ethereum) message format.
 * The browser signs the message with WDK's `account.sign()` (EIP-191 personal_sign),
 * which is what `ethers.verifyMessage` checks.
 */
export class AuthService {
  private readonly db: Db
  private readonly opts: { webOrigin: string, chainId: number }

  constructor (db: Db, opts: { webOrigin: string, chainId: number }) {
    this.db = db
    this.opts = opts
  }

  async createChallenge (rawAddress: string): Promise<{ nonce: string, message: string }> {
    const address = getAddress(rawAddress) // throws on invalid; returns checksummed
    const nonce = randomBytes(16).toString('hex')
    const issuedAt = new Date()
    const expiresAt = new Date(issuedAt.getTime() + NONCE_TTL_MS)
    const { host } = new URL(this.opts.webOrigin)

    const message = [
      `${host} wants you to sign in with your Ethereum account:`,
      address,
      '',
      'Sign in to Buchki Wallet. This request does not send a transaction or cost any fees.',
      '',
      `URI: ${this.opts.webOrigin}`,
      'Version: 1',
      `Chain ID: ${this.opts.chainId}`,
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt.toISOString()}`,
      `Expiration Time: ${expiresAt.toISOString()}`
    ].join('\n')

    await this.db.insert(authNonces).values({ nonce, address: address.toLowerCase(), message, expiresAt })
    return { nonce, message }
  }

  /** Verifies the signature, consumes the nonce and returns a new session token. */
  async verifyChallenge (nonce: string, signature: string): Promise<{ userId: string, token: string, expiresAt: Date }> {
    // Consume atomically: only one request can ever use a nonce.
    const [challenge] = await this.db.update(authNonces)
      .set({ usedAt: new Date() })
      .where(and(eq(authNonces.nonce, nonce), isNull(authNonces.usedAt), gt(authNonces.expiresAt, new Date())))
      .returning()

    if (!challenge) throw new AuthError('Sign-in request expired or already used')

    let recovered: string
    try {
      recovered = verifyMessage(challenge.message, signature)
    } catch {
      throw new AuthError('Invalid signature')
    }
    if (recovered.toLowerCase() !== challenge.address) throw new AuthError('Signature does not match address')

    const [user] = await this.db.insert(users)
      .values({ evmAddress: challenge.address })
      .onConflictDoUpdate({ target: users.evmAddress, set: { evmAddress: challenge.address } })
      .returning({ id: users.id })

    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
    await this.db.insert(sessions).values({ tokenHash: sha256(token), userId: user!.id, expiresAt })

    return { userId: user!.id, token, expiresAt }
  }

  async resolveSession (token: string): Promise<{ userId: string, evmAddress: string } | null> {
    const [row] = await this.db.select({ userId: sessions.userId, evmAddress: users.evmAddress })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())))
    return row ?? null
  }

  async revokeSession (token: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)))
  }

  /** Deletes expired sessions and stale nonces. */
  async cleanup (): Promise<void> {
    const now = new Date()
    await this.db.delete(sessions).where(lt(sessions.expiresAt, now))
    await this.db.delete(authNonces).where(or(lt(authNonces.expiresAt, now), lt(authNonces.usedAt, new Date(now.getTime() - NONCE_TTL_MS))))
  }
}
