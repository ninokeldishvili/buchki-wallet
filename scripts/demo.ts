/**
 * Smoke test: creates a throwaway wallet on the selected network, prints its
 * addresses and balances, and checks the read-only (server-side) path agrees.
 *
 *   npm run demo                  # NETWORK from .env, default testnet
 *   NETWORK=mainnet npm run demo
 */
import { CHAINS, formatUnits, generateSeedPhrase, parseNetwork, resolveNetwork } from '@buchki/wallet-core'
import { createWdk } from '@buchki/wallet-core/wdk'
import { createReadOnlyAccount } from '@buchki/wallet-core/read-only'

const env = process.env
const profile = resolveNetwork(parseNetwork(env.NETWORK), {
  evmRpcUrl: env.ETH_RPC_URL,
  solanaRpcUrl: env.SOLANA_RPC_URL,
  btcBlockbookUrl: env.BTC_BLOCKBOOK_URL
})

console.log(`Network: ${profile.name}`)

// Throwaway seed, never printed.
const { wdk, wallets } = await createWdk(generateSeedPhrase(), profile)
console.log(`Wallets: ${wallets.join(', ')}\n`)

let failures = 0

try {
  for (const chain of CHAINS) {
    const { symbol, decimals } = profile.native[chain]
    try {
      const account = await wdk.getAccount(chain, 0)
      const address = await account.getAddress()
      const balance = await account.getBalance()

      const readOnly = createReadOnlyAccount(chain, address, profile)
      const readOnlyBalance = await readOnly.getBalance()
      const match = readOnlyBalance === balance ? 'read-only ok' : `READ-ONLY MISMATCH (${readOnlyBalance})`

      console.log(`${chain.padEnd(9)} ${address}`)
      console.log(`${''.padEnd(9)} ${formatUnits(balance, decimals)} ${symbol} · ${match}`)
    } catch (err) {
      failures++
      console.log(`${chain.padEnd(9)} FAILED: ${(err as Error).message}`)
    }
  }
} finally {
  wdk.dispose()
}

if (failures) {
  console.error(`\n${failures} chain(s) failed`)
  process.exit(1)
}
console.log('\nAll chains OK')
// Spark's SDK keeps background handles open; exit explicitly.
process.exit(0)
