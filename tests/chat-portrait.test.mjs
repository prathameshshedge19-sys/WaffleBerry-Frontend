import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {installChatPortrait} from '../js/legacy-chat-portrait.mjs';

function fixture(){
 const stage={hidden:true},host={replaceChildren(){}},status={};
 const document=new EventTarget();document.hidden=false;document.querySelector=id=>({'#legacyChatFace':stage,'#legacyChatFaceImage':host,'#legacyChatFaceStatus':status})[id];
 const environment=new EventTarget();environment.document=document;
 let state={legacyId:7,mode:'legacy',name:'QA',ready:true,live:false},account=1;
 environment.LegaryaLiveChat={context:()=>state};environment.LegaryaAuthApi={getSessionEpoch:()=>account};
 const instances=[];
 const dispose=installChatPortrait({environment,document,client:{},rendererFactory(){},createPresence:options=>{
   const instance={options,disposed:false,start:async()=>options.onState('IDLE'),dispose(){this.disposed=true;}};instances.push(instance);return instance;
 }});
 return {stage,instances,environment,document,dispose,set:update=>{state={...state,...update};environment.dispatchEvent(new Event('legarya:chat-context'));},logout(){account++;environment.dispatchEvent(new Event('legarya:session-ending'));}};
}
test('approved chat portrait mounts automatically and repeated context events do not reload',()=>{
 const f=fixture();assert.equal(f.stage.hidden,false);assert.equal(f.instances.length,1);f.set({});assert.equal(f.instances.length,1);assert.equal(f.instances[0].options.version,undefined);f.dispose();
});
test('chat yields the portrait to a live call and restores after it closes',()=>{
 const f=fixture();f.set({live:true});assert.equal(f.stage.hidden,true);assert.equal(f.instances[0].disposed,true);assert.equal(f.instances[0].options.guard(),false);f.set({live:false});assert.equal(f.instances.length,2);assert.equal(f.stage.hidden,false);f.dispose();
});
test('scope changes, hidden page and logout synchronously retire private portraits',()=>{
 const f=fixture();f.set({legacyId:8});assert.equal(f.instances[0].options.guard(),false);assert.equal(f.instances[0].disposed,true);
 f.document.hidden=true;f.document.dispatchEvent(new Event('visibilitychange'));assert.equal(f.stage.hidden,true);
 f.document.hidden=false;f.document.dispatchEvent(new Event('visibilitychange'));assert.equal(f.stage.hidden,false);
 f.logout();assert.equal(f.stage.hidden,true);assert.equal(f.instances.at(-1).disposed,true);
 const count=f.instances.length;f.set({});assert.equal(f.instances.length,count,'late chat events after logout cannot restart a private face');f.dispose();
});
test('live UI defaults to motion without a manual static-photo switch',async()=>{
 const source=await readFile(new URL('../js/live-voice.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/data-live-static|Show static photo/);assert.match(source,/data-live-portrait-status/);
});
