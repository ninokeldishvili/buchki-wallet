import { WalletAccountReadOnlyEvm } from '@tetherto/wdk-wallet-evm'
import { WalletAccountReadOnlySolana } from '@tetherto/wdk-wallet-solana'
import { WalletAccountReadOnlyBtc } from '@tetherto/wdk-wallet-btc'
import { WalletAccountReadOnlySpark } from '@tetherto/wdk-wallet-spark'
import { bitcoinClients, type ChainKey, type NetworkProfile } from './networks.ts'

/** Minimal read-only surface shared by every chain's read-only account. */
export interface ReadOnlyAccount {
  getAddress (): Promise<string>
  getBalance (): Promise<bigint>
  getTokenBalance? (tokenAddress: string): Promise<bigint>
}

/**
 * Creates a read-only account from a public address. Holds no keys, so it is
 * safe to use on the server (balances, fee quotes, token balances).
 */
export function createReadOnlyAccount (chain: ChainKey, address: string, profile: NetworkProfile): ReadOnlyAccount {
  switch (chain) {
    case 'ethereum':
      return new WalletAccountReadOnlyEvm(address, { provider: profile.evm.rpcUrl }) as unknown as ReadOnlyAccount
    case 'solana':
      return new WalletAccountReadOnlySolana(address, { provider: profile.solana.rpcUrl }) as unknown as ReadOnlyAccount
    case 'bitcoin':
      return new WalletAccountReadOnlyBtc(address, {
        network: profile.bitcoin.network,
        client: bitcoinClients(profile)
      } as any) as unknown as ReadOnlyAccount
    case 'spark':
      return new WalletAccountReadOnlySpark(address, { network: profile.spark.network }) as unknown as ReadOnlyAccount
    default:
      throw new Error(`Unsupported chain: ${chain satisfies never}`)
  }
}
