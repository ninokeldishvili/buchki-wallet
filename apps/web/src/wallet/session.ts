import { CHAINS, type ChainKey } from '@buchki/wallet-core'
import type { WDK } from '@buchki/wallet-core/wdk'
import { api, ApiError, assertSafeSignInMessage } from '../api.ts'
import { profile } from '../config.ts'

/**
 * An unlocked wallet. Holds the WDK instance (and so the key material) in
 * memory only; `lock()` disposes it so WDK wipes the keys.
 */
export class WalletSession {
  readonly wdk: WDK
  readonly addresses: Record<ChainKey, string>
  private disposed = false

  private constructor (wdk: WDK, addresses: Record<ChainKey, string>) {
    this.wdk = wdk
    this.addresses = addresses
  }

  static async open (seedPhrase: string): Promise<WalletSession> {
    // Loaded on demand: the wallet modules are several MB and aren't needed before unlock.
    const { createWdk } = await import('@buchki/wallet-core/wdk')
    const { wdk } = await createWdk(seedPhrase, profile, { runtime: 'browser' })
    const addresses = {} as Record<ChainKey, string>
    for (const chain of CHAINS) addresses[chain] = await (await wdk.getAccount(chain, 0)).getAddress()
    const session = new WalletSession(wdk, addresses)
    try {
      await session.signIn()
    } catch (err) {
      session.lock()
      throw err
    }
    return session
  }

  account (chain: ChainKey) {
    if (this.disposed) throw new Error('Wallet is locked')
    return this.wdk.getAccount(chain, 0)
  }

  /** Reuses the API session if it belongs to this wallet; otherwise signs in and links addresses. */
  private async signIn (): Promise<void> {
    const evm = this.addresses.ethereum
    try {
      const me = await api.me()
      if (me.addresses.ethereum?.toLowerCase() === evm.toLowerCase()) return this.linkMissing(me.addresses)
      await api.logout() // session from a different wallet
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 401) throw err
    }

    const { nonce, message } = await api.nonce(evm)
    assertSafeSignInMessage(message, evm)
    const signature = await (await this.account('ethereum')).sign(message)
    await api.verify(nonce, signature)
    await this.linkMissing({})
  }

  private async linkMissing (linked: Partial<Record<ChainKey, string>>): Promise<void> {
    const missing = (['solana', 'bitcoin', 'spark'] as const).filter((c) => linked[c] !== this.addresses[c])
    if (missing.length) await api.linkAddresses(Object.fromEntries(missing.map((c) => [c, this.addresses[c]])))
  }

  lock (): void {
    if (this.disposed) return
    this.disposed = true
    this.wdk.dispose()
  }
}
