import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=name=>readFileSync(new URL(`../${name}`,import.meta.url),'utf8');
const owner=read('js/preserved-voice-settings.mjs');
const playback=read('js/voice-chat.js');
const auth=read('js/auth-api.js');
const bundle=read('tools/build-android-web.mjs');

test('owner preview is fixed-server text with bounded private playback',()=>{
  assert.match(owner,/Hear cloned preview/);
  assert.match(owner,/voice-profile\/preview/);
  assert.doesNotMatch(owner,/authoritative_text|preview_text\s*:/);
  assert.match(owner,/attempt<40/);
  assert.match(owner,/authenticatedVoiceFetch\(`\/voice-synthesis\/jobs\/\$\{job\.job_id\}\/content`/);
  assert.match(owner,/URL\.revokeObjectURL\(previewUrl\)/);
  for(const fence of ['legarya-legacy-change','legarya:session-ending','pagehide','visibilitychange'])assert.match(owner,new RegExp(fence));
});

test('Legacy messages use server-selected preserved speech and same-message fallback',()=>{
  assert.match(playback,/scope\?\.mode === "legacy"/);
  assert.match(playback,/legacy-conversations\/\$\{scope\.conversationId\}\/messages\/\$\{messageId\}\/speech/);
  assert.match(playback,/standard_fallback=true/);
  assert.match(playback,/job\.fallback_available/);
  assert.match(playback,/attempt < 40/);
  assert.match(playback,/transientPlaybackUrl/);
  assert.match(playback,/URL\.revokeObjectURL\(transientPlaybackUrl\)/);
  assert.match(playback,/Preserved AI voice/);
  assert.match(playback,/Standard AI voice/);
  assert.doesNotMatch(playback,/voice_profile_id|profile_version_id|reference_asset_id|object_key|IndicF5/);
});

test('Rya keeps the existing L12 path and private generated fetch is exact-scope',()=>{
  assert.match(playback,/play\(button, "\/voice\/synthesize"/);
  assert.match(playback,/__legacy_preserved__/);
  assert.match(auth,/generated = new RegExp/);
  assert.match(auth,/validGenerated/);
  assert.match(auth,/redirect: "error", cache: "no-store"/);
  assert.match(bundle,/"voice-chat\.js"/);
  assert.match(bundle,/"preserved-voice-settings\.mjs"/);
});
