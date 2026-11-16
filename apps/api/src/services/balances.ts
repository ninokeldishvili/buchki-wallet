import { createReadOnlyAccount, type ChainKey, type NetworkProfile } from '@buchki/wallet-core'
import { WdkIndexerClient, isApiError } from '@tetherto/wdk-indexer-http'

const CACHE_TTL_MS = 20_000
const CACHE_MAX_ENTRIES = 5_000
const CHAIN_TIMEOUT_MS = 15_000

export interface TokenBalance {
  token: string
  symbol: string
  /** Decimal string as returned by the indexer, e.g. "1008.2". */
  amount: string
}

export interface ChainBalance {
  chain: ChainKey
  address: string
  native: { symbol: string, decimals: number, amount: string } | null
  tokens: TokenBalance[]
  /** Set when the chain could not be reached; the client should show it as unavailable, not zero. */
  error?: string
}

export interface Transfer {
  txHash: string
  timestamp: number
  from: string | null
  to: string | null
  amount: string
  token: string
  direction: 'in' | 'out' | 'self'
}

function withTimeout<T> (promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${what} timed out`)), ms) })
  ]).finally(() => clearTimeout(timer))
}

/** Small TTL cache, so repeated dashboard refreshes don't hammer public RPCs. */
class TtlCache<T> {
  private readonly entries = new Map<string, { value: T, expires: number }>()
  get (key: string): T | undefined {
    const hit = this.entries.get(key)
    if (hit && hit.expires > Date.now()) return hit.value
    this.entries.delete(key)
    return undefined
  }

  set (key: string, value: T): void {
    if (this.entries.size >= CACHE_MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value
      if (oldest !== undefined) this.entries.delete(oldest)
    }
    this.entries.set(key, { value, expires: Date.now() + CACHE_TTL_MS })
  }
}

export class BalanceService {
  private readonly nativeCache = new TtlCache<bigint>()
  private readonly tokenCache = new TtlCache<TokenBalance[]>()
  private readonly indexer: WdkIndexerClient | null
  private readonly profile: NetworkProfile

  constructor (profile: NetworkProfile, indexerApiKey: string | undefined) {
    this.profile = profile
    this.indexer = indexerApiKey ? new WdkIndexerClient({ apiKey: indexerApiKey, timeout: CHAIN_TIMEOUT_MS }) : null
  }

  get indexerEnabled (): boolean {
    return this.indexer !== null
  }

  async getBalances (addresses: Partial<Record<ChainKey, string>>): Promise<ChainBalance[]> {
    const entries = Object.entries(addresses) as [ChainKey, string][]
    return Promise.all(entries.map(([chain, address]) => this.getChainBalance(chain, address)))
  }

  private async getChainBalance (chain: ChainKey, address: string): Promise<ChainBalance> {
    const { symbol, decimals } = this.profile.native[chain]
    const [native, tokens] = await Promise.allSettled([
      this.getNativeBalance(chain, address),
      this.getTokenBalances(chain, address)
    ])

    const result: ChainBalance = {
      chain,
      address,
      native: native.status === 'fulfilled' ? { symbol, decimals, amount: native.value.toString() } : null,
      tokens: tokens.status === 'fulfilled' ? tokens.value : []
    }
    const errors = [native, tokens].filter((r) => r.status === 'rejected').map((r) => (r as PromiseRejectedResult).reason?.message ?? 'unavailable')
    if (errors.length) result.error = errors.join('; ')
    return result
  }

  private async getNativeBalance (chain: ChainKey, address: string): Promise<bigint> {
    const key = `${chain}:${address}`
    const cached = this.nativeCache.get(key)
    if (cached !== undefined) return cached

    const account = createReadOnlyAccount(chain, address, this.profile) as { getBalance (): Promise<bigint>, dispose?: () => void }
    try {
      const balance = await withTimeout(account.getBalance(), CHAIN_TIMEOUT_MS, `${chain} balance`)
      this.nativeCache.set(key, balance)
      return balance
    } finally {
      account.dispose?.()
    }
  }

  private async getTokenBalances (chain: ChainKey, address: string): Promise<TokenBalance[]> {
    const tracked = this.profile.indexerTokens.filter((t) => t.chain === chain)
    if (!this.indexer || tracked.length === 0) return []

    const key = `${chain}:${address}`
    const cached = this.tokenCache.get(key)
    if (cached) return cached

    const results = await this.indexer.getBatchTokenBalances(
      tracked.map((t) => ({ blockchain: t.indexerChain, token: t.token, address }))
    )
    const balances = tracked.flatMap((t, i): TokenBalance[] => {
      const item = results[i]
      if (!item || isApiError(item)) return []
      return [{ token: t.token, symbol: t.symbol, amount: item.tokenBalance.amount }]
    })
    this.tokenCache.set(key, balances)
    return balances
  }

  /** Token transfer history from the indexer. Native-asset history isn't indexed yet. */
  async getHistory (chain: ChainKey, token: string, address: string, limit: number): Promise<Transfer[]> {
    const tracked = this.profile.indexerTokens.find((t) => t.chain === chain && t.token === token)
    if (!tracked) throw new Error(`No history available for ${token} on ${chain}`)
    if (!this.indexer) throw new Error('History is unavailable: indexer API key not configured')

    const { transfers } = await this.indexer.getTokenTransfers(tracked.indexerChain, tracked.token, address, { limit })
    const self = address.toLowerCase()
    return transfers.map((t) => {
      const from = t.from?.toLowerCase() ?? null
      const to = t.to?.toLowerCase() ?? null
      return {
        txHash: t.transactionHash,
        timestamp: t.timestamp,
        from: t.from,
        to: t.to,
        amount: t.amount,
        token: tracked.symbol,
        direction: from === self && to === self ? 'self' : from === self ? 'out' : 'in'
      }
    })
  }
}
