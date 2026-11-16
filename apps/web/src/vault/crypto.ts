/**
 * Seed encryption with the browser's WebCrypto API.
 * PBKDF2-SHA256 (600k iterations, OWASP 2023 guidance) derives an AES-256-GCM
 * key from the user's password. AES-GCM is authenticated, so a wrong password
 * or tampered data fails to decrypt instead of returning garbage.
 */

export interface EncryptedVault {
  version: 1
  kdf: 'PBKDF2-SHA256'
  iterations: number
  salt: string // base64
  iv: string // base64
  ciphertext: string // base64
  createdAt: string
}

const ITERATIONS = 600_000
export const MIN_PASSWORD_LENGTH = 10

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const unb64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))

async function deriveKey (password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable
    ['encrypt', 'decrypt']
  )
}

export async function encryptSeed (seedPhrase: string, password: string): Promise<EncryptedVault> {
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt, ITERATIONS)
  const plaintext = new TextEncoder().encode(seedPhrase)
  try {
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext))
    return {
      version: 1,
      kdf: 'PBKDF2-SHA256',
      iterations: ITERATIONS,
      salt: b64(salt),
      iv: b64(iv),
      ciphertext: b64(ciphertext),
      createdAt: new Date().toISOString()
    }
  } finally {
    plaintext.fill(0)
  }
}

export class WrongPasswordError extends Error {
  constructor () { super('Wrong password') }
}

export async function decryptSeed (vault: EncryptedVault, password: string): Promise<string> {
  const key = await deriveKey(password, unb64(vault.salt), vault.iterations)
  let plaintext: Uint8Array
  try {
    plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(vault.iv) as BufferSource }, key, unb64(vault.ciphertext) as BufferSource))
  } catch {
    throw new WrongPasswordError()
  }
  try {
    return new TextDecoder().decode(plaintext)
  } finally {
    plaintext.fill(0)
  }
}
