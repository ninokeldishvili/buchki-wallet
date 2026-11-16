import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CHAINS, explorerTxUrl, formatUnits, isValidAddress, parseUnits, type ChainKey } from '@buchki/wallet-core'
import { profile } from '../config.ts'
import { useSession } from '../wallet/WalletProvider.tsx'
import { Button, CHAIN_LABELS, Card, Field, Notice, Screen, errorMessage, shorten } from '../ui.tsx'
import { nativeBalance, useBalances } from './Dashboard.tsx'

const ZERO_EVM = /^0x0{40}$/i
const BURN_EVM = /^0x0{36}dead$/i

export function ChainPicker ({ value, onChange, chains, disabled }: { value: ChainKey, onChange (c: ChainKey): void, chains: readonly ChainKey[], disabled?: boolean }) {
  return (
    <div className='grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 sm:grid-cols-4' role='tablist'>
      {chains.map((c) => (
        <button key={c} type='button' role='tab' aria-selected={value === c} disabled={disabled} onClick={() => onChange(c)}
          className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${value === c ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg'}`}>
          {CHAIN_LABELS[c]}
        </button>
      ))}
    </div>
  )
}

interface Draft { chain: ChainKey, to: string, value: bigint }
interface Quote extends Draft { fee: bigint, warnings: string[] }
type Stage = { kind: 'edit' } | { kind: 'review', quote: Quote } | { kind: 'sent', quote: Quote, hash: string }

export function Send ({ initialChain = 'ethereum' }: { initialChain?: ChainKey }) {
  const session = useSession()
  const queryClient = useQueryClient()
  const { data } = useBalances()
  const [chain, setChain] = useState<ChainKey>(initialChain)
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [stage, setStage] = useState<Stage>({ kind: 'edit' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { symbol, decimals } = profile.native[chain]
  const balance = nativeBalance(data?.balances, chain)

  const validate = (): Draft => {
    const recipient = to.trim()
    if (!isValidAddress(chain, recipient, profile.name)) throw new Error(`That isn't a valid ${profile.networkNames[chain]} address.`)
    if (chain === 'ethereum' && (ZERO_EVM.test(recipient) || BURN_EVM.test(recipient))) throw new Error('That is a burn address; funds sent there are destroyed.')
    let value: bigint
    try { value = parseUnits(amount, decimals) } catch (err) { throw new Error(errorMessage(err)) }
    if (value <= 0n) throw new Error('Enter an amount greater than zero.')
    if (balance !== null && value > balance) throw new Error(`Insufficient balance (${formatUnits(balance, decimals)} ${symbol}).`)
    return { chain, to: recipient, value }
  }

  // Step 1: validate and get a fee quote. Nothing is signed yet.
  const review = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const draft = validate()
      const account = await session.account(draft.chain)
      const { fee } = await account.quoteSendTransaction({ to: draft.to, value: draft.value })
      const warnings: string[] = []
      if (balance !== null && balance > 0n && (draft.value + fee) * 2n > balance) warnings.push('This sends more than half of your balance.')
      if (balance !== null && draft.value + fee > balance) warnings.push('Amount plus network fee is more than your balance; the transaction will likely fail.')
      if (draft.to.toLowerCase() === session.addresses[draft.chain].toLowerCase()) warnings.push('You are sending to your own address.')
      setStage({ kind: 'review', quote: { ...draft, fee: BigInt(fee), warnings } })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  // Step 2: only after explicit confirmation, sign and broadcast.
  const confirm = async (quote: Quote) => {
    setError(null)
    setBusy(true)
    try {
      const account = await session.account(quote.chain)
      const { hash } = await account.sendTransaction({ to: quote.to, value: quote.value })
      setStage({ kind: 'sent', quote, hash })
      void queryClient.invalidateQueries({ queryKey: ['balances'] })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const reset = () => { setStage({ kind: 'edit' }); setTo(''); setAmount(''); setError(null) }

  if (stage.kind === 'sent') {
    const { quote, hash } = stage
    return (
      <Screen title='Transaction sent'>
        <Notice tone='ok'>
          Sent {formatUnits(quote.value, decimals)} {symbol} to {shorten(quote.to)}. It may take a few minutes to confirm.
        </Notice>
        <Card className='space-y-2 text-sm'>
          <div className='text-muted'>Transaction</div>
          <a className='block break-all font-mono text-accent hover:underline' href={explorerTxUrl(profile, quote.chain, hash)} target='_blank' rel='noreferrer noopener'>{hash}</a>
        </Card>
        <Button className='w-full' onClick={reset}>Done</Button>
      </Screen>
    )
  }

  if (stage.kind === 'review') {
    const { quote } = stage
    return (
      <Screen title='Review transaction' subtitle='Check every detail. Transactions cannot be reversed.'>
        <Card className='space-y-3 text-sm'>
          <Row label='Network'>{profile.networkNames[quote.chain]}</Row>
          <Row label='To'><span className='break-all font-mono'>{quote.to}</span></Row>
          <Row label='Amount'>{formatUnits(quote.value, decimals)} {symbol}</Row>
          <Row label='Network fee'>{formatUnits(quote.fee, decimals)} {symbol}</Row>
          <div className='border-t border-line pt-3'>
            <Row label='Total'><strong>{formatUnits(quote.value + quote.fee, decimals)} {symbol}</strong></Row>
          </div>
        </Card>
        {quote.warnings.map((w) => <Notice key={w} tone='warn'>{w}</Notice>)}
        {error && <Notice tone='danger'>{error}</Notice>}
        <div className='flex gap-2'>
          <Button variant='ghost' onClick={() => { setStage({ kind: 'edit' }); setError(null) }} disabled={busy}>Edit</Button>
          <Button className='flex-1' busy={busy} onClick={() => void confirm(quote)}>Confirm and send</Button>
        </div>
      </Screen>
    )
  }

  return (
    <Screen title='Send'>
      <form onSubmit={review} className='space-y-4'>
        <ChainPicker value={chain} onChange={(c) => { setChain(c); setError(null) }} chains={CHAINS} />
        <Card className='space-y-3'>
          <Field label='Recipient address' autoComplete='off' spellCheck={false} value={to}
            onChange={(e) => { setTo(e.target.value); setError(null) }} placeholder={`${profile.networkNames[chain]} address`} />
          <Field label={`Amount (${symbol})`} inputMode='decimal' autoComplete='off' value={amount}
            onChange={(e) => { setAmount(e.target.value.replace(',', '.')); setError(null) }} placeholder='0.0'
            hint={balance !== null ? `Available: ${formatUnits(balance, decimals)} ${symbol}` : undefined} />
        </Card>
        {error && <Notice tone='danger'>{error}</Notice>}
        <Button type='submit' className='w-full' busy={busy} disabled={!to || !amount}>Review</Button>
      </form>
    </Screen>
  )
}

function Row ({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div className='flex justify-between gap-4'>
      <span className='shrink-0 text-muted'>{label}</span>
      <span className='text-right'>{children}</span>
    </div>
  )
}
