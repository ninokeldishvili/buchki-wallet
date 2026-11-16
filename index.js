import WDK from '@tetherto/wdk'
import WalletManagerEvmHinkal from '@hinkal/wdk-wallet-evm-hinkal'
import WalletManagerSolanaGasless from '@tetherto/wdk-wallet-solana-gasless'
import WalletManagerEvm7702Gasless from '@tetherto/wdk-wallet-evm-7702-gasless'
import WalletManagerSpark from '@tetherto/wdk-wallet-spark'
import WalletManagerSolana from '@tetherto/wdk-wallet-solana'
import WalletManagerEvmErc4337 from '@tetherto/wdk-wallet-evm-erc-4337'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import WalletManagerBtc from '@tetherto/wdk-wallet-btc'
import ProtocolSwapVeloraEvm from '@tetherto/wdk-protocol-swap-velora-evm'
import ProtocolBridgeUsdt0Evm from '@tetherto/wdk-protocol-bridge-usdt0-evm'
import ProtocolLendingMorphoEvm from '@morpho-org/wdk-protocol-lending-morpho-evm'
import ProtocolLendingAaveEvm from '@tetherto/wdk-protocol-lending-aave-evm'
import ProtocolFiatTransak from '@transak/wdk-protocol-fiat-transak'
import ProtocolFiatMoonpay from '@tetherto/wdk-protocol-fiat-moonpay'

const seedPhrase = WDK.getRandomSeedPhrase()

const wdk = new WDK(seedPhrase)
    .registerWallet('ethereum', WalletManagerEvmHinkal)
    .registerWallet('solana', WalletManagerSolanaGasless, {
      provider: '/* TODO: set provider */',
      paymasterUrl: '/* TODO: set paymasterUrl */',
      paymasterAddress: '/* TODO: set paymasterAddress */',
      paymasterToken: {
        address: '/* TODO: set paymasterToken.address */',
      },
    })
    .registerWallet('ethereum', WalletManagerEvm7702Gasless, {
      provider: '/* TODO: set provider */',
      bundlerUrl: '/* TODO: set bundlerUrl */',
      delegationAddress: '/* TODO: set delegationAddress */',
      isSponsored: true,
    })
    .registerWallet('spark', WalletManagerSpark)
    .registerWallet('solana', WalletManagerSolana)
    .registerWallet('ethereum', WalletManagerEvmErc4337)
    .registerWallet('ethereum', WalletManagerEvm)
    .registerWallet('bitcoin', WalletManagerBtc)
    .registerProtocol('ethereum', 'velora', ProtocolSwapVeloraEvm)
    .registerProtocol('ethereum', 'usdt0', ProtocolBridgeUsdt0Evm)
    .registerProtocol('ethereum', 'morpho', ProtocolLendingMorphoEvm)
    .registerProtocol('ethereum', 'aave', ProtocolLendingAaveEvm)

const protocolFiatTransak = new ProtocolFiatTransak(undefined, {})

const protocolFiatMoonpay = new ProtocolFiatMoonpay(undefined, {})