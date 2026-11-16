import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api.ts'
import { AUTO_LOCK_MS } from '../config.ts'
import { decryptSeed, encryptSeed } from '../vault/crypto.ts'
import { deleteVault, loadVault, saveVault } from '../vault/storage.ts'
import { WalletSession } from './session.ts'

type Status = 'loading' | 'empty' | 'locked' | 'unlocked'

interface WalletContextValue {
  status: Status
  session: WalletSession | null
  /** Encrypts and stores a new or imported seed, then unlocks. */
  create (seedPhrase: string, password: string): Promise<void>
  unlock (password: string): Promise<void>
  lock (): void
  /** Re-checks the password and returns the seed for display. */
  revealSeed (password: string): Promise<string>
  /** Deletes the encrypted seed from this browser. Funds remain recoverable only with the recovery phrase. */
  reset (): Promise<void>
}

const WalletContext = createContext<WalletContextValue | null>(null)

export function WalletProvider ({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [session, setSession] = useState<WalletSession | null>(null)
  const sessionRef = useRef<WalletSession | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    loadVault().then((v) => setStatus(v ? 'locked' : 'empty'), () => setStatus('empty'))
  }, [])

  const activate = useCallback((next: WalletSession) => {
    sessionRef.current = next
    setSession(next)
    setStatus('unlocked')
  }, [])

  const lock = useCallback(() => {
    sessionRef.current?.lock()
    sessionRef.current = null
    setSession(null)
    queryClient.clear()
    api.logout().catch(() => {})
    setStatus((s) => (s === 'unlocked' ? 'locked' : s))
  }, [queryClient])

  const create = useCallback(async (seedPhrase: string, password: string) => {
    const vault = await encryptSeed(seedPhrase, password)
    const next = await WalletSession.open(seedPhrase) // fails before saving if the seed or API is unusable
    await saveVault(vault)
    activate(next)
  }, [activate])

  const unlock = useCallback(async (password: string) => {
    const vault = await loadVault()
    if (!vault) { setStatus('empty'); return }
    activate(await WalletSession.open(await decryptSeed(vault, password)))
  }, [activate])

  const revealSeed = useCallback(async (password: string) => {
    const vault = await loadVault()
    if (!vault) throw new Error('No wallet on this device')
    return decryptSeed(vault, password)
  }, [])

  const reset = useCallback(async () => {
    lock()
    await deleteVault()
    setStatus('empty')
  }, [lock])

  // Auto-lock after inactivity.
  useEffect(() => {
    if (status !== 'unlocked') return
    let timer = setTimeout(lock, AUTO_LOCK_MS)
    const bump = () => { clearTimeout(timer); timer = setTimeout(lock, AUTO_LOCK_MS) }
    const events = ['pointerdown', 'keydown', 'scroll', 'focus'] as const
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }))
    return () => {
      clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, bump))
    }
  }, [status, lock])

  // Wipe keys when the page goes away.
  useEffect(() => {
    const onHide = () => sessionRef.current?.lock()
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }, [])

  return (
    <WalletContext.Provider value={{ status, session, create, unlock, lock, revealSeed, reset }}>
      {children}
    </WalletContext.Provider>
  )
}

export function useWallet (): WalletContextValue {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used inside WalletProvider')
  return ctx
}

/** The unlocked session; only for screens rendered while unlocked. */
export function useSession (): WalletSession {
  const { session } = useWallet()
  if (!session) throw new Error('Wallet is locked')
  return session
}
