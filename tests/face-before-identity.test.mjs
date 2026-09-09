import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../chat.html',import.meta.url),'utf8');
const settings=readFileSync(new URL('../js/display-picture-settings.mjs',import.meta.url),'utf8');
test('Legacy photo replaces face recreation in the active product',()=>{
  assert.ok(html.includes('<span>Legacy photo</span>'));
  assert.ok(html.includes('display-picture-settings.mjs?v=dp1'));
  assert.ok(!html.includes('visual-presence-settings.mjs'));
  assert.ok(settings.includes('<h2 id="pictureTitle">Legacy photo</h2>'));
});
test('upload automatically selects validated picture without identity, crop or generation',()=>{
  assert.match(settings,/Identity setup is not required/);
  assert.match(settings,/permission to share/);
  assert.match(settings,/waitForVisualSource/);
  assert.match(settings,/await client.select/);
  assert.doesNotMatch(settings,/setup_status|data-(approve|regenerate|framing)|mountCropControls|createPortraitRenderer/);
});
