import type { EncryptedVault } from './crypto.ts'

/** Persists the encrypted vault in IndexedDB. Only ciphertext is ever stored. */

const DB_NAME = 'buchki-wallet'
const STORE = 'vault'
const KEY = 'primary'

function open (): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T> (mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = fn(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(req.result as T)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export const loadVault = () => run<EncryptedVault | undefined>('readonly', (s) => s.get(KEY))
export const saveVault = (vault: EncryptedVault) => run<void>('readwrite', (s) => s.put(vault, KEY))
export const deleteVault = () => run<void>('readwrite', (s) => s.delete(KEY))
