import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../chat.html',import.meta.url),'utf8');
const settings=readFileSync(new URL('../js/visual-presence-settings.mjs',import.meta.url),'utf8');
test('face recreation entry and dialog use the requested plain-language name',()=>{
  assert.match(html,/id="openVisualPresence"[^>]*>[\s\S]*?<span>Recreate Legacy's Face<\/span><\/button>/);
  assert.match(settings,/<h2 id="visualTitle">Recreate Legacy's Face<\/h2>/);
  assert.match(settings,/aria-label="Close Recreate Legacy's Face"/);
  assert.match(html,/visual-presence-settings\.mjs\?v=face3/);
});
test('upload automatically prepares a private preview with explicit permission and separate approval',()=>{
  assert.match(settings,/aria-describedby="visualPermission"/);
  assert.match(settings,/By selecting a photo or clicking Regenerate, I confirm I have permission/);
  assert.match(settings,/Identity setup is not required/);
  assert.doesNotMatch(settings,/setup_status|Finish this Legacy/);
  assert.match(settings,/!capabilities\?\.can_prepare/);
  assert.match(settings,/await prepare\(token\)/);
  assert.match(settings,/receipt\.version_id!==candidate\?\.id/);
  assert.match(settings,/Only an approved preview becomes the Legacy's face/);
  assert.doesNotMatch(settings,/data-(generate|toggle|replace|source|view-current|confirm|refresh)\b/);
  assert.match(settings,/data-regenerate/);
  assert.match(settings,/if\(busy\)\{queuedFile=file;return;\}/);
});
