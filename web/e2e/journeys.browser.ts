import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { makeEntry } from '../src/test/entryFixtures'

const entry = makeEntry({ search_keys: ['潮州', 'Chaozhou', 'dio5 ziu1'] })
const dictionary = { meta: { entry_count: 1, reading_count: 1, sources: [], varieties: [] }, entries: [entry] }

test.beforeEach(async ({ page }) => {
  // Each Playwright test has fresh isolated storage. No production data is used.
  await page.route('**/data/dict.json', route => route.fulfill({ json: dictionary }))
  await page.route('**/data/starter-decks.json', route => route.fulfill({ json: { decks: [] } }))
  await page.route('**/gc.zgo.at/**', route => route.abort())
  await page.route('**/*.goatcounter.com/**', route => route.abort())
})

test('lookup → add to deck → study → return retains the search', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('searchbox').fill('Chaozhou')
  await page.getByText('潮州', { exact: true }).click()
  await page.getByText('Add to deck', { exact: true }).click()
  await page.getByLabel('New deck name').fill('Everyday words')
  await page.getByRole('button', { name: 'Add word', exact: true }).click()
  await page.getByRole('link', { name: 'Study this deck' }).click()
  await page.getByRole('button', { name: 'Show answer', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Good/ })).toBeVisible()
  await page.getByRole('button', { name: /^Good/ }).click()
  await expect(page.getByText('0 left in this session', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Dictionary', exact: true }).click()
  await expect(page.getByRole('searchbox')).toHaveValue('Chaozhou')
})

test('Settings loads without a dictionary body request or Study stylesheet', async ({ page }) => {
  const downloads: string[] = []
  page.on('request', request => {
    if (request.url().endsWith('/data/dict.json') && request.method() !== 'HEAD') downloads.push(request.url())
  })
  await page.goto('/#settings')
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'More', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('.seg')).toHaveCSS('display', 'inline-flex')
  expect(downloads).toEqual([])
})

test('navigation fits at 320px and uses four destinations', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('/#more')
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link')).toHaveCount(4)
  const width = await page.evaluate(() => ({ actual: document.documentElement.scrollWidth, viewport: innerWidth }))
  expect(width.actual).toBeLessThanOrEqual(width.viewport)
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(page.getByLabel('Audio availability')).toHaveValue('all')
  await page.getByLabel('Audio availability').selectOption('full')
  await page.reload()
  await expect(page.getByLabel('Audio availability')).toHaveValue('full')
})

test('Settings accessibility smoke and theme screenshots', async ({ page }, testInfo) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    await page.goto('/#settings')
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
    const result = await new AxeBuilder({ page }).analyze()
    await testInfo.attach(`axe-${colorScheme}`, { body: JSON.stringify(result.violations, null, 2), contentType: 'application/json' })
    // Report all findings; critical failures block this smoke suite. This is not a conformance audit.
    expect(result.violations.filter(item => item.impact === 'critical')).toEqual([])
    await testInfo.attach(`settings-${colorScheme}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
  }
})
