import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('both message transports identify a user submission for server deduplication', () => {
  for (const name of ['chat.js', 'legacy-chat.js']) {
    const code = readFileSync(new URL('../js/' + name, import.meta.url), 'utf8');
    assert.match(code, /client_turn_id:\s*crypto\.randomUUID\(\)/);
  }
});

test('auth retry keeps the same request body and hence the same turn identity', () => {
  const code = readFileSync(new URL('../js/auth-api.js', import.meta.url), 'utf8');
  assert.match(code, /streamRequest\(path, \{ method, body, authenticated, signal, retry: false \}\)/);
});
