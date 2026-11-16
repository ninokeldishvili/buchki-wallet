import WDK from '@tetherto/wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import WalletManagerEvmErc4337 from '@tetherto/wdk-wallet-evm-erc-4337'
import WalletManagerEvm7702Gasless from '@tetherto/wdk-wallet-evm-7702-gasless'
import WalletManagerSolana from '@tetherto/wdk-wallet-solana'
import WalletManagerSolanaGasless from '@tetherto/wdk-wallet-solana-gasless'
import WalletManagerSpark from '@tetherto/wdk-wallet-spark'
import WalletManagerBtc from '@tetherto/wdk-wallet-btc'
import ProtocolSwapVeloraEvm from '@tetherto/wdk-protocol-swap-velora-evm'
import ProtocolBridgeUsdt0Evm from '@tetherto/wdk-protocol-bridge-usdt0-evm'
import ProtocolLendingMorphoEvm from '@morpho-org/wdk-protocol-lending-morpho-evm'
import ProtocolLendingAaveEvm from '@tetherto/wdk-protocol-lending-aave-evm'
import ProtocolFiatTransak from '@transak/wdk-protocol-fiat-transak'
import ProtocolFiatMoonpay from '@tetherto/wdk-protocol-fiat-moonpay'

const env = process.env

// Hinkal's package currently fails to import under Node ESM (a CommonJS named
// export from @coral-xyz/anchor), so load it lazily and skip it if it breaks.
let WalletManagerEvmHinkal = null
try {
  WalletManagerEvmHinkal = (await import('@hinkal/wdk-wallet-evm-hinkal')).default
} catch (err) {
  console.warn(`Hinkal wallet unavailable: ${err.message.split('\n')[0]}`)
}

const ETH_RPC = env.ETH_RPC_URL ?? 'https://eth.drpc.org'
const SOLANA_RPC = env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com'

/**
 * Creates a WDK instance with every wallet and protocol registered.
 *
 * WDK allows only one wallet per key, so each wallet type gets its own key
 * (e.g. 'ethereum', 'ethereum-erc4337'). Wallets that need third-party
 * services (bundlers, paymasters) are only registered when their env vars are
 * set, so the app still starts without them.
 *
 * @param {string} seedPhrase
 * @returns {{ wdk: WDK, wallets: string[] }} The WDK instance and the keys of the registered wallets.
 */
export function createWdk (seedPhrase) {
  const wdk = new WDK(seedPhrase)
  const wallets = []
  const evmWallets = []

  const register = (key, WalletManager, config, { evm = false } = {}) => {
    wdk.registerWallet(key, WalletManager, config)
    wallets.push(key)
    if (evm) evmWallets.push(key)
  }

  // Always-on wallets (public endpoints, no API keys needed)
  register('ethereum', WalletManagerEvm, { provider: ETH_RPC }, { evm: true })
  if (WalletManagerEvmHinkal) {
    register('ethereum-hinkal', WalletManagerEvmHinkal, { provider: ETH_RPC })
  }
  register('solana', WalletManagerSolana, { provider: SOLANA_RPC })
  register('spark', WalletManagerSpark, { network: 'MAINNET' })
  register('bitcoin', WalletManagerBtc, {
    network: 'bitcoin',
    bip: 84,
    // Blockbook over HTTPS first (Electrum ports are often firewalled), Electrum SSL as fallback
    client: [
      { type: 'blockbook-http', clientConfig: { url: env.BTC_BLOCKBOOK_URL ?? 'https://btc1.trezor.io/api' } },
      { type: 'electrum', clientConfig: { host: 'electrum.blockstream.info', port: 50002, protocol: 'ssl' } }
    ]
  })

  // Wallets that need a bundler / paymaster
  if (env.ERC4337_BUNDLER_URL) {
    register('ethereum-erc4337', WalletManagerEvmErc4337, {
      chainId: 1,
      provider: ETH_RPC,
      bundlerUrl: env.ERC4337_BUNDLER_URL,
      safeModulesVersion: '0.3.0',
      useNativeCoins: true
    }, { evm: true })
  }

  if (env.EIP7702_BUNDLER_URL && env.EIP7702_DELEGATION_ADDRESS) {
    register('ethereum-7702', WalletManagerEvm7702Gasless, {
      provider: ETH_RPC,
      bundlerUrl: env.EIP7702_BUNDLER_URL,
      delegationAddress: env.EIP7702_DELEGATION_ADDRESS,
      isSponsored: true,
      ...(env.EIP7702_SPONSORSHIP_POLICY_ID && { sponsorshipPolicyId: env.EIP7702_SPONSORSHIP_POLICY_ID })
    }, { evm: true })
  }

  if (env.SOLANA_PAYMASTER_URL && env.SOLANA_PAYMASTER_ADDRESS && env.SOLANA_PAYMASTER_TOKEN) {
    register('solana-gasless', WalletManagerSolanaGasless, {
      provider: SOLANA_RPC,
      paymasterUrl: env.SOLANA_PAYMASTER_URL,
      paymasterAddress: env.SOLANA_PAYMASTER_ADDRESS,
      paymasterToken: { address: env.SOLANA_PAYMASTER_TOKEN }
    })
  }

  // EVM DeFi protocols: available on every EVM wallet
  for (const key of evmWallets) {
    wdk
      .registerProtocol(key, 'velora', ProtocolSwapVeloraEvm)
      .registerProtocol(key, 'usdt0', ProtocolBridgeUsdt0Evm)
      .registerProtocol(key, 'aave', ProtocolLendingAaveEvm)
      .registerProtocol(key, 'morpho', ProtocolLendingMorphoEvm, {
        presets: { earn: 'sky-money-usdt-savings', borrow: 'wsteth' }
      })
  }

  // Fiat on/off-ramps: available on every wallet, once an API key is set
  for (const key of wallets) {
    if (env.MOONPAY_API_KEY) {
      wdk.registerProtocol(key, 'moonpay', ProtocolFiatMoonpay, {
        apiKey: env.MOONPAY_API_KEY,
        environment: env.MOONPAY_ENVIRONMENT ?? 'sandbox'
      })
    }
    if (env.TRANSAK_API_KEY) {
      wdk.registerProtocol(key, 'transak', ProtocolFiatTransak, {
        apiKey: env.TRANSAK_API_KEY,
        environment: env.TRANSAK_ENVIRONMENT ?? 'STAGING'
      })
    }
  }

  return { wdk, wallets }
}

export default createWdk
