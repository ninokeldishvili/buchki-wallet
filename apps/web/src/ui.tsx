import { useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent/90 disabled:bg-accent/40',
  secondary: 'bg-surface-2 text-fg hover:bg-surface-3 border border-line disabled:opacity-50',
  danger: 'bg-danger text-white hover:bg-danger/90 disabled:bg-danger/40',
  ghost: 'text-muted hover:text-fg hover:bg-surface-2 disabled:opacity-50'
}

export function Button ({ variant = 'primary', className = '', busy, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant, busy?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {busy && <span className='size-4 animate-spin rounded-full border-2 border-current border-t-transparent' aria-hidden />}
      {children}
    </button>
  )
}

export function Card ({ children, className = '' }: { children: ReactNode, className?: string }) {
  return <div className={`rounded-2xl border border-line bg-surface p-5 ${className}`}>{children}</div>
}

export function Field ({ label, hint, error, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string, hint?: ReactNode, error?: string | null }) {
  const id = useId()
  const describedBy = error || hint ? `${id}-desc` : undefined
  return (
    <div className='space-y-1.5'>
      <label htmlFor={id} className='block text-sm font-medium text-fg'>{label}</label>
      <input
        {...props}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`w-full rounded-xl border bg-surface-2 px-3.5 py-2.5 text-sm text-fg outline-none placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20 ${error ? 'border-danger' : 'border-line'}`}
      />
      {error
        ? <p id={describedBy} className='text-xs text-danger'>{error}</p>
        : hint ? <p id={describedBy} className='text-xs text-muted'>{hint}</p> : null}
    </div>
  )
}

export function Notice ({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'danger' | 'ok', children: ReactNode }) {
  const tones = {
    info: 'border-line bg-surface-2 text-muted',
    warn: 'border-warn/40 bg-warn/10 text-fg',
    danger: 'border-danger/40 bg-danger/10 text-fg',
    ok: 'border-ok/40 bg-ok/10 text-fg'
  }
  return <div className={`rounded-xl border px-3.5 py-3 text-sm ${tones[tone]}`} role={tone === 'danger' ? 'alert' : undefined}>{children}</div>
}

export function CopyButton ({ text, label = 'Copy' }: { text: string, label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant='secondary'
      type='button'
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? 'Copied' : label}
    </Button>
  )
}

export function Screen ({ title, subtitle, children, actions }: { title: string, subtitle?: ReactNode, children: ReactNode, actions?: ReactNode }) {
  return (
    <section className='space-y-5'>
      <header className='flex items-start justify-between gap-3'>
        <div>
          <h1 className='text-xl font-semibold text-fg'>{title}</h1>
          {subtitle && <p className='mt-1 text-sm text-muted'>{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  )
}

export function errorMessage (err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function shorten (address: string, chars = 6): string {
  return address.length <= chars * 2 + 3 ? address : `${address.slice(0, chars + 2)}…${address.slice(-chars)}`
}

export const CHAIN_LABELS = { ethereum: 'Ethereum', solana: 'Solana', bitcoin: 'Bitcoin', spark: 'Spark' } as const
