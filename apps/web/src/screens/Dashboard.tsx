import { useQuery } from '@tanstack/react-query'
import { CHAINS, explorerAddressUrl, formatUnits, type ChainKey } from '@buchki/wallet-core'
import { api, type ChainBalance } from '../api.ts'
import { profile } from '../config.ts'
import { useSession } from '../wallet/WalletProvider.tsx'
import { Button, CHAIN_LABELS, Card, Notice, Screen, errorMessage, shorten } from '../ui.tsx'

/**
 * Balances from the API, except Spark: its read-only lookup by address (and
 * Sparkscan) can report 0 for funds the wallet does own, so the Spark balance
 * comes from the unlocked wallet itself.
 */
export function useBalances () {
  const session = useSession()
  const server = useQuery({ queryKey: ['balances'], queryFn: api.balances, refetchInterval: 30_000 })
  const spark = useQuery({
    queryKey: ['balances', 'spark-local'],
    queryFn: async () => (await (await session.account('spark')).getBalance()).toString(),
    refetchInterval: 30_000
  })

  const data = server.data && {
    balances: server.data.balances.map((b): ChainBalance =>
      b.chain === 'spark' && spark.data !== undefined
        ? { ...b, native: { symbol: profile.native.spark.symbol, decimals: profile.native.spark.decimals, amount: spark.data }, error: undefined }
        : b)
  }
  return {
    data,
    error: server.error,
    isFetching: server.isFetching || spark.isFetching,
    refetch: () => Promise.all([server.refetch(), spark.refetch()])
  }
}

export function nativeBalance (balances: ChainBalance[] | undefined, chain: ChainKey): bigint | null {
  const b = balances?.find((x) => x.chain === chain)
  return b?.native ? BigInt(b.native.amount) : null
}

export function Dashboard ({ onSend, onReceive }: { onSend (chain: ChainKey): void, onReceive (chain: ChainKey): void }) {
  const session = useSession()
  const { data, error, isFetching, refetch } = useBalances()

  return (
    <Screen
      title='Balances'
      subtitle={profile.name === 'testnet' ? 'Testnet: these coins have no real value.' : undefined}
      actions={<Button variant='secondary' onClick={() => void refetch()} busy={isFetching}>Refresh</Button>}
    >
      {error && <Notice tone='danger'>Couldn't load balances: {errorMessage(error)}</Notice>}
      <div className='grid gap-3'>
        {CHAINS.map((chain) => {
          const balance = data?.balances.find((b) => b.chain === chain)
          const { symbol, decimals } = profile.native[chain]
          const address = session.addresses[chain]
          return (
            <Card key={chain} className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
              <div className='min-w-0'>
                <div className='text-sm font-medium text-muted'>{CHAIN_LABELS[chain]}</div>
                <div className='mt-1 text-2xl font-semibold tabular-nums' data-testid={`balance-${chain}`}>
                  {balance?.native
                    ? <>{formatUnits(BigInt(balance.native.amount), decimals)} <span className='text-base font-normal text-muted'>{symbol}</span></>
                    : balance?.error ? <span className='text-base font-normal text-warn'>Unavailable</span>
                      : <span className='inline-block h-7 w-24 animate-pulse rounded bg-surface-2' />}
                </div>
                {balance?.tokens.map((t) => (
                  <div key={t.token} className='mt-1 text-sm tabular-nums'>{t.amount} <span className='text-muted'>{t.symbol}</span></div>
                ))}
                <a className='mt-1 block truncate font-mono text-xs text-muted hover:text-accent' href={explorerAddressUrl(profile, chain, address)} target='_blank' rel='noreferrer noopener'>
                  {shorten(address, 8)}
                </a>
              </div>
              <div className='flex gap-2'>
                <Button variant='secondary' onClick={() => onReceive(chain)}>Receive</Button>
                <Button onClick={() => onSend(chain)}>Send</Button>
              </div>
            </Card>
          )
        })}
      </div>
    </Screen>
  )
}
