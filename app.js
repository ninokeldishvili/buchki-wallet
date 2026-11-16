import WDK from '@tetherto/wdk'
import { createWdk } from './index.js'

try {
    process.loadEnvFile()
} catch {
    // No .env file: fall back to defaults
}

console.log('Starting WDK App...')

const seedPhrase = WDK.getRandomSeedPhrase()
console.log('Generated a new random seed phrase')

console.log('Registering wallets and protocols...')

const { wdk, wallets } = createWdk(seedPhrase)

console.log(`Wallets registered: ${wallets.join(', ')}`)

const accounts = {}
for (const chain of wallets) {
    accounts[chain] = await wdk.getAccount(chain, 0)
}

console.log('Resolving addresses:')

for (const [chain, account] of Object.entries(accounts)) {
    try {
        const address = await account.getAddress()
        console.log(`   ${chain.toUpperCase()}: ${address}`)
    } catch (err) {
        console.log(`   ${chain.toUpperCase()}: failed (${err.message})`)
    }
}

console.log('Checking balances...')

for (const [chain, account] of Object.entries(accounts)) {
    try {
        const balance = await account.getBalance()
        console.log(`   ${chain.toUpperCase()}: ${balance.toString()} units`)
    } catch (err) {
        console.log(`   ${chain.toUpperCase()}: failed (${err.message})`)
    }
}

console.log('Application completed successfully!')

// Close all wallet connections so the program can exit
wdk.dispose()
