export type NetworkName = 'testnet' | 'mainnet'

/** The chains in the beta. Keys match the names wallets are registered under in WDK. */
export type ChainKey = 'ethereum' | 'solana' | 'bitcoin' | 'spark'

export const CHAINS: readonly ChainKey[] = ['ethereum', 'solana', 'bitcoin', 'spark']

export interface NativeAsset {
  symbol: string
  decimals: number
}

export interface NetworkProfile {
  name: NetworkName
  evm: { chainId: number, rpcUrl: string }
  solana: { rpcUrl: string }
  bitcoin: {
    network: 'bitcoin' | 'testnet'
    blockbookUrl: string
    electrum: { host: string, port: number, protocol: 'ssl' | 'tls' | 'tcp' }
  }
  spark: { network: 'MAINNET' | 'REGTEST' }
  native: Record<ChainKey, NativeAsset>
  /** DeFi protocols are mainnet-only (Velora, USD₮0, Aave, Morpho), so they're off on testnet. */
  features: { swap: boolean, bridge: boolean, lending: boolean }
  /** Name of the env var holding the WDK Indexer API key for this network. */
  indexerApiKeyEnv: 'TEST_WDK_API_KEY' | 'LIVE_WDK_API_KEY'
  /** Tokens tracked through the WDK Indexer API (balances + history). */
  indexerTokens: IndexerToken[]
}

export interface IndexerToken {
  /** Our chain the token lives on. */
  chain: ChainKey
  /** The indexer's blockchain id (e.g. 'sepolia' for Ethereum testnet). */
  indexerChain: string
  /** The indexer's token id. */
  token: string
  symbol: string
}

export const NETWORKS: Record<NetworkName, NetworkProfile> = {
  testnet: {
    name: 'testnet',
    evm: { chainId: 11155111, rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com' },
    solana: { rpcUrl: 'https://api.devnet.solana.com' },
    bitcoin: {
      network: 'testnet',
      blockbookUrl: 'https://tbtc1.trezor.io/api',
      electrum: { host: 'electrum.blockstream.info', port: 60002, protocol: 'ssl' }
    },
    spark: { network: 'REGTEST' },
    native: {
      ethereum: { symbol: 'SepoliaETH', decimals: 18 },
      solana: { symbol: 'SOL (devnet)', decimals: 9 },
      bitcoin: { symbol: 'tBTC', decimals: 8 },
      spark: { symbol: 'sats (regtest)', decimals: 0 }
    },
    features: { swap: false, bridge: false, lending: false },
    indexerApiKeyEnv: 'TEST_WDK_API_KEY',
    indexerTokens: [
      { chain: 'ethereum', indexerChain: 'sepolia', token: 'usdt', symbol: 'USD₮' }
    ]
  },
  mainnet: {
    name: 'mainnet',
    evm: { chainId: 1, rpcUrl: 'https://eth.drpc.org' },
    solana: { rpcUrl: 'https://api.mainnet-beta.solana.com' },
    bitcoin: {
      network: 'bitcoin',
      blockbookUrl: 'https://btc1.trezor.io/api',
      electrum: { host: 'electrum.blockstream.info', port: 50002, protocol: 'ssl' }
    },
    spark: { network: 'MAINNET' },
    native: {
      ethereum: { symbol: 'ETH', decimals: 18 },
      solana: { symbol: 'SOL', decimals: 9 },
      bitcoin: { symbol: 'BTC', decimals: 8 },
      spark: { symbol: 'sats', decimals: 0 }
    },
    features: { swap: true, bridge: true, lending: true },
    indexerApiKeyEnv: 'LIVE_WDK_API_KEY',
    indexerTokens: [
      { chain: 'ethereum', indexerChain: 'ethereum', token: 'usdt', symbol: 'USD₮' },
      { chain: 'ethereum', indexerChain: 'ethereum', token: 'xaut', symbol: 'XAU₮' }
    ]
  }
}

/** Optional endpoint overrides (e.g. a private RPC with an API key). Blank strings are ignored. */
export interface EndpointOverrides {
  evmRpcUrl?: string | undefined
  solanaRpcUrl?: string | undefined
  btcBlockbookUrl?: string | undefined
}

export function parseNetwork (value: string | undefined): NetworkName {
  if (!value) return 'testnet'
  if (value === 'testnet' || value === 'mainnet') return value
  throw new Error(`Invalid NETWORK "${value}". Use "testnet" or "mainnet".`)
}

/** Returns the profile with any non-blank overrides applied. */
export function resolveNetwork (name: NetworkName, overrides: EndpointOverrides = {}): NetworkProfile {
  const base = NETWORKS[name]
  return {
    ...base,
    evm: { ...base.evm, rpcUrl: overrides.evmRpcUrl || base.evm.rpcUrl },
    solana: { rpcUrl: overrides.solanaRpcUrl || base.solana.rpcUrl },
    bitcoin: { ...base.bitcoin, blockbookUrl: overrides.btcBlockbookUrl || base.bitcoin.blockbookUrl }
  }
}

/** Bitcoin client list: Blockbook over HTTPS first (Electrum ports are often firewalled), Electrum SSL as fallback. */
export function bitcoinClients (profile: NetworkProfile) {
  return [
    { type: 'blockbook-http' as const, clientConfig: { url: profile.bitcoin.blockbookUrl } },
    { type: 'electrum' as const, clientConfig: profile.bitcoin.electrum }
  ]
}
