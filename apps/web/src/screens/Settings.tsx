import { useEffect, useState, type FormEvent } from 'react'
import { WrongPasswordError } from '../vault/crypto.ts'
import { useWallet } from '../wallet/WalletProvider.tsx'
import { AUTO_LOCK_MS, profile } from '../config.ts'
import { Button, Card, Field, Notice, Screen, errorMessage } from '../ui.tsx'

const REVEAL_SECONDS = 60

export function Settings () {
  const { lock, revealSeed, reset } = useWallet()
  return (
    <Screen title='Settings'>
      <Card className='space-y-1 text-sm'>
        <div className='flex justify-between'><span className='text-muted'>Network</span><span>{profile.name}</span></div>
        <div className='flex justify-between'><span className='text-muted'>Auto-lock</span><span>after {AUTO_LOCK_MS / 60_000} min of inactivity</span></div>
      </Card>
      <Button variant='secondary' className='w-full' onClick={lock}>Lock wallet now</Button>
      <RevealPhrase reveal={revealSeed} />
      <RemoveWallet reset={reset} />
    </Screen>
  )
}

function RevealPhrase ({ reveal }: { reveal (password: string): Promise<string> }) {
  const [password, setPassword] = useState('')
  const [phrase, setPhrase] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Hide again automatically.
  useEffect(() => {
    if (!phrase) return
    const t = setTimeout(() => setPhrase(null), REVEAL_SECONDS * 1000)
    return () => clearTimeout(t)
  }, [phrase])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      setPhrase(await reveal(password))
      setPassword('')
    } catch (err) {
      setError(err instanceof WrongPasswordError ? 'Wrong password.' : errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className='space-y-3'>
      <h2 className='text-sm font-medium'>Recovery phrase</h2>
      {phrase
        ? (
          <>
            <Notice tone='warn'>Make sure nobody can see your screen. Hidden again in {REVEAL_SECONDS} seconds.</Notice>
            <ol className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
              {phrase.split(' ').map((w, i) => (
                <li key={i} className='flex gap-2 rounded-lg bg-surface-2 px-3 py-2 font-mono text-sm'><span className='w-5 text-right text-muted'>{i + 1}</span>{w}</li>
              ))}
            </ol>
            <Button variant='secondary' onClick={() => setPhrase(null)}>Hide</Button>
          </>
          )
        : (
          <form onSubmit={submit} className='space-y-3'>
            <Field label='Password' type='password' autoComplete='current-password' value={password} onChange={(e) => setPassword(e.target.value)} />
            {error && <Notice tone='danger'>{error}</Notice>}
            <Button type='submit' variant='secondary' busy={busy} disabled={!password}>Show recovery phrase</Button>
          </form>
          )}
    </Card>
  )
}

function RemoveWallet ({ reset }: { reset (): Promise<void> }) {
  const [typed, setTyped] = useState('')
  return (
    <Card className='space-y-3'>
      <h2 className='text-sm font-medium text-danger'>Remove wallet from this device</h2>
      <p className='text-sm text-muted'>
        Deletes the encrypted wallet from this browser. You can only restore it with your recovery phrase. Type <strong>REMOVE</strong> to confirm.
      </p>
      <Field label='Confirmation' value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete='off' />
      <Button variant='danger' disabled={typed !== 'REMOVE'} onClick={() => void reset()}>Remove wallet</Button>
    </Card>
  )
}
