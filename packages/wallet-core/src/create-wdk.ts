import WDK from '@tetherto/wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import WalletManagerSolana from '@tetherto/wdk-wallet-solana'
import WalletManagerBtc from '@tetherto/wdk-wallet-btc'
import { bitcoinClients, type NetworkProfile, type Runtime } from './networks.ts'

export interface CreateWdkResult {
  wdk: WDK
  /** Keys of every registered wallet, e.g. ['ethereum', 'solana', 'bitcoin', 'spark']. */
  wallets: string[]
}

/** EVM wallet keys that DeFi protocols attach to. */
const EVM_WALLETS = ['ethereum']

/**
 * Creates a WDK instance with full (signing) accounts for the given network.
 * Runs in the browser: the seed must never be sent to the API.
 *
 * DeFi protocols are added separately with `registerProtocols()`. Fiat
 * on/off-ramps are not registered here: their secret keys live in the API.
 */
export async function createWdk (seedPhrase: string, profile: NetworkProfile, { runtime = 'node' }: { runtime?: Runtime } = {}): Promise<CreateWdkResult> {
  // Spark's SDK is ~7 MB of source; load it on demand so it gets its own chunk in browser builds.
  const { default: WalletManagerSpark } = await import('@tetherto/wdk-wallet-spark')

  const wdk = new WDK(seedPhrase)
  const wallets: string[] = []

  const register = (key: string, WalletManager: any, config: object) => {
    wdk.registerWallet(key, WalletManager, config)
    wallets.push(key)
  }

  register('ethereum', WalletManagerEvm, { provider: profile.evm.rpcUrl })
  register('solana', WalletManagerSolana, { provider: profile.solana.rpcUrl })
  register('bitcoin', WalletManagerBtc, {
    network: profile.bitcoin.network,
    bip: 84,
    client: bitcoinClients(profile, runtime)
  })
  register('spark', WalletManagerSpark, { network: profile.spark.network })

  return { wdk, wallets }
}

/**
 * Registers the DeFi protocols the profile enables (mainnet only). They are
 * loaded on demand: together they add several MB, which the testnet build
 * should never download.
 */
export async function registerProtocols (wdk: WDK, profile: NetworkProfile): Promise<string[]> {
  const { swap, bridge, lending } = profile.features
  const registered: string[] = []
  const [velora, usdt0, aave, morpho] = await Promise.all([
    swap ? import('@tetherto/wdk-protocol-swap-velora-evm') : null,
    bridge ? import('@tetherto/wdk-protocol-bridge-usdt0-evm') : null,
    lending ? import('@tetherto/wdk-protocol-lending-aave-evm') : null,
    lending ? import('@morpho-org/wdk-protocol-lending-morpho-evm') : null
  ])
  for (const key of EVM_WALLETS) {
    if (velora) { wdk.registerProtocol(key, 'velora', velora.default as any); registered.push('velora') }
    if (usdt0) { wdk.registerProtocol(key, 'usdt0', usdt0.default as any); registered.push('usdt0') }
    if (aave) { wdk.registerProtocol(key, 'aave', aave.default as any); registered.push('aave') }
    if (morpho) {
      wdk.registerProtocol(key, 'morpho', morpho.default as any, { presets: { earn: 'sky-money-usdt-savings', borrow: 'wsteth' } })
      registered.push('morpho')
    }
  }
  return [...new Set(registered)]
}
