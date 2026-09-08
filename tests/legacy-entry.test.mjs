import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../js/legacy-chat.js',import.meta.url),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(failure=0) {
  class Element {
    constructor(){this.hidden=false;this.value='';this.style={};this.children=[];this.classList={toggle(){},add(){},remove(){}};}
    addEventListener(type,fn){(this.listeners??={})[type]=fn;}
    querySelector(){return new Element();}
    append(...nodes){this.children.push(...nodes);}
    replaceChildren(){this.children=[];}
    after(node){this.afterNode=node;}
    setAttribute(){} focus(){}
  }
  const elements=new Map();const redirects=[];const timers=[];
  const get=selector=>{if(!elements.has(selector))elements.set(selector,new Element());return elements.get(selector);};
  const context=vm.createContext({URLSearchParams,Event,AbortController,location:{search:'?legacy=765',replace:path=>redirects.push(path)},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    document:{querySelector:get,createElement:()=>new Element(),body:new Element()},window:{dispatchEvent(){},setTimeout:fn=>timers.push(fn),LegaryaMarkdown:{render:(node,text)=>{node.textContent=text;}},LegaryaAuthApi:{
      ensureAuthenticated:async()=>{if(failure===401){const error=new Error();error.status=401;throw error;}return {full_name:'QA Visitor',email:'qa@example.test'};},
      apiRequest:async path=>{
        if(path.includes('/visitor-profile')){if(failure){const error=new Error();error.status=failure;failure=0;throw error;}return {profile:null,greeting:'QA greeting'};}
        if(path.endsWith('/identity'))return {subject_name:'this Legacy'};
        return [];
      },
    }}});
  vm.runInContext(source,context);
  return {context,get,redirects,timers};
}
test('successful first entry opens an unnamed Legacy without setup',async()=>{
  const f=fixture();await flush();
  assert.equal(f.context.window.LegaryaLiveChat.context().ready,true);
  assert.equal(f.get('#messageInput').disabled,false);assert.deepEqual(f.redirects,[]);
});
test('temporary bootstrap failure stays on the chat and retry succeeds',async()=>{
  const f=fixture(503);await flush();
  assert.equal(f.context.window.LegaryaLiveChat.context().ready,false);
  assert.equal(f.get('#messageInput').disabled,true);assert.equal(f.get('#sendButton').disabled,true);
  assert.equal(f.get('#emptyState').hidden,true,'empty-state overlay must not intercept Retry');
  const retry=f.get('#chatStatus').afterNode;assert.equal(retry.hidden,false);
  assert.deepEqual(f.redirects,[]);assert.deepEqual(f.timers,[]);
  await retry.listeners.click();await flush();
  assert.equal(f.context.window.LegaryaLiveChat.context().ready,true);
  assert.equal(f.get('#messageInput').disabled,false);assert.equal(retry.hidden,true);
});
test('expired session explains sign-in without falsely claiming invalid invitation',async()=>{
  const f=fixture(401);await flush();
  assert.match(f.get('#chatStatus').textContent,/sign in again/i);
  assert.equal(f.get('#messageInput').disabled,true);assert.deepEqual(f.redirects,[]);
});
for(const status of [403,404])test(`authorization failure ${status} stays fail-closed`,async()=>{
  const f=fixture(status);await flush();
  assert.equal(f.context.window.LegaryaLiveChat.context().ready,false);
  assert.equal(f.get('#chatStatus').afterNode.hidden,true);
  assert.equal(f.get('#messageInput').disabled,true);
  f.timers.forEach(fn=>fn());assert.deepEqual(f.redirects,['gateway.html']);
});
