import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = path.join(root, 'dist', 'web');
async function list(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) result.push(...await list(path.join(directory, entry.name), relative + '/'));
    else result.push(relative);
  }
  return result.sort();
}

test('static release publishes only product assets, preserves bytes and resolves HTML dependencies', async () => {
  execFileSync(process.execPath, ['tools/build-static-web.mjs'], { cwd: root, env: process.env });
  const files = await list(output);
  const tracked = new Set(execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0'));
  for (const file of files) {
    assert.ok(tracked.has(file), `Untracked file must not ship: ${file}`);
    assert.doesNotMatch(file, /^(?:android|mobile|tools|tests|docs|node_modules|dist)\//);
    assert.doesNotMatch(file, /(?:^|\/)(?:\.|package|capacitor|vercel|server\.mjs|realtime-dev)/);
    assert.deepEqual(await readFile(path.join(output, file)), await readFile(path.join(root, file)), file);
  }
  for (const file of files.filter(name => name.endsWith('.html'))) {
    const html = await readFile(path.join(output, file), 'utf8');
    for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
      const reference = match[1].split(/[?#]/)[0];
      if (!reference || /^(?:[a-z]+:|\/\/)/i.test(reference)) continue;
      const asset = path.posix.normalize(path.posix.join(path.posix.dirname(file), reference.replace(/^\//, '')));
      if (asset === '.') continue;
      assert.ok(files.includes(asset), `${file} references missing ${asset}`);
    }
  }
  const config = JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8'));
  assert.equal(config.outputDirectory, 'dist/web');
  assert.equal(config.installCommand, '');
  assert.equal(config.buildCommand, 'node tools/build-static-web.mjs');
  assert.equal(config.rewrites[0].destination, 'https://89-167-14-211.sslip.io/api/v1/:path*');
});

test('compatible release keeps standard playback and realtime on the existing backend contract', async () => {
  const voice = await readFile(path.join(root, 'js/voice-chat.js'), 'utf8');
  const live = await readFile(path.join(root, 'js/live-voice.mjs'), 'utf8');
  assert.doesNotMatch(voice, /voice-synthesis|messages\/\$\{[^}]+\}\/speech/);
  assert.doesNotMatch(live, /preserved_live|preserved_voice_capabilities|preservedVoiceCapabilities/);
  assert.match(await readFile(path.join(root, 'chat.html'), 'utf8'), /Upload or record a voice/);
});
