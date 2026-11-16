import WDK from '@tetherto/wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import WalletManagerSolana from '@tetherto/wdk-wallet-solana'
import WalletManagerSpark from '@tetherto/wdk-wallet-spark'
import WalletManagerBtc from '@tetherto/wdk-wallet-btc'
import ProtocolSwapVeloraEvm from '@tetherto/wdk-protocol-swap-velora-evm'
import ProtocolBridgeUsdt0Evm from '@tetherto/wdk-protocol-bridge-usdt0-evm'
import ProtocolLendingMorphoEvm from '@morpho-org/wdk-protocol-lending-morpho-evm'
import ProtocolLendingAaveEvm from '@tetherto/wdk-protocol-lending-aave-evm'
import { bitcoinClients, type NetworkProfile } from './networks.ts'

export interface CreateWdkResult {
  wdk: WDK
  /** Keys of every registered wallet, e.g. ['ethereum', 'solana', 'bitcoin', 'spark']. */
  wallets: string[]
}

/**
 * Creates a WDK instance with full (signing) accounts for the given network.
 * Runs in the browser: the seed must never be sent to the API.
 *
 * Fiat on/off-ramps are deliberately not registered here: their secret keys
 * live in the API, which returns ready-made widget URLs.
 */
export function createWdk (seedPhrase: string, profile: NetworkProfile): CreateWdkResult {
  const wdk = new WDK(seedPhrase)
  const wallets: string[] = []
  const evmWallets: string[] = []

  const register = (key: string, WalletManager: any, config: object, { evm = false } = {}) => {
    wdk.registerWallet(key, WalletManager, config)
    wallets.push(key)
    if (evm) evmWallets.push(key)
  }

  register('ethereum', WalletManagerEvm, { provider: profile.evm.rpcUrl }, { evm: true })
  register('solana', WalletManagerSolana, { provider: profile.solana.rpcUrl })
  register('bitcoin', WalletManagerBtc, {
    network: profile.bitcoin.network,
    bip: 84,
    client: bitcoinClients(profile)
  })
  register('spark', WalletManagerSpark, { network: profile.spark.network })

  // DeFi protocols are mainnet-only; the profile's feature flags decide.
  for (const key of evmWallets) {
    if (profile.features.swap) wdk.registerProtocol(key, 'velora', ProtocolSwapVeloraEvm as any)
    if (profile.features.bridge) wdk.registerProtocol(key, 'usdt0', ProtocolBridgeUsdt0Evm as any)
    if (profile.features.lending) {
      wdk.registerProtocol(key, 'aave', ProtocolLendingAaveEvm as any)
      wdk.registerProtocol(key, 'morpho', ProtocolLendingMorphoEvm as any, {
        presets: { earn: 'sky-money-usdt-savings', borrow: 'wsteth' }
      })
    }
  }

  return { wdk, wallets }
}
