import type { ChainKey } from '@buchki/wallet-core'
import { API_BASE, profile } from './config.ts'

export class ApiError extends Error {
  readonly status: number
  constructor (status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T> (method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(API_BASE + path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) throw new ApiError(res.status, data?.error ?? data?.message ?? `Request failed (${res.status})`)
  return data as T
}

export interface ChainBalance {
  chain: ChainKey
  address: string
  native: { symbol: string, decimals: number, amount: string } | null
  tokens: { token: string, symbol: string, amount: string }[]
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

export const api = {
  me: () => request<{ userId: string, addresses: Partial<Record<ChainKey, string>> }>('GET', '/me'),
  nonce: (address: string) => request<{ nonce: string, message: string }>('POST', '/auth/nonce', { address }),
  verify: (nonce: string, signature: string) => request<{ ok: true }>('POST', '/auth/verify', { nonce, signature }),
  logout: () => request<{ ok: true }>('POST', '/auth/logout'),
  linkAddresses: (addresses: Partial<Record<'solana' | 'bitcoin' | 'spark', string>>) => request('PUT', '/me/addresses', addresses),
  balances: () => request<{ balances: ChainBalance[] }>('GET', '/balances'),
  history: (chain: ChainKey, token: string, limit = 25) =>
    request<{ transfers: Transfer[] }>('GET', `/history?chain=${chain}&token=${encodeURIComponent(token)}&limit=${limit}`)
}

/**
 * The wallet signs the sign-in message automatically after unlock, so it must
 * only ever sign our exact login format: never an arbitrary server-supplied text.
 */
export function assertSafeSignInMessage (message: string, address: string): void {
  const lines = message.split('\n')
  const expected: [number, RegExp][] = [
    [0, new RegExp(`^${escape(window.location.host)} wants you to sign in with your Ethereum account:$`)],
    [1, new RegExp(`^${address}$`, 'i')],
    [2, /^$/],
    [3, /^Sign in to Buchki Wallet\. This request does not send a transaction or cost any fees\.$/],
    [4, /^$/],
    [5, new RegExp(`^URI: ${escape(window.location.origin)}$`)],
    [6, /^Version: 1$/],
    [7, new RegExp(`^Chain ID: ${profile.evm.chainId}$`)],
    [8, /^Nonce: [0-9a-f]{32}$/],
    [9, /^Issued At: \S+$/],
    [10, /^Expiration Time: \S+$/]
  ]
  if (lines.length !== expected.length || !expected.every(([i, re]) => re.test(lines[i] ?? ''))) {
    throw new Error('Refusing to sign: unexpected sign-in message from server')
  }
}

function escape (text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
