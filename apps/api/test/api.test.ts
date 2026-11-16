import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import { NETWORKS, generateSeedPhrase } from '@buchki/wallet-core'
import type { FastifyInstance } from 'fastify'
import { RpcProxy } from '../src/services/rpc-proxy.ts'
import { BalanceService } from '../src/services/balances.ts'
import { createTestApp, resetTestDb, sessionCookie, WEB_ORIGIN } from './helpers.ts'

const json = { origin: WEB_ORIGIN, 'content-type': 'application/json' }

/** A real WDK EVM account, signing exactly the way the browser will. */
async function newWdkAccount () {
  const wallet = new WalletManagerEvm(generateSeedPhrase(), { provider: NETWORKS.testnet.evm.rpcUrl })
  const account = await wallet.getAccount(0)
  return { account, address: await account.getAddress(), dispose: () => wallet.dispose() }
}

async function signIn (app: FastifyInstance, account: { sign (m: string): Promise<string> }, address: string) {
  const nonceRes = await app.inject({ method: 'POST', url: '/auth/nonce', headers: json, payload: { address } })
  expect(nonceRes.statusCode).toBe(200)
  const { nonce, message } = nonceRes.json()
  const signature = await account.sign(message)
  return { nonce, message, signature, res: await app.inject({ method: 'POST', url: '/auth/verify', headers: json, payload: { nonce, signature } }) }
}

// Upstream RPC stub: records calls instead of hitting the network.
const rpcCalls: unknown[] = []
const fakeFetch = (async (_url: string, init: RequestInit) => {
  rpcCalls.push(JSON.parse(init.body as string))
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0xaa36a7' }), { status: 200 })
}) as typeof fetch

// Balance stub: no network in unit tests.
class FakeBalances extends BalanceService {
  override async getBalances (addresses: Record<string, string>) {
    return Object.entries(addresses).map(([chain, address]) => ({ chain, address, native: { symbol: 'X', decimals: 0, amount: '42' }, tokens: [] })) as any
  }
}

let app: FastifyInstance
let close: () => Promise<void>

beforeAll(async () => {
  await resetTestDb()
  ;({ app, close } = await createTestApp({
    rpc: new RpcProxy(NETWORKS.testnet, fakeFetch),
    balances: new FakeBalances(NETWORKS.testnet, undefined)
  }))
}, 60_000)

afterAll(async () => { await close?.() })

describe('auth', () => {
  it('signs in with a WDK EVM signature and returns the user', async () => {
    const { account, address, dispose } = await newWdkAccount()
    const { message, res } = await signIn(app, account, address)

    expect(message).toContain(address)
    expect(message).toContain('Chain ID: 11155111')
    expect(res.statusCode).toBe(200)

    const me = await app.inject({ method: 'GET', url: '/me', headers: { cookie: sessionCookie(res) } })
    expect(me.statusCode).toBe(200)
    expect(me.json().addresses.ethereum).toBe(address.toLowerCase())
    dispose()
  })

  it('rejects a replayed nonce', async () => {
    const { account, address, dispose } = await newWdkAccount()
    const { nonce, signature, res } = await signIn(app, account, address)
    expect(res.statusCode).toBe(200)

    const replay = await app.inject({ method: 'POST', url: '/auth/verify', headers: json, payload: { nonce, signature } })
    expect(replay.statusCode).toBe(401)
    dispose()
  })

  it('rejects a signature from a different account', async () => {
    const victim = await newWdkAccount()
    const attacker = await newWdkAccount()
    const nonceRes = await app.inject({ method: 'POST', url: '/auth/nonce', headers: json, payload: { address: victim.address } })
    const { nonce, message } = nonceRes.json()
    const signature = await attacker.account.sign(message)

    const res = await app.inject({ method: 'POST', url: '/auth/verify', headers: json, payload: { nonce, signature } })
    expect(res.statusCode).toBe(401)
    expect(res.cookies).toHaveLength(0)
    victim.dispose(); attacker.dispose()
  })

  it('rejects POSTs from other origins (CSRF)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/auth/nonce',
      headers: { ...json, origin: 'https://evil.example' },
      payload: { address: '0x0000000000000000000000000000000000000001' }
    })
    expect(res.statusCode).toBe(403)
  })

  it('logout revokes the session', async () => {
    const { account, address, dispose } = await newWdkAccount()
    const { res } = await signIn(app, account, address)
    const cookie = sessionCookie(res)

    const out = await app.inject({ method: 'POST', url: '/auth/logout', headers: { origin: WEB_ORIGIN, cookie } })
    expect(out.statusCode).toBe(200)
    const me = await app.inject({ method: 'GET', url: '/me', headers: { cookie } })
    expect(me.statusCode).toBe(401)
    dispose()
  })
})

describe('protected routes', () => {
  let cookie: string
  let address: string

  beforeAll(async () => {
    const w = await newWdkAccount()
    address = w.address
    cookie = sessionCookie((await signIn(app, w.account, w.address)).res)
    w.dispose()
  })

  it.each(['/me', '/balances', '/history?chain=ethereum&token=usdt'])('%s requires a session', async (url) => {
    const res = await app.inject({ method: 'GET', url })
    expect(res.statusCode).toBe(401)
  })

  it('links valid testnet addresses and rejects mainnet ones', async () => {
    const bad = await app.inject({
      method: 'PUT', url: '/me/addresses', headers: { ...json, cookie },
      payload: { bitcoin: 'bc1qxlnfvuqz6c40fj4ekdp2ckdd3u6yknrjkypd40' }
    })
    expect(bad.statusCode).toBe(400)

    const good = await app.inject({
      method: 'PUT', url: '/me/addresses', headers: { ...json, cookie },
      payload: {
        solana: 'GTPtRfeuVTr9PNHySwuBw5GYFtmo9soasLpF3Sfxxsn8',
        bitcoin: 'tb1qp9pze5uvm8vceyp94ycpq0j5deudh40pwt3h9v'
      }
    })
    expect(good.statusCode).toBe(200)
    expect(good.json().addresses).toMatchObject({ ethereum: address.toLowerCase(), bitcoin: 'tb1qp9pze5uvm8vceyp94ycpq0j5deudh40pwt3h9v' })
  })

  it('returns balances for every linked address', async () => {
    const res = await app.inject({ method: 'GET', url: '/balances', headers: { cookie } })
    expect(res.statusCode).toBe(200)
    expect(res.json().balances.map((b: { chain: string }) => b.chain).sort()).toEqual(['bitcoin', 'ethereum', 'solana'])
  })

  it('history returns 503 when the indexer is not configured', async () => {
    const res = await app.inject({ method: 'GET', url: '/history?chain=ethereum&token=usdt', headers: { cookie } })
    expect(res.statusCode).toBe(503)
  })

  it('RPC proxy forwards allowed methods', async () => {
    rpcCalls.length = 0
    const res = await app.inject({
      method: 'POST', url: '/rpc/ethereum', headers: { ...json, cookie },
      payload: { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().result).toBe('0xaa36a7')
    expect(rpcCalls).toHaveLength(1)
  })

  it('RPC proxy blocks methods outside the allowlist', async () => {
    rpcCalls.length = 0
    const res = await app.inject({
      method: 'POST', url: '/rpc/ethereum', headers: { ...json, cookie },
      payload: [{ jsonrpc: '2.0', id: 1, method: 'eth_chainId' }, { jsonrpc: '2.0', id: 2, method: 'debug_traceTransaction', params: [] }]
    })
    expect(res.statusCode).toBe(403)
    expect(rpcCalls).toHaveLength(0)
  })
})
