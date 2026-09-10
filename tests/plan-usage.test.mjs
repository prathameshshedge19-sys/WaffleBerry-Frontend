import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {planCopy, registerPlanCopy} from '../js/plan-copy.mjs';
import {formatCallTime,formatBytes} from '../js/plan-usage.mjs';
import {liveVoiceError} from '../js/live-voice-policy.mjs';
test('usage formatting keeps fractional billing out of the display',()=>{
 assert.equal(formatCallTime(59999),'0:59');assert.equal(formatCallTime(600000),'10:00');
 assert.equal(formatBytes(100000000),'100.0 MB');assert.equal(formatBytes(1000000000),'1.00 GB');
});
for(const [index,code] of ['de','fr','hi','mr'].entries())test(`${code}: every plan label preserves its parameter slots`,()=>{
 const slots=text=>(text.match(/\{\d+\}/g)||[]).sort();
 for(const [source,values] of Object.entries(planCopy)) {assert.ok(values[index]);assert.deepEqual(slots(source),slots(values[index]));if(['hi','mr'].includes(code))assert.match(values[index],/[\u0900-\u097f]/,source);}
});
test('plan copy supplements the existing language catalogs',()=>{
 const registered=[];registerPlanCopy({register:(...args)=>registered.push(args)});assert.equal(registered.length,4);assert.equal(registered[0][0],'de');
});
test('call limit errors have actionable quota wording, not connection errors',()=>{
 for(const key of ['code','kind'])assert.match(liveVoiceError({[key]:'plan_limit_reached'}),/midnight UTC/);
 assert.match(liveVoiceError({kind:'plan_check_unavailable'}),/no allowance was used/);
});
test('all post-login experiences load versioned optional usage UI',async()=>{
 for(const name of ['gateway','chat','legacy-chat']){const html=await readFile(new URL(`../${name}.html`,import.meta.url),'utf8');assert.match(html,/js\/plan-usage.mjs\?v=plans1/);assert.match(html,/js\/auth-api.js\?v=plans1/);assert.match(html,/js\/i18n.js\?v=plans1/);}
});
test('blocked submissions retain their draft in both experiences',async()=>{
 for(const name of ['chat','legacy-chat']){const source=await readFile(new URL(`../js/${name}.js`,import.meta.url),'utf8');assert.match(source,/plan_limit_reached/);assert.match(source,/input.value\s*=\s*content/);}
});
test('live quota warnings and guidance never share a hidden portrait-status element',async()=>{
 const source=await readFile(new URL('../js/live-voice.mjs',import.meta.url),'utf8');
 assert.match(source,/data-live-quota-warning/);assert.match(source,/warning.hidden = false/);
 assert.match(source,/help = find\("\[data-live-guidance\]"\)/);
 assert.match(source,/find\('\[data-live-quota-warning\]'\).hidden=true/);
});
