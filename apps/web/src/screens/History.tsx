import { useQuery } from '@tanstack/react-query'
import { CHAINS, explorerAddressUrl, explorerTxUrl } from '@buchki/wallet-core'
import { api, ApiError } from '../api.ts'
import { profile } from '../config.ts'
import { useSession } from '../wallet/WalletProvider.tsx'
import { CHAIN_LABELS, Card, Notice, Screen, errorMessage, shorten } from '../ui.tsx'

export function History () {
  const session = useSession()
  const tracked = profile.indexerTokens

  return (
    <Screen title='History'>
      {tracked.map((t) => <TokenHistory key={`${t.chain}-${t.token}`} chain={t.chain} token={t.token} symbol={t.symbol} />)}

      <Card className='space-y-2'>
        <h2 className='text-sm font-medium'>Native coin activity</h2>
        <p className='text-sm text-muted'>Native transfers aren't indexed yet. View them in a block explorer:</p>
        <ul className='grid gap-1 sm:grid-cols-2'>
          {CHAINS.map((chain) => (
            <li key={chain}>
              <a className='text-sm text-accent hover:underline' href={explorerAddressUrl(profile, chain, session.addresses[chain])} target='_blank' rel='noreferrer noopener'>
                {CHAIN_LABELS[chain]} ↗
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </Screen>
  )
}

function TokenHistory ({ chain, token, symbol }: { chain: typeof CHAINS[number], token: string, symbol: string }) {
  const { data, error, isLoading } = useQuery({ queryKey: ['history', chain, token], queryFn: () => api.history(chain, token) })

  return (
    <Card className='space-y-3'>
      <h2 className='text-sm font-medium'>{symbol} on {CHAIN_LABELS[chain]}</h2>
      {isLoading && <div className='h-10 animate-pulse rounded bg-surface-2' />}
      {error && <Notice tone={error instanceof ApiError && error.status === 503 ? 'info' : 'danger'}>{errorMessage(error)}</Notice>}
      {data && data.transfers.length === 0 && <p className='text-sm text-muted'>No transfers yet.</p>}
      {data && data.transfers.length > 0 && (
        <ul className='divide-y divide-line'>
          {data.transfers.map((t) => (
            <li key={`${t.txHash}-${t.direction}`} className='flex items-center justify-between gap-3 py-2 text-sm'>
              <div className='min-w-0'>
                <div className='font-medium'>{t.direction === 'in' ? 'Received' : t.direction === 'out' ? 'Sent' : 'Self-transfer'}</div>
                <a className='block truncate font-mono text-xs text-muted hover:text-accent' href={explorerTxUrl(profile, chain, t.txHash)} target='_blank' rel='noreferrer noopener'>
                  {new Date(t.timestamp).toLocaleString()} · {shorten(t.txHash)}
                </a>
              </div>
              <div className={`shrink-0 tabular-nums ${t.direction === 'in' ? 'text-ok' : ''}`}>
                {t.direction === 'in' ? '+' : t.direction === 'out' ? '−' : ''}{t.amount} {symbol}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
