/**
 * Kill-switch UI test: the Revoke button on a member card must
 *   open the type-to-confirm modal → type REVOKE → DELETE /api/team/:id/:memberId
 *   → on-chain policy tx → "Revoked on-chain" toast → row disappears from the list.
 *
 * Run: node scripts/e2e-revoke.mjs
 */
import puppeteer from 'puppeteer-core'

const APP = process.env.APP_URL || 'http://localhost:3000'
const API = process.env.API_URL || 'http://localhost:3001'
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome'
const AGENT = 'Revoke Test Agent'
const AGENT_WALLET = '0x7777777777777777777777777777777777777777'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitForText(page, text, timeout = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const body = await page.evaluate(() => document.body.innerText)
    if (body.includes(text)) return true
    await sleep(300)
  }
  return false
}

async function waitForNoText(page, text, timeout = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const body = await page.evaluate(() => document.body.innerText)
    if (!body.includes(text)) return true
    await sleep(300)
  }
  return false
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900'],
})
let pass = true
const ok = (name, p, detail = '') => {
  if (!p) pass = false
  console.log(`${p ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)))
  page.on('dialog', async (d) => {
    console.log('  [dialog]', d.message().slice(0, 80))
    await d.accept()
  })

  await page.goto(`${APP}/dashboard`, { waitUntil: 'networkidle2', timeout: 60000 })

  // ensureAuth is async (register→409→login) — poll instead of a fixed wait
  let session = null
  for (let i = 0; i < 40; i++) {
    session = await page.evaluate(() => ({
      token: localStorage.getItem('feral_auth_token'),
      biz: localStorage.getItem('feral_business_id'),
    }))
    if (session.token && session.biz && !session.biz.startsWith('demo')) break
    await sleep(750)
  }
  if (!session?.token || !session?.biz || session.biz.startsWith('demo')) {
    ok('Session acquired', false, JSON.stringify(session))
    throw new Error('no session')
  }

  // Create a throwaway agent through the real API (keeps e2e-critical rows intact)
  const created = await fetch(`${API}/api/team/${session.biz}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
    body: JSON.stringify({
      name: AGENT,
      type: 'agent',
      walletAddress: AGENT_WALLET,
      weeklyLimitUsdc: 500,
      approvedVendors: [{ name: 'AWS', address: '0x4444444444444444444444444444444444444444' }],
    }),
  }).then((r) => r.json())
  ok('Agent created (policy synced on-chain)', Boolean(created.member), `engineTx=${String(created.engineTxHash).slice(0, 14)}…`)

  // Open Team tab (same selector the main e2e uses)
  await page.evaluate(() => {
    const btn = document.querySelector('nav button[aria-label="Team"]')
    btn?.click()
  })
  await sleep(2000)
  ok('Agent visible on Team tab', await waitForText(page, AGENT, 20000))

  // Click THIS row's Revoke button → type-to-confirm modal (no native dialog)
  const clicked = await page.evaluate((name) => {
    const revokeBtns = [...document.querySelectorAll('button')].filter(
      (b) => b.textContent?.trim() === 'Revoke'
    )
    for (const btn of revokeBtns) {
      const row = btn.closest('.rounded-2xl')
      if (row && row.innerText.includes(name)) {
        btn.click()
        return true
      }
    }
    return false
  }, AGENT)
  ok('Revoke button clicked', clicked)

  // Confirm modal must open, require the typed word, then fire the DELETE
  let modalOpened = true
  try {
    await page.waitForSelector('input[placeholder="REVOKE"]', { timeout: 10000 })
  } catch {
    modalOpened = false
  }
  ok('Type-to-confirm modal opened', modalOpened)

  if (modalOpened) {
    await page.type('input[placeholder="REVOKE"]', 'REVOKE')
    await sleep(200)
    const confirmDisabled = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === 'Revoke on-chain'
      )
      if (!btn) return 'missing'
      if (btn.disabled) return 'disabled'
      btn.click()
      return 'clicked'
    })
    ok('Confirm clicked after typing REVOKE', confirmDisabled === 'clicked', confirmDisabled)
  }

  const toastShown = await waitForText(page, 'Revoked on-chain', 40000)
  ok('On-chain revoke toast shown', toastShown)
  const txShown = await waitForText(page, 'Policy tx 0x', 5000)
  ok('Toast carries policy tx hash', txShown)
  ok('Revoked row removed from list', await waitForNoText(page, AGENT, 20000))

  await page.screenshot({ path: 'e2e-revoke.png', fullPage: false })
  console.log(pass ? 'REVOKE_UI_PASS' : 'REVOKE_UI_FAIL')
} catch (err) {
  console.log('FAIL  unexpected error —', err.message)
  console.log('REVOKE_UI_FAIL')
  pass = false
} finally {
  await browser.close()
}
process.exit(pass ? 0 : 1)
