import { useState, type FormEvent } from 'react'
import { WrongPasswordError } from '../vault/crypto.ts'
import { useWallet } from '../wallet/WalletProvider.tsx'
import { Button, Card, Field, Notice, Screen, errorMessage } from '../ui.tsx'

export function Unlock () {
  const { unlock, reset } = useWallet()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await unlock(password)
    } catch (err) {
      setError(err instanceof WrongPasswordError ? 'Wrong password.' : errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Screen title='Unlock your wallet' subtitle='Enter the password you set on this device.'>
      <form onSubmit={submit} className='space-y-4'>
        <Card>
          <Field label='Password' type='password' autoComplete='current-password' autoFocus
            value={password} onChange={(e) => { setPassword(e.target.value); setError(null) }} />
        </Card>
        {error && <Notice tone='danger'>{error}</Notice>}
        <Button type='submit' className='w-full' busy={busy} disabled={!password}>Unlock</Button>
      </form>

      <div className='pt-4 text-center'>
        {!confirmReset
          ? <Button variant='ghost' onClick={() => setConfirmReset(true)}>Forgot password?</Button>
          : (
            <Card className='space-y-3 text-left'>
              <p className='text-sm'>
                The password can't be recovered. You can remove this wallet from the device and import it again
                with your recovery phrase. <strong>Without the phrase, the funds are lost.</strong>
              </p>
              <div className='flex gap-2'>
                <Button variant='ghost' onClick={() => setConfirmReset(false)}>Cancel</Button>
                <Button variant='danger' className='flex-1' onClick={() => void reset()}>Remove wallet from this device</Button>
              </div>
            </Card>
            )}
      </div>
    </Screen>
  )
}
