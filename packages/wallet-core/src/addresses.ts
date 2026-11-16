import type { ChainKey, NetworkName } from './networks.ts'

const BASE58 = '[1-9A-HJ-NP-Za-km-z]'

/**
 * Format checks per chain and network. These catch typos and wrong-network
 * addresses; they are not a substitute for the checksum validation the
 * wallet modules do when sending.
 */
const PATTERNS: Record<NetworkName, Record<ChainKey, RegExp>> = {
  mainnet: {
    ethereum: /^0x[0-9a-fA-F]{40}$/,
    solana: new RegExp(`^${BASE58}{32,44}$`),
    bitcoin: /^(bc1[02-9ac-hj-np-z]{11,71}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/,
    spark: /^spark1[02-9ac-hj-np-z]{20,}$/
  },
  testnet: {
    ethereum: /^0x[0-9a-fA-F]{40}$/,
    solana: new RegExp(`^${BASE58}{32,44}$`),
    bitcoin: /^(tb1[02-9ac-hj-np-z]{11,71}|[mn2][1-9A-HJ-NP-Za-km-z]{25,34})$/,
    spark: /^sparkrt1[02-9ac-hj-np-z]{20,}$/
  }
}

export function isValidAddress (chain: ChainKey, address: string, network: NetworkName): boolean {
  return PATTERNS[network][chain].test(address)
}
