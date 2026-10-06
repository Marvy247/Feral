/**
 * FERAL screenshot suite — captures the marketing + product screens used in
 * README.md and submission.md.
 *
 * Run (dev server on :3000, backend on :3001, data seeded via
 * backend/scripts/seed_roster.ts):
 *
 *   cd dashboard && node scripts/screenshots.mjs
 *
 * Output: ../docs/screenshots/*.png (1600×1000 @2x)
 */
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const APP = process.env.APP_URL || 'http://localhost:3000'
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome'
const OUT = path.resolve(process.cwd(), '../docs/screenshots')
fs.mkdirSync(OUT, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitForText(page, text, timeout = 25000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const body = await page.evaluate(() => document.body.innerText)
    if (body.includes(text)) return true
    await sleep(250)
  }
  console.warn(`  ! timed out waiting for: ${text}`)
  return false
}

async function shot(page, name) {
  await sleep(400) // settle fonts/animations
  await page.screenshot({ path: path.join(OUT, name) })
  console.log(`  📷 ${name}`)
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1600,1000'],
})

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 })
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 160)))

  // ── 1. Landing hero ─────────────────────────────────────────────────────
  await page.goto(`${APP}/`, { waitUntil: 'networkidle2', timeout: 60000 })
  await waitForText(page, 'is a policy decision')
  await sleep(2600) // hero fade-in chain (last delay is 1.4s)
  await shot(page, '01-landing-hero.png')

  // ── 2. Landing "How it works" (reveal-on-scroll) ───────────────────────
  await page.evaluate(() => document.querySelector('#how-it-works')?.scrollIntoView())
  await sleep(2200) // staggered reveal transitions
  await waitForText(page, 'Three primitives')
  await shot(page, '02-landing-how-it-works.png')

  // ── 3. Landing demo beats ──────────────────────────────────────────────
  const demoSection = await page.evaluate(() => {
    const el = [...document.querySelectorAll('section')].find((s) =>
      s.innerText.includes('BLOCKED') && s.innerText.includes('APPROVED')
    )
    if (el) { el.scrollIntoView(); return true }
    return false
  })
  if (demoSection) {
    await sleep(1800)
    await shot(page, '03-landing-demo-beats.png')
  }

  // ── 4. Treasury overview ───────────────────────────────────────────────
  await page.goto(`${APP}/dashboard`, { waitUntil: 'networkidle2', timeout: 60000 })
  await waitForText(page, 'Treasury Overview')
  await sleep(2500) // balance fetch + session
  await shot(page, '04-treasury-overview.png')

  // ── 5. Team roster with on-chain progress bars ─────────────────────────
  await page.goto(`${APP}/dashboard?tab=team`, { waitUntil: 'networkidle2', timeout: 60000 })
  await waitForText(page, 'Humans and AI agents')
  await waitForText(page, 'Maya Ortiz')
  await waitForText(page, 'used this week · on-chain')
  await sleep(1500)
  await shot(page, '05-team-roster.png')

  // ── 6. Pay-vendor pre-flight: chain says APPROVED ──────────────────────
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Pay vendor')
    )
    btn?.click()
  })
  const preflightOk = await waitForText(page, 'Chain simulation: will be approved', 20000)
  if (preflightOk) {
    await sleep(600)
    await shot(page, '06-preflight-approved.png')
  }

  // ── 7. Pre-flight: chain says BLOCKED (unapproved vendor) ──────────────
  await page.select('select', 'unapproved').catch(() => {})
  const preflightBlocked = await waitForText(page, 'Chain simulation: will be blocked', 20000)
  if (preflightBlocked) {
    await sleep(600)
    await shot(page, '07-preflight-blocked.png')
  }
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Cancel'
    )
    btn?.click()
  })
  await sleep(400)

  // ── 8. Type-to-confirm revoke dialog ───────────────────────────────────
  await page.evaluate(() => {
    const revokeBtns = [...document.querySelectorAll('button')].filter(
      (b) => b.textContent?.trim() === 'Revoke'
    )
    const ada = revokeBtns.find((b) => b.closest('.rounded-2xl')?.innerText.includes('Ada'))
    ;(ada || revokeBtns[0])?.click()
  })
  if (await waitForText(page, 'on-chain?', 8000)) {
    await sleep(500)
    await shot(page, '08-revoke-confirm.png')
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === 'Cancel'
      )
      btn?.click()
    })
    await sleep(400)
  }

  // ── 9. Policy Radar with live verdicts ─────────────────────────────────
  await page.goto(`${APP}/dashboard?tab=radar`, { waitUntil: 'networkidle2', timeout: 60000 })
  await waitForText(page, 'Policy Radar')
  await waitForText(page, 'BLOCKED', 30000)
  await waitForText(page, 'APPROVED', 15000)
  await sleep(1500)
  await shot(page, '09-policy-radar.png')

  // ── 10. Invoices: waiting + reconciled ─────────────────────────────────
  await page.goto(`${APP}/dashboard?tab=invoices`, { waitUntil: 'networkidle2', timeout: 60000 })
  await waitForText(page, 'INV-')
  await waitForText(page, 'Waiting for payment', 15000)
  await sleep(600)
  await shot(page, '10-invoices.png')

  // ── 11. Payroll batch scheduler ────────────────────────────────────────
  await page.goto(`${APP}/dashboard?tab=payroll`, { waitUntil: 'networkidle2', timeout: 60000 })
  await waitForText(page, 'Payroll Scheduler')
  await sleep(800)
  await shot(page, '11-payroll.png')

  console.log(`\nDone → ${OUT}`)
} finally {
  await browser.close()
}
