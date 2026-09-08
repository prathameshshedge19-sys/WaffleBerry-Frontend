import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../chat.html',import.meta.url),'utf8');
const settings=readFileSync(new URL('../js/visual-presence-settings.mjs',import.meta.url),'utf8');
test('face recreation entry and dialog use the requested plain-language name',()=>{
  assert.match(html,/id="openVisualPresence"[^>]*>[\s\S]*?<span>Recreate Legacy's Face<\/span><\/button>/);
  assert.match(settings,/<h2 id="visualTitle">Recreate Legacy's Face<\/h2>/);
  assert.match(settings,/aria-label="Close Recreate Legacy's Face"/);
  assert.match(html,/visual-presence-settings\.mjs\?v=face1/);
});
test('preparation instructions sit next to the button without an identity gate',()=>{
  assert.match(settings,/data-generate aria-describedby="visualPrepareHelp"/);
  assert.match(settings,/id="visualPrepareHelp" data-prepare-help/);
  assert.match(settings,/Identity setup is not required/);
  assert.doesNotMatch(settings,/setup_status|Finish this Legacy/);
  assert.match(settings,/!capabilities\?\.can_prepare/);
  assert.match(settings,/!find\("\[data-confirm\]"\)\.checked/);
  assert.match(settings,/Nothing is shown to visitors until you approve this exact preview/);
});
