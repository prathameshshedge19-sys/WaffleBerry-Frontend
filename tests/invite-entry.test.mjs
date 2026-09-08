import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../js/invite.js',import.meta.url),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(data,{previewError=null,acceptError=null}={}) {
  const elements=new Map(); const requests=[]; const destinations=[];
  class ApiError extends Error {constructor(status){super('Synthetic request failure');this.status=status;}}
  const document={querySelector(selector){if(!elements.has(selector))elements.set(selector,{hidden:true,textContent:'',addEventListener(type,fn){this[type]=fn;}});return elements.get(selector);}};
  const context=vm.createContext({URLSearchParams,document,location:{search:'?token=synthetic-only',replace:path=>destinations.push(path)},window:{LegaryaAuthApi:{ApiError,apiRequest:async(path,opts)=>{
    requests.push({path,method:opts.method||'GET'});
    const status=opts.method==='POST'?acceptError:previewError;
    if(status)throw new ApiError(status);
    return data;
  }}}});
  vm.runInContext(source,context);
  return {elements,requests,destinations};
}

for(const role of ['viewer','collaborator'])for(const status of ['pending','accepted']) {
  test(`${role} ${status}: opens only its authorized experience`,async()=>{
    const f=fixture({legacy_id:17,subject_name:'QA Legacy',role,status});await flush();
    await f.elements.get('#acceptInvite').click();
    assert.deepEqual(f.destinations,[`${role==='viewer'?'legacy-chat':'chat'}.html?legacy=17`]);
    assert.equal(f.requests.filter(x=>x.method==='POST').length,status==='accepted'?0:1);
    assert.equal(f.elements.get('#inviteBack').hidden,false);
  });
}
for(const status of [403,404,409,410])test(`unavailable invite ${status} does not navigate`,async()=>{
  const f=fixture({}, {previewError:status});await flush();
  assert.equal(f.elements.get('#inviteDetails').hidden,true);
  assert.deepEqual(f.destinations,[]);
});
test('signed-out recipient returns to the exact invitation through sign-in',async()=>{
  const f=fixture({}, {previewError:401});await flush();
  assert.deepEqual(f.destinations,['auth.html?mode=login&next=invite.html%3Ftoken%3Dsynthetic-only']);
});
test('interrupted acceptance leaves a retry instead of navigating',async()=>{
  const f=fixture({legacy_id:17,role:'viewer',status:'pending'},{acceptError:503});await flush();
  await f.elements.get('#acceptInvite').click();
  assert.equal(f.elements.get('#acceptInvite').disabled,false);assert.deepEqual(f.destinations,[]);
});
test('malformed destination cannot become an open redirect or another role',async()=>{
  const f=fixture({legacy_id:'https://example.test',role:'owner',status:'accepted'});await flush();
  assert.equal(f.elements.get('#inviteDetails').hidden,true);assert.deepEqual(f.destinations,[]);
});
