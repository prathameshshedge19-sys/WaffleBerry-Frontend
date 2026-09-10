import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('homepage explicitly declares a stable, square 192px PNG favicon',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/<link rel="icon" href="\/icon-192\.png" type="image\/png" sizes="192x192"\s*\/>/);
  const png=await readFile(new URL('../icon-192.png',import.meta.url));
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16),192);
  assert.equal(png.readUInt32BE(20),192);
  const robots=await readFile(new URL('../robots.txt',import.meta.url),'utf8');
  assert.match(robots,/User-agent: \*\s+Allow: \//);
  assert.match(html,/<meta name="robots" content="index, follow"/);
});
