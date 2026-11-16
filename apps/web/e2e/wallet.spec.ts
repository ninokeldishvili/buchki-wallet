import { expect, test, type Page } from '@playwright/test'

const PASSWORD = 'correct horse battery'

/** Collects page errors so a broken bundle fails the test loudly. */
function trackErrors (page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return errors
}

async function createWallet (page: Page): Promise<string[]> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Create a new wallet' }).click()

  await page.getByRole('button', { name: /Reveal phrase/ }).click()
  const words = await page.locator('ol li').evaluateAll((items) => items.map((li) => li.lastChild?.textContent?.trim() ?? ''))
  expect(words).toHaveLength(12)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Continue' }).click()

  // Answer the three verification prompts.
  for (const input of await page.getByLabel(/Word #\d+/).all()) {
    const label = await input.evaluate((el) => (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent) ?? '')
    const n = Number(label.match(/Word #(\d+)/)![1])
    await input.fill(words[n - 1]!)
  }
  await page.getByRole('button', { name: 'Confirm' }).click()

  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create wallet' }).click()
  await expect(page.getByRole('heading', { name: 'Balances' })).toBeVisible({ timeout: 90_000 })
  return words
}

test('create, view balances, receive, lock/unlock, reveal and remove', async ({ page }) => {
  const errors = trackErrors(page)
  const words = await createWallet(page)

  // Balances for all four chains come back from the API (zero on a fresh wallet).
  for (const chain of ['ethereum', 'solana', 'bitcoin', 'spark']) {
    await expect(page.getByTestId(`balance-${chain}`)).toHaveText(/^0 |Unavailable/, { timeout: 60_000 })
  }
  await expect(page.getByTestId('balance-ethereum')).toHaveText(/^0 SepoliaETH/)

  // Receive shows a testnet address for each chain.
  await page.getByRole('navigation').getByRole('button', { name: 'Receive' }).click()
  await expect(page.getByTestId('receive-address')).toHaveText(/^0x[0-9a-fA-F]{40}$/)
  await page.getByRole('tab', { name: 'Bitcoin' }).click()
  await expect(page.getByTestId('receive-address')).toHaveText(/^tb1/)
  await expect(page.getByRole('img', { name: /QR code/ })).toBeVisible()

  // Send validates before quoting: wrong-network address, then insufficient funds.
  await page.getByRole('navigation').getByRole('button', { name: 'Send' }).click()
  await page.getByLabel('Recipient address').fill('bc1qxlnfvuqz6c40fj4ekdp2ckdd3u6yknrjkypd40')
  await page.getByRole('tab', { name: 'Bitcoin' }).click()
  await page.getByLabel(/Amount/).fill('0.001')
  await page.getByRole('button', { name: 'Review' }).click()
  await expect(page.getByText(/isn't a valid Bitcoin Testnet address/)).toBeVisible()
  await page.getByLabel('Recipient address').fill('tb1qp9pze5uvm8vceyp94ycpq0j5deudh40pwt3h9v')
  await page.getByRole('button', { name: 'Review' }).click()
  await expect(page.getByText(/Insufficient balance/)).toBeVisible()

  // History renders (Sepolia USD₮ via the indexer + explorer links).
  await page.getByRole('navigation').getByRole('button', { name: 'History' }).click()
  await expect(page.getByText(/No transfers yet|Received|Sent/).first()).toBeVisible()

  // Lock, then a reload keeps the encrypted wallet and asks for the password.
  await page.getByRole('button', { name: 'Lock', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Unlock your wallet' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Unlock your wallet' })).toBeVisible()

  await page.getByLabel('Password').fill('wrong password!')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByText('Wrong password.')).toBeVisible()

  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByRole('heading', { name: 'Balances' })).toBeVisible({ timeout: 90_000 })

  // The stored phrase is the one we wrote down.
  await page.getByRole('navigation').getByRole('button', { name: 'Settings' }).click()
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Show recovery phrase' }).click()
  await expect(page.locator('ol li')).toHaveCount(12)
  const revealed = await page.locator('ol li').evaluateAll((items) => items.map((li) => li.lastChild?.textContent?.trim() ?? ''))
  expect(revealed).toEqual(words)

  // The seed is never stored in plaintext.
  const stored = await page.evaluate(() => new Promise<string>((resolve) => {
    const req = indexedDB.open('buchki-wallet')
    req.onsuccess = () => {
      const get = req.result.transaction('vault').objectStore('vault').get('primary')
      get.onsuccess = () => resolve(JSON.stringify(get.result))
    }
  }))
  expect(stored).toContain('"ciphertext"')
  for (const w of words) expect(stored).not.toContain(` ${w} `)
  expect(await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage))).not.toContain(words[0]!)

  // Remove wallet.
  await page.getByLabel('Confirmation').fill('REMOVE')
  await page.getByRole('button', { name: 'Remove wallet' }).click()
  await expect(page.getByRole('button', { name: 'Create a new wallet' })).toBeVisible()

  expect(errors).toEqual([])
})

test('import rejects an invalid phrase and accepts a valid one', async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Import a recovery phrase' }).click()
  await page.getByLabel('Recovery phrase').fill('apple apple apple apple apple apple apple apple apple apple apple apple')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText(/isn't a valid/)).toBeVisible()

  // Standard BIP-39 test vector: a well-known, empty wallet.
  await page.getByLabel('Recovery phrase').fill('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Import wallet' }).click()
  await expect(page.getByRole('heading', { name: 'Balances' })).toBeVisible({ timeout: 90_000 })

  // Known address for this test vector (BIP-44 m/44'/60'/0'/0/0).
  await page.getByRole('navigation').getByRole('button', { name: 'Receive' }).click()
  await expect(page.getByTestId('receive-address')).toHaveText('0x9858EfFD232B4033E47d90003D41EC34EcaEda94')

  // Fee quotes on chains where this public test wallet has testnet funds.
  // The test stops at the review screen: it never confirms or sends.
  const quoteCases = [
    { tab: 'Solana', to: 'GTPtRfeuVTr9PNHySwuBw5GYFtmo9soasLpF3Sfxxsn8', amount: '0.0001', symbol: 'SOL (devnet)' },
    { tab: 'Spark', to: 'sparkrt1pgssxmgjnhxjp3zh0qdskn3ey07mh7jcw6ldzwt4lgkza95aeph6gxrxlhk375', amount: '10', symbol: 'sats (regtest)' }
  ]
  await page.getByRole('navigation').getByRole('button', { name: 'Home' }).click()
  // Spark's balance comes from the wallet itself (the read-only lookup reports 0 for this address).
  await expect(page.getByTestId('balance-solana')).toHaveText(/^0\.\d+ SOL/, { timeout: 60_000 })
  await expect(page.getByTestId('balance-spark')).toHaveText(/^[1-9]\d* sats/, { timeout: 60_000 })

  for (const c of quoteCases) {
    await page.getByRole('navigation').getByRole('button', { name: 'Send' }).click()
    await page.getByRole('tab', { name: c.tab }).click()
    await page.getByLabel('Recipient address').fill(c.to)
    await page.getByLabel(/Amount/).fill(c.amount)
    await page.getByRole('button', { name: 'Review' }).click()
    await expect(page.getByRole('heading', { name: 'Review transaction' })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText(`${c.amount} ${c.symbol}`).first()).toBeVisible()
    await expect(page.getByText('Network fee')).toBeVisible()
    await page.getByRole('button', { name: 'Edit' }).click()
    await expect(page.getByRole('button', { name: 'Review' })).toBeVisible()
  }

  expect(errors).toEqual([])
})
