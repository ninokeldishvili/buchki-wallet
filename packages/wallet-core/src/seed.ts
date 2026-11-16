import { generateMnemonic, validateMnemonic } from 'bip39'

/**
 * BIP-39 helpers, identical to WDK's `WDK.getRandomSeedPhrase` / `WDK.isValidSeed`
 * (same bip39 library), but without loading the wallet modules.
 */
export function generateSeedPhrase (wordCount: 12 | 24 = 12): string {
  return generateMnemonic(wordCount === 12 ? 128 : 256)
}

export function isValidSeedPhrase (seedPhrase: string): boolean {
  return validateMnemonic(seedPhrase)
}
