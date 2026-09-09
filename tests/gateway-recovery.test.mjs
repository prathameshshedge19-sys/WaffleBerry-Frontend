import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../js/gateway.js',import.meta.url),'utf8');
const flush=()=>new Promise(r=>setImmediate(r));
function fixture(){
 class Element{
  constructor(){this.hidden=false;this.disabled=false;this.value='';this.open=false;this.listeners={};this.textContent='';}
  addEventListener(t,f){(this.listeners[t]??=[]).push(f);} emit(t){for(const f of this.listeners[t]||[])f({preventDefault(){}});}
  reset(){} focus(){} setAttribute(){} showModal(){this.open=true;} close(){this.open=false;this.emit('close');}
 }
 const nodes=new Map(),get=s=>{if(!nodes.has(s))nodes.set(s,new Element());return nodes.get(s);};
 const calls=[],events={},timers=new Map();let serial=0,join=()=>Promise.resolve({legacy_id:7});
 const window={addEventListener:(t,f)=>{const previous=events[t];events[t]=e=>{previous?.(e);f(e);};},setTimeout:(f)=>{const id=++serial;timers.set(id,f);return id;},clearTimeout:id=>timers.delete(id),LegaryaAuthApi:{
  ensureAuthenticated:async()=>({full_name:'QA'}),logout:async()=>{},apiRequest:(path,options)=>{calls.push({path,options});return path.endsWith('/join')?join():Promise.resolve({legacy_id:7,subject_name:'QA'});}
 }};
 const location={search:'',href:'gateway.html',replace(){}};
 const context=vm.createContext({window,document:{querySelector:get},location,URLSearchParams,AbortController,DOMException,requestAnimationFrame:f=>f(),sessionStorage:{setItem(){}},console});
 const asyncSource=readFileSync(new URL('../js/request-deadline.js',import.meta.url),'utf8');vm.runInContext(asyncSource,context);
 vm.runInContext(source,context);
 const preview=async()=>{get('#openLegacyJoin').emit('click');get('#legacyCode').value='LEG-AAAA-BBBB';get('#legacyJoinForm').emit('submit');await flush();};
 return{get,preview,location,calls,events,timers,setJoin:f=>join=f};
}
test('close/reopen during pending join restores Begin and fences old redirect',async()=>{
 const f=fixture();let resolve;f.setJoin(()=>new Promise(r=>resolve=r));await f.preview();
 f.get('#beginLegacyConversation').emit('click');await flush();assert.equal(f.get('#beginLegacyConversation').disabled,true);
 f.get('#closeLegacyJoin').emit('click');await f.preview();assert.equal(f.get('#beginLegacyConversation').disabled,false);
 resolve({legacy_id:99});await flush();assert.equal(f.location.href,'gateway.html');
 f.setJoin(()=>Promise.resolve({legacy_id:7}));f.get('#beginLegacyConversation').emit('click');await flush();assert.equal(f.location.href,'legacy-chat.html?legacy=7');
});
test('browser Back restoration cannot retain disabled Begin',async()=>{
 const f=fixture();await f.preview();f.get('#beginLegacyConversation').emit('click');await flush();
 f.events.pageshow?.({persisted:true});await f.preview();assert.equal(f.get('#beginLegacyConversation').disabled,false);
});
test('hung join times out visibly, allows retry, ignores late completion',async()=>{
 const f=fixture();let resolve;f.setJoin(()=>new Promise(r=>resolve=r));await f.preview();f.get('#beginLegacyConversation').emit('click');await flush();
 for(const fn of [...f.timers.values()])fn();await flush();assert.equal(f.get('#beginLegacyConversation').disabled,false);
 assert.match(f.get('#legacyJoinStatus').textContent,/timed out|too long/i);
 resolve({legacy_id:99});await flush();assert.equal(f.location.href,'gateway.html');
 f.setJoin(()=>Promise.resolve({legacy_id:7}));f.get('#beginLegacyConversation').emit('click');await flush();assert.equal(f.location.href,'legacy-chat.html?legacy=7');
});
test('rapid double click admits one join request',async()=>{
 const f=fixture();f.setJoin(()=>new Promise(()=>{}));await f.preview();f.get('#beginLegacyConversation').emit('click');f.get('#beginLegacyConversation').emit('click');await flush();
 assert.equal(f.calls.filter(c=>c.path.endsWith('/join')).length,1);f.get('#closeLegacyJoin').emit('click');await flush();
});
