import { parseNetwork, resolveNetwork, type NetworkProfile } from '@buchki/wallet-core'

export interface Config {
  port: number
  host: string
  databaseUrl: string
  /** The web app's origin: used for CORS and in the sign-in message. */
  webOrigin: string
  /** Cookies get the Secure flag (HTTPS only) outside local development. */
  secureCookies: boolean
  network: NetworkProfile
  indexerApiKey: string | undefined
  logLevel: string
}

/** Reads and validates configuration once at startup; throws with every problem listed. */
export function loadConfig (env: NodeJS.ProcessEnv = process.env): Config {
  const problems: string[] = []

  const required = (name: string): string => {
    const value = env[name]?.trim()
    if (!value) problems.push(`${name} is required`)
    return value ?? ''
  }

  const databaseUrl = required('DATABASE_URL')
  const webOrigin = required('WEB_ORIGIN')
  if (webOrigin && !/^https?:\/\/[^/]+$/.test(webOrigin)) {
    problems.push('WEB_ORIGIN must be an origin like https://wallet.example.com (no path or trailing slash)')
  }

  const port = Number(env.PORT || 4000)
  if (!Number.isInteger(port) || port <= 0 || port > 65535) problems.push('PORT must be a valid port number')

  let network: NetworkProfile | undefined
  try {
    network = resolveNetwork(parseNetwork(env.NETWORK), {
      evmRpcUrl: env.ETH_RPC_URL,
      solanaRpcUrl: env.SOLANA_RPC_URL,
      btcBlockbookUrl: env.BTC_BLOCKBOOK_URL
    })
  } catch (err) {
    problems.push((err as Error).message)
  }

  if (problems.length || !network) {
    throw new Error(`Invalid configuration:\n  - ${problems.join('\n  - ')}`)
  }

  return {
    port,
    host: env.HOST || '127.0.0.1',
    databaseUrl,
    webOrigin,
    secureCookies: !webOrigin.startsWith('http://localhost') && !webOrigin.startsWith('http://127.0.0.1'),
    network,
    indexerApiKey: env[network.indexerApiKeyEnv]?.trim() || undefined,
    logLevel: env.LOG_LEVEL || 'info'
  }
}
