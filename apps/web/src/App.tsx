import { useEffect, useState } from 'react'
import type { ChainKey } from '@buchki/wallet-core'
import { profile } from './config.ts'
import { useWallet } from './wallet/WalletProvider.tsx'
import { Onboarding } from './screens/Onboarding.tsx'
import { Unlock } from './screens/Unlock.tsx'
import { Dashboard } from './screens/Dashboard.tsx'
import { Send } from './screens/Send.tsx'
import { Receive } from './screens/Receive.tsx'
import { History } from './screens/History.tsx'
import { Settings } from './screens/Settings.tsx'

type Tab = 'home' | 'send' | 'receive' | 'history' | 'settings'
const TABS: { id: Tab, label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'send', label: 'Send' },
  { id: 'receive', label: 'Receive' },
  { id: 'history', label: 'History' },
  { id: 'settings', label: 'Settings' }
]

export function App () {
  const { status, lock } = useWallet()

  // Warm the wallet modules (several MB) while the user reads or types a password.
  useEffect(() => {
    if (status === 'locked' || status === 'empty') {
      void import('@buchki/wallet-core/wdk').then(() => import('@tetherto/wdk-wallet-spark')).catch(() => {})
    }
  }, [status])

  return (
    <div className='mx-auto flex min-h-dvh max-w-2xl flex-col px-4 pb-24 pt-6 sm:pb-8'>
      <header className='mb-6 flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          <div className='grid size-8 place-items-center rounded-lg bg-accent font-bold text-accent-fg'>B</div>
          <span className='font-semibold'>Buchki Wallet</span>
          {profile.name === 'testnet' && <span className='rounded-full bg-warn/15 px-2 py-0.5 text-xs font-medium text-warn'>Testnet</span>}
        </div>
        {status === 'unlocked' && <button className='text-sm text-muted hover:text-fg' onClick={lock}>Lock</button>}
      </header>
      <main className='flex-1'>
        {status === 'loading' && <div className='h-40 animate-pulse rounded-2xl bg-surface' />}
        {status === 'empty' && <Onboarding />}
        {status === 'locked' && <Unlock />}
        {status === 'unlocked' && <UnlockedApp />}
      </main>
    </div>
  )
}

function UnlockedApp () {
  const [tab, setTab] = useState<Tab>('home')
  const [chain, setChain] = useState<ChainKey>('ethereum')
  const go = (t: Tab, c?: ChainKey) => { if (c) setChain(c); setTab(t) }

  return (
    <>
      {tab === 'home' && <Dashboard onSend={(c) => go('send', c)} onReceive={(c) => go('receive', c)} />}
      {tab === 'send' && <Send key={chain} initialChain={chain} />}
      {tab === 'receive' && <Receive key={chain} initialChain={chain} />}
      {tab === 'history' && <History />}
      {tab === 'settings' && <Settings />}

      <nav className='fixed inset-x-0 bottom-0 border-t border-line bg-surface/95 backdrop-blur sm:static sm:mt-8 sm:rounded-2xl sm:border'>
        <ul className='mx-auto flex max-w-2xl'>
          {TABS.map((t) => (
            <li key={t.id} className='flex-1'>
              <button onClick={() => go(t.id)} aria-current={tab === t.id ? 'page' : undefined}
                className={`w-full py-3 text-sm font-medium ${tab === t.id ? 'text-accent' : 'text-muted hover:text-fg'}`}>
                {t.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </>
  )
}
