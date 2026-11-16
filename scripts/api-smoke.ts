/**
 * End-to-end check of a running API, acting like the web app would:
 * creates a throwaway WDK wallet (seed stays in this process), signs in,
 * links addresses, then reads balances, history and the RPC proxy.
 *
 *   npm run dev -w @buchki/api      # in another terminal
 *   npm run smoke:api
 */
import { CHAINS, WDK, createWdk, parseNetwork, resolveNetwork } from '@buchki/wallet-core'

const API = process.env.API_URL || `http://127.0.0.1:${process.env.PORT || 4000}`
const ORIGIN = process.env.WEB_ORIGIN || 'http://localhost:5173'
const profile = resolveNetwork(parseNetwork(process.env.NETWORK))

let cookie = ''
async function call (method: string, path: string, body?: unknown) {
  const res = await fetch(API + path, {
    method,
    headers: { origin: ORIGIN, cookie, ...(body !== undefined && { 'content-type': 'application/json' }) },
    ...(body !== undefined && { body: JSON.stringify(body) })
  })
  const setCookie = res.headers.get('set-cookie')
  if (setCookie) cookie = setCookie.split(';')[0]!
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

function check (label: string, ok: boolean, detail: unknown = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`)
  if (!ok) process.exitCode = 1
}

const { wdk } = createWdk(WDK.getRandomSeedPhrase(), profile)
try {
  const addresses: Record<string, string> = {}
  for (const chain of CHAINS) addresses[chain] = await (await wdk.getAccount(chain, 0)).getAddress()
  const evm = await wdk.getAccount('ethereum', 0)

  const health = await call('GET', '/health')
  check('health', health.status === 200, health.body)

  const unauth = await call('GET', '/balances')
  check('balances without session -> 401', unauth.status === 401)

  const challenge = await call('POST', '/auth/nonce', { address: addresses.ethereum })
  check('nonce issued', challenge.status === 200)
  const signature = await evm.sign(challenge.body.message)
  const verify = await call('POST', '/auth/verify', { nonce: challenge.body.nonce, signature })
  check('sign-in with WDK signature', verify.status === 200 && cookie.startsWith('buchki_session='), verify.body)

  const linked = await call('PUT', '/me/addresses', { solana: addresses.solana, bitcoin: addresses.bitcoin, spark: addresses.spark })
  check('link solana/bitcoin/spark addresses', linked.status === 200 && Object.keys(linked.body.addresses).length === 4, linked.body)

  const started = Date.now()
  const balances = await call('GET', '/balances')
  check(`balances (${Date.now() - started} ms)`, balances.status === 200)
  for (const b of balances.body.balances ?? []) {
    const tokens = b.tokens.map((t: { symbol: string, amount: string }) => `${t.amount} ${t.symbol}`).join(', ')
    check(`  ${b.chain.padEnd(8)}`, !b.error, b.error ?? `${b.native?.amount} ${b.native?.symbol}${tokens ? ` + ${tokens}` : ''}`)
  }

  const history = await call('GET', '/history?chain=ethereum&token=usdt&limit=5')
  check('history (ethereum usdt)', history.status === 200 || history.status === 503, history.status === 200 ? `${history.body.transfers.length} transfers` : history.body)

  const rpc = await call('POST', '/rpc/ethereum', { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
  check('rpc proxy eth_chainId', rpc.status === 200 && parseInt(rpc.body.result, 16) === profile.evm.chainId, rpc.body)

  const solRpc = await call('POST', '/rpc/solana', { jsonrpc: '2.0', id: 1, method: 'getHealth' })
  check('rpc proxy solana getHealth', solRpc.status === 200, solRpc.body)

  const blocked = await call('POST', '/rpc/ethereum', { jsonrpc: '2.0', id: 1, method: 'debug_traceTransaction', params: [] })
  check('rpc proxy blocks debug_*', blocked.status === 403)

  const logout = await call('POST', '/auth/logout')
  const after = await call('GET', '/me')
  check('logout revokes session', logout.status === 200 && after.status === 401)
} finally {
  wdk.dispose()
}
process.exit(process.exitCode ?? 0)
