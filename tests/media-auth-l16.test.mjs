import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/auth-api.js', import.meta.url), 'utf8');
const path = '/legacies/1/sources/source-1/content';
function setup(mediaBaseUrl = 'https://89-167-14-211.sslip.io/api/v1') {
  const calls = [];
  let transfers = 0;
  const raw = { status: 200, ok: true, blob: async () => new Blob(['private original']) };
  const context = {
    window: { LEGARYA_AUTH_CONFIG: { apiBaseUrl: '/api/v1', mediaBaseUrl } }, Headers,
    localStorage: { removeItem() {}, setItem() {} },
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/auth/refresh')) return { status: 200, ok: true, text: async () => JSON.stringify({ access_token: 'refreshed-token', token_type: 'bearer', user: { id: 1 } }) };
      transfers++;
      return transfers === 1 ? { status: 401, ok: false } : raw;
    },
  };
  vm.runInNewContext(source, context);
  const api = context.window.LegaryaAuthApi;
  api.storeAuthenticatedSession({ access_token: 'initial-token', token_type: 'bearer', user: { id: 1 } });
  return { api, calls, raw };
}

test('private raw transfer refreshes on the same-origin API and preserves its body', async () => {
  const { api, calls, raw } = setup();
  const body = new Uint8Array([0, 1, 255]);
  assert.equal(await api.authenticatedMediaFetch(path, { method: 'PUT', body }), raw);
  assert.deepEqual(calls.map((c) => c.url), ['https://89-167-14-211.sslip.io/api/v1' + path, '/api/v1/auth/refresh', 'https://89-167-14-211.sslip.io/api/v1' + path]);
  assert.equal(calls[2].options.body, body);
  assert.equal(calls[2].options.headers.get('Authorization'), 'Bearer refreshed-token');
});

test('source tokens cannot be sent to an arbitrary configured origin', () => {
  const { api, calls } = setup('https://unapproved.example/api/v1');
  assert.throws(() => api.authenticatedMediaFetch(path), /not configured/);
  assert.equal(calls.length, 0);
});

test('source transfers reject paths outside the authorized content contract', () => {
  const { api, calls } = setup();
  for (const invalid of ['/auth/me', path + '?redirect=external', '/legacies/1/sources/../content', 'https://unapproved.example']) {
    assert.throws(() => api.authenticatedMediaFetch(invalid), /Invalid source request/);
  }
  assert.equal(calls.length, 0);
});

test('ordinary authenticated fetch still uses the existing API origin', async () => {
  const { api, calls } = setup();
  await api.authenticatedFetch('/voice', { method: 'POST' });
  assert.ok(calls.every((c) => c.url.startsWith('/api/v1/')));
});
