import type { NetworkProfile } from '@buchki/wallet-core'

/**
 * JSON-RPC methods the wallet needs. Everything else is rejected, so the proxy
 * can't be used as a free general-purpose RPC (debug_*, trace_*, logs scans...).
 */
export const RPC_ALLOWLIST = {
  ethereum: new Set([
    'eth_chainId', 'net_version', 'eth_blockNumber', 'eth_getBalance', 'eth_getTransactionCount',
    'eth_getCode', 'eth_call', 'eth_estimateGas', 'eth_gasPrice', 'eth_maxPriorityFeePerGas',
    'eth_feeHistory', 'eth_getBlockByNumber', 'eth_sendRawTransaction', 'eth_getTransactionByHash',
    'eth_getTransactionReceipt'
  ]),
  solana: new Set([
    'getHealth', 'getVersion', 'getSlot', 'getBlockHeight', 'getEpochInfo', 'getLatestBlockhash',
    'isBlockhashValid', 'getBalance', 'getAccountInfo', 'getMultipleAccounts', 'getTokenAccountsByOwner',
    'getTokenAccountBalance', 'getFeeForMessage', 'getMinimumBalanceForRentExemption',
    'getRecentPrioritizationFees', 'simulateTransaction', 'sendTransaction', 'getSignatureStatuses',
    'getTransaction'
  ])
} as const

export type RpcChain = keyof typeof RPC_ALLOWLIST

const MAX_BATCH = 20
const UPSTREAM_TIMEOUT_MS = 20_000

interface JsonRpcRequest { jsonrpc?: string, id?: unknown, method?: unknown, params?: unknown }

export class RpcProxyError extends Error {
  readonly statusCode: number
  constructor (message: string, statusCode: number) {
    super(message)
    this.statusCode = statusCode
  }
}

export class RpcProxy {
  private readonly profile: NetworkProfile
  private readonly fetchImpl: typeof fetch

  constructor (profile: NetworkProfile, fetchImpl: typeof fetch = fetch) {
    this.profile = profile
    this.fetchImpl = fetchImpl
  }

  private upstream (chain: RpcChain): string {
    return chain === 'ethereum' ? this.profile.evm.rpcUrl : this.profile.solana.rpcUrl
  }

  /** Validates a single or batch JSON-RPC body against the allowlist. */
  validate (chain: RpcChain, body: unknown): void {
    const calls = Array.isArray(body) ? body : [body]
    if (calls.length === 0 || calls.length > MAX_BATCH) throw new RpcProxyError(`Batch size must be 1-${MAX_BATCH}`, 400)
    for (const call of calls as JsonRpcRequest[]) {
      if (!call || typeof call !== 'object' || typeof call.method !== 'string') throw new RpcProxyError('Invalid JSON-RPC request', 400)
      if (!RPC_ALLOWLIST[chain].has(call.method)) throw new RpcProxyError(`Method not allowed: ${call.method}`, 403)
    }
  }

  async forward (chain: RpcChain, body: unknown): Promise<{ status: number, body: string }> {
    this.validate(chain, body)
    const res = await this.fetchImpl(this.upstream(chain), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    })
    return { status: res.status, body: await res.text() }
  }
}
