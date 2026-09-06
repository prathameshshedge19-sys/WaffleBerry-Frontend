import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { liveVoiceAvailability, liveVoiceError, liveWebsocketUrl } from "../js/live-voice-policy.mjs";
import { RealtimeClient } from "../js/realtime-client.mjs";
import { PCMResampler } from "../js/realtime-pcm.mjs";

const supported = { isSecureContext: true, AudioContext: class {}, AudioWorkletNode: class {},
  navigator: { mediaDevices: { getUserMedia() {} }, locks: {} }, WebSocket: class {}, HTMLDialogElement: class {} };
const ready = { legacyId: 1, ready: true, busy: false };
test("entry requires feature, usable Legacy, idle chat and browser capabilities", () => {
  assert.equal(liveVoiceAvailability(ready, true, supported), "");
  for (const [context, enabled, env] of [[ready, false, supported], [{...ready,ready:false},true,supported],
    [{...ready,legacyId:null},true,supported],[{...ready,busy:true},true,supported],[ready,true,{...supported,AudioWorkletNode:null}]]) {
    assert.notEqual(liveVoiceAvailability(context, enabled, env), "");
  }
});
test("normal users never see arbitrary provider error details", () => {
  for (const error of [{message:"sk-secret provider internals"},{status:503,detail:"SQL password"},{status:401},{status:403},
    {name:"NotFoundError"},{name:"NotReadableError"},{name:"NotAllowedError"}]) {
    const text=liveVoiceError(error); assert.ok(text.length); assert.doesNotMatch(text,/sk-secret|SQL|provider internals/);
  }
});
test("hosted call uses direct secure backend; local call keeps local API host", () => {
  assert.equal(liveWebsocketUrl({apiBaseUrl:"/api/v1"},{hostname:"www.waffleberry.app",href:"https://www.waffleberry.app/chat.html"}),"wss://89-167-14-211.sslip.io/api/v1/realtime/connect");
  assert.equal(liveWebsocketUrl({apiBaseUrl:"http://127.0.0.1:8100/api/v1"},{hostname:"127.0.0.1",href:"http://127.0.0.1:5500/chat.html"}),"ws://127.0.0.1:8100/api/v1/realtime/connect");
});
test("expired and revoked calls give actionable bounded product messages", () => {
  assert.match(liveVoiceError({code:"realtime_session_expired"}),/time limit/);
  assert.match(liveVoiceError({code:"realtime_access_changed"}),/access.*changed/);
  assert.match(liveVoiceError({code:"realtime_setup_incomplete"}),/identity setup/);
});
test("mute disables capture tracks and clears worklet input at both boundaries", () => {
  const sent=[], events=[], track={enabled:true};
  const client=new RealtimeClient({api(){},websocketUrl:"ws://localhost:8100/api/v1/realtime/connect",
    environment:{location:{href:"http://localhost:5500"},clearInterval(){}},onEvent:e=>events.push(e)});
  client.stream={getAudioTracks:()=>[track]};client.worklet={port:{postMessage:e=>sent.push(e)}};
  client.setMuted(true);assert.equal(track.enabled,false);client.setMuted(false);assert.equal(track.enabled,true);
  assert.deepEqual(sent,[{type:"mute",muted:true},{type:"mute",muted:false}]);assert.equal(events.length,2);
});
test("muted worklet sends silence and never triggers barge-in or replays buffered speech", () => {
  const events=[];let Processor;
  const source=fs.readFileSync(new URL("../js/realtime-worklet.js",import.meta.url),"utf8").replace(/^import.*\n/,"");
  vm.runInNewContext(source,{PCMResampler,Float32Array,sampleRate:48000,AudioWorkletProcessor:class{constructor(){this.port={postMessage:e=>events.push(e)}}},registerProcessor:(_,p)=>{Processor=p}});
  const worklet=new Processor();worklet.port.onmessage({data:{type:"mute",muted:true}});
  for(let i=0;i<200;i++){worklet.process([[new Float32Array(128).fill(.5)]]);worklet.port.onmessage({data:"ack"});}
  assert.equal(events.filter(e=>e.type==="speech_started").length,0);
  const frames=events.filter(e=>e.type==="pcm");assert.ok(frames.length>5);
  assert.ok(frames.every(e=>new Int16Array(e.pcm).every(n=>n===0)));
  events.length=0;worklet.port.onmessage({data:{type:"mute",muted:false}});
  for(let i=0;i<100;i++){worklet.process([[new Float32Array(128)]]);worklet.port.onmessage({data:"ack"});}
  assert.ok(events.filter(e=>e.type==="pcm").every(e=>new Int16Array(e.pcm).every(n=>n===0)));
});
test("reconnect microphone resumes only through explicit fresh capture", async () => {
  const client=new RealtimeClient({api(){},websocketUrl:"ws://localhost:8100/api/v1/realtime/connect",environment:{location:{href:"http://localhost:5500"}}});
  let captures=0,attaches=0;client.acquireMicrophone=async()=>{captures++};client.attachCapture=async()=>{attaches++};
  await client.resumeCapture();assert.equal(captures,0);
  client.state="connected";await client.resumeCapture();assert.equal(captures,1);assert.equal(attaches,1);
  client.stream={};await client.resumeCapture();assert.equal(captures,1);
});
test("both production pages keep separate live and L12 entries and no developer links", () => {
  for(const name of ["chat.html","legacy-chat.html"]){
    const html=fs.readFileSync(new URL(`../${name}`,import.meta.url),"utf8");
    assert.equal((html.match(/id="startVoiceConversation"/g)||[]).length,1);
    assert.equal((html.match(/id="microphoneButton"/g)||[]).length,1);
    assert.match(html,/type="module" src="js\/live-voice.mjs/);
    assert.doesNotMatch(html,/realtime-dev|l15-mic@example/);
  }
});

function builderAdapter() {
  const source=fs.readFileSync(new URL("../js/chat.js",import.meta.url),"utf8");
  const state={selectedLegacyId:1,activeConversationId:null,navigationVersion:0,
    activateConversation(id,legacy){assert.equal(legacy,this.selectedLegacyId);this.activeConversationId=id}};
  const rows=[],stored=new Map();let requests=0,resolve;
  const env={window:{},chatSession:state,activeLegacy:()=>({setup_status:"active"}),sending:false,preparingSend:false,
    localStorage:{setItem:(k,v)=>stored.set(k,v)},STORAGE_KEYS:{ACTIVE_CONVERSATION_ID:"cid"},
    apiRequest:()=>{requests++;return new Promise(r=>{resolve=r})},messages:{replaceChildren:()=>{rows.length=0}},
    hideEmptyState(){},addMessage:(...args)=>rows.push(args),fetchConversations:async()=>{},CustomEvent:class{}};
  env.window.dispatchEvent=()=>{};
  vm.runInNewContext(source.slice(source.indexOf("  window.LegaryaLiveChat ="),source.lastIndexOf('  composer.addEventListener("submit", (event) => {')),env);
  return {adapter:env.window.LegaryaLiveChat,state,rows,stored,get requests(){return requests},resolve:(value)=>resolve(value)};
}
test("opening an unsaved live chat creates nothing; accepted transcript binds its server id once", () => {
  const h=builderAdapter(),snapshot=h.adapter.context();assert.equal(h.requests,0);assert.equal(snapshot.conversationId,null);
  const event={conversation_id:7,legacy_id:1,mode:"rya"};assert.equal(h.adapter.accept(snapshot,event),true);
  assert.equal(h.adapter.accept(snapshot,event),true);assert.equal(h.state.activeConversationId,7);assert.equal(h.requests,0);
  assert.equal(h.adapter.accept(snapshot,{...event,conversation_id:8}),false);
});
test("navigation fences both late live admission and delayed saved-history refresh",async()=>{
  const h=builderAdapter(),snapshot=h.adapter.context();
  const pending=h.adapter.refresh(snapshot,7);h.state.navigationVersion++;
  h.resolve([{role:"assistant",content:"old chat",id:1}]);await pending;
  assert.equal(h.rows.length,0);assert.equal(h.state.activeConversationId,null);
  assert.equal(h.adapter.accept(snapshot,{conversation_id:7,legacy_id:1,mode:"rya"}),false);
});
