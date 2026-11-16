import { parseNetwork, resolveNetwork } from '@buchki/wallet-core'

/**
 * The API is always reached same-origin under /api: Vite proxies it in
 * development, and in production the host rewrites /api/* to the API service.
 * That keeps the session cookie first-party and lets the WDK providers use it.
 */
export const API_BASE = '/api'

const apiUrl = (path: string) => new URL(`${API_BASE}${path}`, window.location.origin).toString()

/** Network profile with Ethereum and Solana RPC routed through the API's proxy (keys stay server-side). */
export const profile = resolveNetwork(parseNetwork(import.meta.env.VITE_NETWORK), {
  evmRpcUrl: apiUrl('/rpc/ethereum'),
  solanaRpcUrl: apiUrl('/rpc/solana')
})

/** Lock the wallet after this much inactivity. */
export const AUTO_LOCK_MS = 15 * 60 * 1000
