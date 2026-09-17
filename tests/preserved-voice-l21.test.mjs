import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=name=>readFileSync(new URL(`../${name}`,import.meta.url),'utf8');
const html=read('chat.html'),ui=read('js/preserved-voice-settings.mjs');
const auth=read('js/auth-api.js'),mic=read('js/microphone-ownership.js');
const native=read('android/app/src/main/java/com/waffleberry/legarya/TrustedRequestPolicy.java');
const activity=read('android/app/src/main/java/com/waffleberry/legarya/MainActivity.java');
const manifest=read('android/app/src/main/AndroidManifest.xml');

test('owner-only Preserved Voice surface has explicit consent and bounded clone preview',()=>{
  assert.match(html,/id="openPreservedVoice"[^>]+hidden/);
  assert.match(html,/preserved-voice-settings\.mjs/);
  assert.match(ui,/legacy\.access_role!==['"]owner['"]/);
  assert.match(ui,/value\.capabilities\?\.can_enroll/);
  assert.match(ui,/data-consented type="checkbox"/);
  assert.match(ui,/presented_copy_digest:profile\.consent\.copy_digest/);
  assert.match(ui,/Hear cloned preview/);
  assert.match(ui,/voice-profile\/preview/);
  assert.match(ui,/attempt<40/);
  assert.match(ui,/URL\.revokeObjectURL/);
  assert.doesNotMatch(ui,/IndicF5Provider|authoritative_text|voice_profile_id/);
});

test('record and upload use bounded reviewed media and shared microphone ownership',()=>{
  for(const type of ['audio/wav','audio/mpeg','audio/mp4','audio/x-m4a','audio/webm','audio/ogg','video/mp4','video/webm'])assert.match(ui,new RegExp(type.replace('/','\\/')));
  assert.match(ui,/MAX_BYTES=20\*1024\*1024/);
  assert.match(ui,/MAX_RECORDING_MS=120000/);
  assert.match(ui,/LegaryaMicrophone\.capture[\s\S]+owner:'enrollment'/);
  assert.match(mic,/\["l12", "l15", "enrollment"\]/);
  assert.match(mic,/navigator\.locks\.request\("legarya-microphone"/);
});

test('polling and mutation are fenced by account, Legacy, generation and lifecycle',()=>{
  assert.match(ui,/token===generation&&auth\.getSessionEpoch/);
  assert.match(ui,/workspace\(\)\?\.id===legacy\?\.id/);
  assert.match(ui,/scopeAbort\?\.abort/);
  assert.match(ui,/candidate_version_id/);
  assert.match(ui,/candidate_binding_digest/);
  assert.match(ui,/legarya:session-ending/);
  assert.match(ui,/legarya:android-sensitive-stop/);
  assert.match(ui,/legarya-legacy-change/);
  assert.match(ui,/data-replace/);
  assert.match(ui,/current_available&&!profile\?\.candidate_lifecycle/);
  assert.match(ui,/expected_revision=\$\{profile\.revision\}/);
  assert.match(ui,/profile=null;find\('\[data-subject\]'\)[\s\S]+find\('\[data-state\]'\)\.textContent='Loading preserved voice…'/);
});

test('voice upload fetch cannot accept arbitrary paths or expose object keys',()=>{
  assert.match(auth,/authenticatedVoiceFetch/);
  assert.match(auth,/voice-profile\/enrollments\/\$\{uuid\}\/content/);
  assert.match(auth,/validUpload/);
  assert.match(auth,/validGenerated/);
  assert.doesNotMatch(ui,/object_key|storage_bucket|encryption_key/);
});

test('Android picker is exact-scope SAF without broad media or storage permission',()=>{
  assert.match(activity,/TrustedRequestPolicy\.isAllowedVoicePicker/);
  assert.match(activity,/Intent\.ACTION_OPEN_DOCUMENT/);
  assert.match(activity,/Intent\.EXTRA_MIME_TYPES, TrustedRequestPolicy\.VOICE_PICKER_TYPES/);
  assert.match(activity,/!"content"\.equals\(uri\.getScheme\(\)\)/);
  assert.match(activity,/VOICE_PICKER_TYPES\.contains\(mime\)/);
  assert.match(native,/VOICE_PICKER_TYPES/);
  assert.match(native,/requested\.equals\(VOICE_PICKER_TYPES\)/);
  assert.match(native,/MICROPHONE_OWNERS = Set\.of\("l12", "l15", "enrollment"\)/);
  assert.doesNotMatch(manifest,/android\.permission\.(READ_MEDIA_AUDIO|READ_MEDIA_VIDEO|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|CAMERA)/);
});
