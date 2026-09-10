import { readFile, readdir, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const { chromium } = await import(pathToFileURL(process.env.L19_PLAYWRIGHT_MODULE));
const root = fileURLToPath(new URL('../', import.meta.url));
const browser = await chromium.launch({ headless: true, ...(process.env.GUIDE_BROWSER_CHANNEL ? { channel: process.env.GUIDE_BROWSER_CHANNEL } : {}) });
const out = process.env.GUIDE_SCREENSHOTS;
if (out) await mkdir(out, { recursive: true });
const context = await browser.newContext();
const page = await context.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
// Isolate the new UI from authentication and network mutations. Use real page markup and styles.
await page.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.hostname !== 'guide.test') return route.abort();
  if (['.js', '.mjs'].includes(extname(url.pathname)) && !url.pathname.endsWith('/product-guide.js')) return route.fulfill({ body: '', contentType: 'text/javascript' });
  try { return route.fulfill({ body: await readFile(resolve(root, '.' + url.pathname)), contentType: ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' })[extname(url.pathname)] || 'application/octet-stream' }); }
  catch { return route.fulfill({ status: 404, body: '' }); }
});
await page.addInitScript(() => localStorage.setItem('currentUser', JSON.stringify({ id: 42 })));
let checks = 0;
async function inside(selector) {
  const b = await page.locator(selector).boundingBox(); const v = page.viewportSize();
  assert.ok(b && b.x >= 0 && b.y >= 0 && b.x + b.width <= v.width + 1 && b.y + b.height <= v.height + 1, `${selector} within ${v.width}px viewport`); checks++;
}
async function builder() {
  await page.goto('https://guide.test/chat.html');
  await page.evaluate(() => {
    for (const id of ['openMediaSources', 'openVisualPresence', 'journeySummary']) document.getElementById(id).hidden = false;
    document.getElementById('openSidebar').onclick = () => document.body.classList.add('drawer-open');
    document.getElementById('closeSidebar').onclick = () => document.body.classList.remove('drawer-open');
    const fake = document.createElement('dialog'); fake.id = 'fakeUpload'; fake.innerHTML = '<button id="closeFake">Close upload</button>'; document.body.append(fake);
    document.getElementById('openMediaSources').onclick = () => fake.showModal(); document.getElementById('closeFake').onclick = () => fake.close();
    window.dispatchEvent(new Event('legarya:session-ending'));
    window.dispatchEvent(new CustomEvent('legarya-legacy-change', { detail: { legacy: { id: 10, setup_status: 'active' } } }));
  });
}
try {
  const pages = (await readdir(root)).filter(x => x.endsWith('.html'));
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 850 });
    for (const name of pages) {
      await page.goto('https://guide.test/' + name);
      await page.getByRole('button', { name: '? Help', exact: true }).click();
      await inside('.lg-help');
      assert.equal(await page.locator('.lg-help details').count() >= 2, true);
      if (out && width === 390 && name === 'gateway.html') await page.screenshot({ path: resolve(out, 'help-mobile.png') });
      await page.keyboard.press('Escape'); assert.equal(await page.locator('.lg-help').isVisible(), false); checks++;
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, name + ' overflow at ' + width);
    }
    await page.evaluate(() => localStorage.removeItem('legarya:guide:v1:42:chat.html'));
    await builder(); await inside('.lg-coach');
    if (out) await page.screenshot({ path: resolve(out, `tour-${width}.png`) });
    await page.locator('.lg-coach').getByRole('button', { name: 'Next', exact: true }).click();
    await page.locator('.lg-coach').getByRole('button', { name: 'Write to Rya' }).click();
    assert.equal(await page.locator('#messageInput').evaluate(el => el === document.activeElement), true); checks++;
    await page.reload(); await builder(); assert.match(await page.locator('.lg-coach h2').innerText(), /Start with a person/); checks++;
    await page.locator('.lg-coach').getByRole('button', { name: 'Explore the tools' }).click();
    await page.locator('.lg-coach').getByRole('button', { name: 'Open photos & documents' }).click();
    await page.locator('.lg-coach').waitFor({ state: 'hidden' }); checks++;
    await page.getByRole('button', { name: 'Close upload' }).click();
    await page.locator('.lg-coach').waitFor({ state: 'visible' });
    await page.locator('.lg-coach').getByRole('button', { name: 'Next', exact: true }).click(); await inside('.lg-coach');
    if (width < 800) assert.equal(await page.locator('body').evaluate(el => el.classList.contains('drawer-open')), true);
    await page.locator('.lg-coach').getByRole('button', { name: 'Next', exact: true }).click();
    await page.locator('.lg-coach').getByRole('button', { name: "Let's begin" }).click();
    await builder(); assert.equal(await page.locator('.lg-coach').isVisible(), false); checks++;
    // Historical streak data must not celebrate just because the page loaded.
    await page.evaluate(() => {
      localStorage.removeItem('legarya:celebrated:v1:42:10:1');
      window.dispatchEvent(new CustomEvent('legarya-journey-loaded', { detail: { streak: { current_streak_days: 1, today_completed: true } } }));
    });
    assert.equal(await page.locator('.lg-celebration').count(), 0); checks++;
    await page.getByRole('button', { name: '? Help', exact: true }).click();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('legarya-progress-update', { detail: { today_just_completed: true, streak: { current_streak_days: 1 } } })));
    assert.equal(await page.locator('.lg-celebration').count(), 0); // queue until help closes
    await page.keyboard.press('Escape'); await page.locator('.lg-celebration').waitFor();
    await inside('.lg-celebration-card');
    if (out) await page.screenshot({ path: resolve(out, `streak-${width}.png`), animations: 'disabled' });
    await page.getByRole('button', { name: 'Keep going' }).click();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('legarya-progress-update', { detail: { today_just_completed: true, streak: { current_streak_days: 1 } } })));
    assert.equal(await page.locator('.lg-celebration').count(), 0); checks++;
    assert.equal(await page.locator('#lgReward progress').getAttribute('value'), '1');
    await page.getByRole('button', { name: '? Help', exact: true }).click(); await page.getByRole('button', { name: 'Replay walkthrough' }).click(); await inside('.lg-coach');
  }
  await page.goto('https://guide.test/legacy-chat.html?legacy_id=10');
  await page.evaluate(() => { window.LegaryaLiveChat = { context: () => ({ ready: true }) }; window.dispatchEvent(new Event('legarya:chat-context')); });
  assert.match(await page.locator('.lg-coach h2').innerText(), /AI legacy/); checks++;
  await page.evaluate(() => window.dispatchEvent(new Event('legarya:session-ending'))); assert.equal(await page.locator('.lg-coach').isVisible(), false); checks++;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await builder();
  await page.evaluate(() => { localStorage.removeItem('legarya:celebrated:v1:42:10:7'); window.dispatchEvent(new CustomEvent('legarya-progress-update', { detail: { today_just_completed: true, streak: { current_streak_days: 7 } } })); });
  assert.equal(await page.locator('.lg-celebration-card').evaluate(el => getComputedStyle(el).animationName), 'none'); checks++;
  await page.locator('.lg-celebration').waitFor({ state: 'detached', timeout: 7000 }); checks++;
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'PRODUCT_GUIDE_BROWSER_PASS', pages: pages.length, widths: [1280, 390, 320], checks, errors }));
} finally { await browser.close(); }
