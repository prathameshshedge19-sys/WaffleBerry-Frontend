import test from 'node:test';
import assert from 'node:assert/strict';
import {visualError} from '../js/visual-presence-client.mjs';

test('temporary service backpressure does not claim a daily preparation quota',()=>{
  assert.match(visualError({status:429}),/temporarily busy/);
  assert.doesNotMatch(visualError({status:429}),/limit|today|daily/);
});
test('cleanup backpressure gives a specific retry explanation',()=>{
  const message=visualError({status:409,details:{detail:{code:'visual_cleanup_pending'}}});
  assert.match(message,/securely removed/);
  assert.match(message,/photo is saved/);
  assert.doesNotMatch(message,/Legacy changed|limit/);
});
