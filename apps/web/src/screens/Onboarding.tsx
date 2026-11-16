import { useMemo, useState, type FormEvent } from 'react'
import { generateSeedPhrase, isValidSeedPhrase } from '@buchki/wallet-core'
import { MIN_PASSWORD_LENGTH } from '../vault/crypto.ts'
import { useWallet } from '../wallet/WalletProvider.tsx'
import { Button, Card, Field, Notice, Screen, errorMessage } from '../ui.tsx'
import { profile } from '../config.ts'

type Step = 'welcome' | 'create-show' | 'create-verify' | 'import' | 'password'

export function Onboarding () {
  const [step, setStep] = useState<Step>('welcome')
  const [seed, setSeed] = useState<string | null>(null)
  const [source, setSource] = useState<'create' | 'import'>('create')

  if (step === 'welcome') {
    return (
      <Screen title='Welcome to Buchki Wallet' subtitle={`A self-custody wallet for Ethereum, Solana, Bitcoin and Spark (${profile.name}).`}>
        <Card className='space-y-3'>
          <p className='text-sm text-muted'>
            Your recovery phrase is created and encrypted on this device. It never leaves your browser, and nobody,
            including us, can recover it for you.
          </p>
          <div className='grid gap-2 sm:grid-cols-2'>
            <Button onClick={() => { setSeed(generateSeedPhrase()); setSource('create'); setStep('create-show') }}>Create a new wallet</Button>
            <Button variant='secondary' onClick={() => { setSource('import'); setStep('import') }}>Import a recovery phrase</Button>
          </div>
        </Card>
      </Screen>
    )
  }

  if (step === 'create-show' && seed) return <ShowPhrase seed={seed} onNext={() => setStep('create-verify')} onBack={() => setStep('welcome')} />
  if (step === 'create-verify' && seed) return <VerifyPhrase seed={seed} onNext={() => setStep('password')} onBack={() => setStep('create-show')} />
  if (step === 'import') return <ImportPhrase onNext={(s) => { setSeed(s); setStep('password') }} onBack={() => setStep('welcome')} />
  if (step === 'password' && seed) return <SetPassword seed={seed} source={source} onBack={() => setStep(source === 'create' ? 'create-verify' : 'import')} />
  return null
}

function ShowPhrase ({ seed, onNext, onBack }: { seed: string, onNext (): void, onBack (): void }) {
  const [revealed, setRevealed] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const words = seed.split(' ')

  return (
    <Screen title='Your recovery phrase' subtitle='Write these 12 words down, in order, on paper. They are the only way to restore this wallet.'>
      <Notice tone='warn'>
        Anyone with these words controls your funds. Never type them into a website, share them, or store them in a screenshot or cloud note.
      </Notice>
      <Card>
        <ol className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${revealed ? '' : 'select-none blur-md'}`} aria-hidden={!revealed}>
          {words.map((word, i) => (
            <li key={i} className='flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 font-mono text-sm'>
              <span className='w-5 text-right text-muted'>{i + 1}</span>{word}
            </li>
          ))}
        </ol>
        {!revealed && <Button variant='secondary' className='mt-4 w-full' onClick={() => setRevealed(true)}>Reveal phrase (make sure nobody is watching)</Button>}
      </Card>
      <label className='flex items-start gap-2 text-sm'>
        <input type='checkbox' className='mt-0.5' checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={!revealed} />
        I have written down my recovery phrase and stored it somewhere safe.
      </label>
      <div className='flex gap-2'>
        <Button variant='ghost' onClick={onBack}>Back</Button>
        <Button className='flex-1' disabled={!confirmed} onClick={onNext}>Continue</Button>
      </div>
    </Screen>
  )
}

function VerifyPhrase ({ seed, onNext, onBack }: { seed: string, onNext (): void, onBack (): void }) {
  const words = seed.split(' ')
  const positions = useMemo(() => {
    const picks = new Set<number>()
    const rnd = new Uint32Array(1)
    while (picks.size < 3) { crypto.getRandomValues(rnd); picks.add(rnd[0]! % words.length) }
    return [...picks].sort((a, b) => a - b)
  }, [words.length])
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [error, setError] = useState<string | null>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const ok = positions.every((p) => answers[p]?.trim().toLowerCase() === words[p])
    if (ok) onNext()
    else setError('Those words don\'t match. Check your written copy.')
  }

  return (
    <Screen title='Confirm your phrase' subtitle='Enter the requested words to confirm you wrote the phrase down correctly.'>
      <form onSubmit={submit} className='space-y-4'>
        <Card className='space-y-3'>
          {positions.map((p) => (
            <Field key={p} label={`Word #${p + 1}`} autoComplete='off' autoCapitalize='none' spellCheck={false}
              value={answers[p] ?? ''} onChange={(e) => { setAnswers({ ...answers, [p]: e.target.value }); setError(null) }} />
          ))}
        </Card>
        {error && <Notice tone='danger'>{error}</Notice>}
        <div className='flex gap-2'>
          <Button type='button' variant='ghost' onClick={onBack}>Back</Button>
          <Button type='submit' className='flex-1'>Confirm</Button>
        </div>
      </form>
    </Screen>
  )
}

function ImportPhrase ({ onNext, onBack }: { onNext (seed: string): void, onBack (): void }) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const normalized = text.trim().toLowerCase().split(/\s+/).join(' ')
    if (!isValidSeedPhrase(normalized)) { setError('That isn\'t a valid 12 or 24-word recovery phrase.'); return }
    onNext(normalized)
  }

  return (
    <Screen title='Import a wallet' subtitle='Enter your 12 or 24-word recovery phrase, separated by spaces.'>
      <form onSubmit={submit} className='space-y-4'>
        <Card>
          <textarea
            className='h-32 w-full resize-none rounded-xl border border-line bg-surface-2 p-3 font-mono text-sm outline-none focus:border-accent'
            autoComplete='off' autoCapitalize='none' spellCheck={false} aria-label='Recovery phrase'
            value={text} onChange={(e) => { setText(e.target.value); setError(null) }}
          />
        </Card>
        {error && <Notice tone='danger'>{error}</Notice>}
        <div className='flex gap-2'>
          <Button type='button' variant='ghost' onClick={onBack}>Back</Button>
          <Button type='submit' className='flex-1' disabled={!text.trim()}>Continue</Button>
        </div>
      </form>
    </Screen>
  )
}

function SetPassword ({ seed, source, onBack }: { seed: string, source: 'create' | 'import', onBack (): void }) {
  const { create } = useWallet()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH
  const mismatch = confirm.length > 0 && confirm !== password

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await create(seed, password)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Screen title='Set a password' subtitle='This password unlocks the wallet on this device. It does not replace your recovery phrase.'>
      <form onSubmit={submit} className='space-y-4'>
        <Card className='space-y-3'>
          <Field label='Password' type='password' autoComplete='new-password' value={password}
            onChange={(e) => setPassword(e.target.value)} hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
            error={tooShort ? `Use at least ${MIN_PASSWORD_LENGTH} characters` : null} />
          <Field label='Confirm password' type='password' autoComplete='new-password' value={confirm}
            onChange={(e) => setConfirm(e.target.value)} error={mismatch ? 'Passwords don\'t match' : null} />
        </Card>
        {error && <Notice tone='danger'>{error}</Notice>}
        <div className='flex gap-2'>
          <Button type='button' variant='ghost' onClick={onBack} disabled={busy}>Back</Button>
          <Button type='submit' className='flex-1' busy={busy}
            disabled={password.length < MIN_PASSWORD_LENGTH || password !== confirm}>
            {source === 'create' ? 'Create wallet' : 'Import wallet'}
          </Button>
        </div>
      </form>
    </Screen>
  )
}
