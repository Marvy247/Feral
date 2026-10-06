/**
 * FERAL end-to-end browser test.
 *
 * Drives the real UI against the running backend + Tempo testnet:
 *   1. Dashboard opens directly (no login gate) + silent backend session
 *   2. Team tab loads real API data
 *   3. Add a team member through the modal
 *   4. Pay an APPROVED vendor -> real on-chain transfer
 *   5. Pay an UNAPPROVED vendor -> BLOCKED with reason
 *   6. Policy Radar shows both events live over WebSocket
 *
 * Run: node scripts/e2e.mjs
 */
import puppeteer from 'puppeteer-core'

const APP = process.env.APP_URL || 'http://localhost:3000'
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome'
const VENDOR_APPROVED = '0x3333333333333333333333333333333333333333'
const WALLET = '0x9999999999999999999999999999999999999999'

const results = []
const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitForText(page, text, timeout = 20000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const body = await page.evaluate(() => document.body.innerText)
    if (body.includes(text)) return true
    await sleep(300)
  }
  return false
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900'],
})

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)))

  // ── 1. Login page loads ────────────────────────────────────────────────
  // 1 (no login gate): dashboard opens directly and picks up a silent session
  await page.goto(`${APP}/dashboard`, { waitUntil: 'networkidle2', timeout: 60000 })
  const dashboardVisible = await waitForText(page, 'Treasury Overview', 30000)
  ok('Dashboard opens without login gate', dashboardVisible, page.url())

  // (login page removed from the flow — no form to fill)

  // ── 2. Session + Team tab ─────────────────────────────────────────────
  await sleep(3000) // ensureAuth round-trip
  const session = await page.evaluate(() => ({
    token: localStorage.getItem('feral_auth_token'),
    biz: localStorage.getItem('feral_business_id'),
  }))
  ok(
    'Silent backend session acquired',
    Boolean(session.token) && session.biz && !session.biz.startsWith('demo'),
    `business=${session.biz}`
  )

  await page.evaluate(() => {
    const btn = document.querySelector('nav button[aria-label="Team"]')
    btn?.click()
  })
  await sleep(1500)
  const teamBody = await page.evaluate(() => document.body.innerText)
  ok(
    'Team tab renders API-backed content',
    teamBody.includes('Humans and AI agents under one policy engine'),
    teamBody.includes('No team members yet') ? 'empty state' : 'has members'
  )

  // ── 3. Add a team member through the modal ────────────────────────────
  const clickedAdd = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Add Member')
    )
    if (btn) { btn.click(); return true }
    return false
  })
  await sleep(1000)
  const modalOpen = (await page.evaluate(() => document.body.innerText)).includes('Add Team Member')
  ok('Add Member modal opens', clickedAdd && modalOpen)

  if (modalOpen) {
    // name input is the first text input in the modal
    const inputs = await page.$$('input')
    for (const input of inputs) {
      const ph = await input.evaluate((el) => el.placeholder || '')
      if (ph.includes('Alice, Claude')) { await input.type('E2E Tester'); break }
    }
    for (const input of inputs) {
      const ph = await input.evaluate((el) => el.placeholder || '')
      if (ph.includes('Tempo wallet address')) { await input.click({ clickCount: 3 }); await input.type(WALLET); break }
    }
    // weekly limit
    for (const input of inputs) {
      const type = await input.evaluate((el) => el.type)
      if (type === 'number') { await input.click({ clickCount: 3 }); await input.type('400'); break }
    }
    // approved vendor: name + address + Add
    for (const input of inputs) {
      const ph = await input.evaluate((el) => el.placeholder || '')
      if (ph === 'Vendor name') { await input.type('Notion'); break }
    }
    for (const input of inputs) {
      const ph = await input.evaluate((el) => el.placeholder || '')
      if (ph.includes('0x vendor address')) { await input.type(VENDOR_APPROVED); break }
    }
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        b.textContent?.trim() === 'Add' && b.type !== 'submit'
      )
      btn?.click()
    })
    await sleep(300)
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        b.textContent?.trim() === 'Save'
      )
      btn?.click()
    })
    // wait for the save round-trip + modal close (event-based, not fixed sleep).
    // On-chain access-key provisioning has taken up to ~14s — budget 30s.
    let modalClosed = false
    for (let i = 0; i < 60; i++) {
      const t = await page.evaluate(() => document.body.innerText)
      if (!t.includes('Add Team Member')) { modalClosed = true; break }
      await sleep(500)
    }
    await sleep(500)
    const afterSave = await page.evaluate(() => document.body.innerText)
    ok('Member saved and modal closed', modalClosed && afterSave.includes('E2E Tester'))
    ok('Approved vendor visible on card', afterSave.includes('Notion'))
  }

  // ── 4. Pay approved vendor (real transfer) ────────────────────────────
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.trim() === 'Pay vendor'
    )
    btn?.click()
  })
  let payPanel = ''
  for (let i = 0; i < 20; i++) {
    payPanel = await page.evaluate(() => document.body.innerText)
    if (payPanel.includes('Submit payment')) break
    await sleep(500)
  }
  ok('Pay vendor panel opens', payPanel.includes('Submit payment'))

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.trim() === 'Submit payment'
    )
    btn?.click()
  })
  // wait for either toast
  let sawApproved = false
  for (let i = 0; i < 40; i++) {
    const t = await page.evaluate(() => document.body.innerText)
    if (t.includes('APPROVED')) { sawApproved = true; break }
    if (t.includes('BLOCKED')) break
    await sleep(500)
  }
  ok('Approved vendor payment settles', sawApproved, sawApproved ? 'toast APPROVED' : 'no APPROVED toast')

  // ── 5. Pay unapproved vendor (blocked) ────────────────────────────────
  await sleep(1000)
  for (let i = 0; i < 20; i++) {
    const opened = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        b.textContent?.trim() === 'Pay vendor'
      )
      if (!btn) return false
      btn.click()
      return true
    })
    if (opened) break
    await sleep(500)
  }
  for (let i = 0; i < 20; i++) {
    const t = await page.evaluate(() => document.body.innerText)
    if (t.includes('Submit payment')) break
    await sleep(500)
  }
  await page.select('select', 'unapproved').catch(() => {})
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.trim() === 'Submit payment'
    )
    btn?.click()
  })
  let sawBlocked = false
  for (let i = 0; i < 40; i++) {
    const t = await page.evaluate(() => document.body.innerText)
    if (t.includes('BLOCKED')) { sawBlocked = true; break }
    if (t.includes('APPROVED') && t.includes('settled on Tempo')) { /* keep waiting */ }
    await sleep(500)
  }
  ok('Unapproved vendor payment blocked', sawBlocked, sawBlocked ? 'toast BLOCKED' : 'no BLOCKED toast')

  // ── 6. Policy Radar shows both events ─────────────────────────────────
  await page.evaluate(() => {
    const btn = document.querySelector('nav button[aria-label="Policy Radar"]')
    btn?.click()
  })
  await sleep(3000)
  const radarText = await page.evaluate(() => document.body.innerText)
  const hasWs = radarText.includes('Waiting for WebSocket') === false
  ok('Policy Radar WebSocket connected', hasWs)
  ok('Policy Radar shows BLOCKED event', radarText.includes('BLOCKED'))
  ok('Policy Radar shows APPROVED event', radarText.includes('APPROVED'))

  await page.screenshot({ path: 'e2e-policy-radar.png', fullPage: false })
  console.log('\nScreenshot saved: dashboard/e2e-policy-radar.png')
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
