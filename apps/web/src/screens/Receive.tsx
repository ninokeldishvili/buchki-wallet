import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { CHAINS, type ChainKey } from '@buchki/wallet-core'
import { profile } from '../config.ts'
import { useSession } from '../wallet/WalletProvider.tsx'
import { CHAIN_LABELS, Card, CopyButton, Notice, Screen } from '../ui.tsx'
import { ChainPicker } from './Send.tsx'

export function Receive ({ initialChain = 'ethereum' }: { initialChain?: ChainKey }) {
  const session = useSession()
  const [chain, setChain] = useState<ChainKey>(initialChain)
  const [qr, setQr] = useState<string | null>(null)
  const address = session.addresses[chain]

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(address, { margin: 1, width: 240, errorCorrectionLevel: 'M' }).then((url) => { if (!cancelled) setQr(url) })
    return () => { cancelled = true }
  }, [address])

  return (
    <Screen title='Receive' subtitle='Share this address to receive funds.'>
      <ChainPicker value={chain} onChange={setChain} chains={CHAINS} />
      <Card className='flex flex-col items-center gap-4 text-center'>
        {qr ? <img src={qr} alt={`QR code for your ${CHAIN_LABELS[chain]} address`} className='size-60 rounded-lg bg-white p-2' /> : <div className='size-60' />}
        <code className='w-full break-all rounded-lg bg-surface-2 px-3 py-2 font-mono text-sm' data-testid='receive-address'>{address}</code>
        <CopyButton text={address} label='Copy address' />
      </Card>
      <Notice tone='warn'>
        Only send <strong>{profile.networkNames[chain]}</strong> assets ({profile.native[chain].symbol}) to this address.
        Funds sent from another network may be lost.
      </Notice>
    </Screen>
  )
}
