/**
 * Converts between base units (bigint) and decimal strings without floats.
 * Never use Number for amounts: 18-decimal values overflow its precision.
 */

export function formatUnits (amount: bigint, decimals: number): string {
  const negative = amount < 0n
  const abs = negative ? -amount : amount
  const base = 10n ** BigInt(decimals)
  const whole = abs / base
  const fraction = (abs % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`
}

export function parseUnits (value: string, decimals: number): bigint {
  const trimmed = value.trim()
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error(`Invalid amount: "${value}"`)
  const [whole = '0', fraction = ''] = trimmed.split('.')
  if (fraction.length > decimals) throw new Error(`Too many decimal places (max ${decimals})`)
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0')
}
