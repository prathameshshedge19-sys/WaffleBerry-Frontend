// Optional browser regression: node tests/sidebar-voice-ui.browser.mjs <playwright module> [screenshots] [web bundle directory]
// Uses only synthetic owner/visitor state. No production requests or credentials.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = process.argv[4] ? path.resolve(process.argv[4]) : path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const android = Boolean(process.argv[4]);
const { chromium } = await import(process.argv[2] ? pathToFileURL(path.resolve(process.argv[2])).href : 'playwright');
const artifacts = process.argv[3] && path.resolve(process.argv[3]);
if (artifacts) await mkdir(artifacts, { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const filename = path.resolve(root, '.' + pathname);
    if (!filename.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    let content = await readFile(filename);
    const extension = path.extname(filename);
    if (extension === '.html') {
      content = content.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<link\b[^>]*href="https:[^>]*>/gi, '');
    }
    res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript', '.js': 'text/javascript', '.svg': 'image/svg+xml' })[extension] || 'application/octet-stream' });
    res.end(content);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const results = [];
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  async function fixture({ width = 390, height = 640, role = 'owner', enabled = true, failure = 0, visitor = false, ready = false } = {}) {
    await page.setViewportSize({ width, height });
    await page.goto(`${origin}/${visitor ? 'legacy-chat' : 'chat'}.html`);
    await page.evaluate(({ role, enabled, failure, visitor, android, ready }) => {
      if (android) document.documentElement.dataset.legaryaPlatform = 'android';
      document.body.classList.add('drawer-open');
      document.querySelector('#journeySummary')?.removeAttribute('hidden');
      for (const id of ['openVisualPresence', 'openCollaborators', 'openLegacyAccess']) {
        const el = document.getElementById(id); if (el) el.hidden = role !== 'owner';
      }
      document.querySelector('#conversationListStatus').hidden = true;
      document.querySelector('#conversationList').innerHTML = Array.from({ length: 25 }, (_, index) =>
        `<div class="conversation-item"><button class="conversation-select" type="button">Saved conversation ${index + 1}</button></div>`).join('');
      const name = document.querySelector(visitor ? '#sidebarLegacyName' : '#activeLegacyName');
      if (name) name.textContent = 'Synthetic QA Legacy';
      window.__voiceRequests = []; window.__captureRequests = 0; window.__sessionEpoch = 1;
      window.__voiceEnabled = enabled; window.__voiceFailure = failure;
      window.__voiceReady = ready;
      window.__selectedLegacy = { id: 1, access_role: role, subject_name: 'Synthetic QA Legacy' };
      window.LegaryaWorkspace = { getActiveLegacy: () => window.__selectedLegacy };
      window.LegaryaAuthApi = {
        getSessionEpoch: () => window.__sessionEpoch,
        apiRequest: async (url, options = {}) => {
          window.__voiceRequests.push({ url, method: options.method || 'GET' });
          if (window.__voiceFailure) throw Object.assign(new Error('Synthetic unavailable server'), { status: window.__voiceFailure });
          return { exists: window.__voiceReady, revision: 1, current_available: window.__voiceReady,
            capabilities: { can_enroll: window.__voiceEnabled, message_playback: false },
            consent: { copy: 'Synthetic QA consent', copy_version: 'test', policy_version: 'test', copy_digest: 'a'.repeat(64) } };
        },
        authenticatedVoiceFetch: async () => { throw new Error('Unexpected upload'); }
      };
      window.LegaryaMicrophone = { capture: async () => { window.__captureRequests++; throw new Error('Unexpected microphone request'); } };
    }, { role, enabled, failure, visitor, android, ready });
    if (!visitor) await page.addScriptTag({ type: 'module', url: `${origin}/js/preserved-voice-settings.mjs` });
    await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().x >= 0);
  }
  for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 640 }, { width: 360, height: 560 }, { width: 667, height: 375 }]) {
    await fixture(viewport);
    const geometry = await page.evaluate(() => {
      const sidebar = document.querySelector('.sidebar'), list = document.querySelector('.conversation-list-scroll');
      return { historyHeight: list.clientHeight, historyOverflow: list.scrollHeight > list.clientHeight,
        sidebarOverflow: sidebar.scrollHeight > sidebar.clientHeight, sidebarScrollable: getComputedStyle(sidebar).overflowY,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth };
    });
    console.log(JSON.stringify({ android, viewport, geometry }));
    if (artifacts) await page.screenshot({ path: path.join(artifacts, `sidebar-${viewport.width}x${viewport.height}.png`) });
    assert.ok(geometry.historyHeight >= 120, 'Saved chat list must retain a usable height');
    assert.equal(geometry.historyOverflow, true);
    assert.equal(geometry.horizontalOverflow, false);
    assert.ok(!geometry.sidebarOverflow || ['auto', 'scroll'].includes(geometry.sidebarScrollable));
    await page.getByRole('button', { name: 'Saved conversation 25', exact: true }).click();
    await page.getByRole('button', { name: 'Saved conversation 1', exact: true }).click();
    results.push(`history ${viewport.width}x${viewport.height}`);
  }
  await fixture({ visitor: true, width: 360, height: 560 });
  await page.getByRole('button', { name: 'Saved conversation 25', exact: true }).click();
  assert.equal(await page.locator('#openPreservedVoice').count(), 0);
  results.push('visitor history retained, no owner control');
  for (const options of [{ enabled: false }, { failure: 404 }, { failure: 503 }]) {
    await fixture(options);
    await page.locator('#openPreservedVoice').click();
    await page.locator('[data-notice]').filter({ hasText: /not enabled|unavailable/i }).waitFor();
    assert.equal(await page.locator('[data-record]').isVisible(), false);
    assert.equal(await page.locator('[data-upload]').isEnabled(), false);
    assert.equal(await page.locator('[data-create]').isEnabled(), false);
    await page.evaluate(() => { document.querySelector('[data-record]').click(); document.querySelector('[data-create]').click(); });
    assert.equal(await page.evaluate(() => window.__captureRequests), 0);
    assert.equal(await page.evaluate(() => window.__voiceRequests.some(r => r.method !== 'GET')), false);
    if (artifacts && options.failure === 404) await page.screenshot({ path: path.join(artifacts, 'voice-unavailable.png') });
    await page.evaluate(() => { window.__voiceFailure = 0; window.__voiceEnabled = true; });
    await page.locator('[data-retry]').click();
    await page.locator('[data-record]').waitFor();
    assert.equal(await page.locator('[data-upload]').isEnabled(), true);
    results.push(`owner disabled ${JSON.stringify(options)}`);
  }
  await fixture();
  await page.locator('#openPreservedVoice').click();
  await page.locator('[data-record]').waitFor();
  await page.locator('[data-upload]').setInputFiles({ name: 'synthetic.wav', mimeType: 'audio/wav', buffer: Buffer.from('synthetic fixture, never uploaded') });
  await page.locator('[data-consented]').check();
  await page.locator('[data-authority]').selectOption('self');
  assert.equal(await page.locator('[data-create]').isEnabled(), true);
  assert.equal(await page.evaluate(() => window.__voiceRequests.some(r => r.method !== 'GET')), false);
  if (artifacts) await page.screenshot({ path: path.join(artifacts, 'voice-enabled.png') });
  await page.evaluate(() => { ++window.__sessionEpoch; window.dispatchEvent(new Event('legarya:session-ending')); });
  assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.equal(await page.locator('#openPreservedVoice').isVisible(), false);
  results.push('enabled owner can select recording and consent; session retirement closes and hides');
  await fixture({ ready: true, enabled: false });
  await page.locator('#openPreservedVoice').click();
  await page.locator('[data-delete]').waitFor();
  assert.equal(await page.locator('[data-replace]').isVisible(), false);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-delete]').click();
  await page.locator('[data-state]').filter({ hasText: 'Deletion queued' }).waitFor();
  assert.equal(await page.locator('[data-upload]').isEnabled(), false);
  assert.equal(await page.evaluate(() => window.__voiceRequests.filter(r => r.method === 'DELETE').length), 1);
  await page.evaluate(() => { window.__voiceReady = false; window.__voiceEnabled = true; });
  await page.locator('[data-retry]').click();
  await page.locator('[data-record]').waitFor();
  results.push('existing voice cleanup remains available with enrollment off; recheck restores current capabilities');
  await fixture();
  await page.evaluate(() => { window.LegaryaAuthApi.apiRequest = () => new Promise(resolve => { window.__lateProfile = resolve; }); });
  await page.locator('#openPreservedVoice').click();
  assert.equal(await page.locator('[data-upload]').isEnabled(), false);
  await page.evaluate(() => {
    window.__selectedLegacy = { id: 2, access_role: 'collaborator' };
    window.dispatchEvent(new CustomEvent('legarya-legacy-change', { detail: { legacy: window.__selectedLegacy } }));
    window.__lateProfile({ exists: false, current_available: false, capabilities: { can_enroll: true }, consent: { copy: 'Stale synthetic consent' } });
  });
  assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.equal(await page.locator('#openPreservedVoice').isVisible(), false);
  assert.equal(await page.locator('[data-upload]').isEnabled(), false);
  results.push('loading is capture-disabled and late responses cannot reopen a retired Legacy');
  for (const role of ['collaborator', 'visitor']) {
    await fixture({ role });
    assert.equal(await page.locator('#openPreservedVoice').isVisible(), false);
    assert.equal(await page.evaluate(() => window.__voiceRequests.length), 0);
    results.push(`${role} denied owner voice UI`);
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: results, pageErrors: errors }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
