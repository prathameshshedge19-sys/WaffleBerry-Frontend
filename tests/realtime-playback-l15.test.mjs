import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import { RealtimePlayback } from "../js/realtime-playback.mjs";
import { RealtimeClient } from "../js/realtime-client.mjs";

const binding = { session_id: "session", generation: 1, turn_id: 1, active_generation_id: "claim", response_id: "resp" };
function harness() {
  const events=[],states=[],sources=[],timers=new Map(); let serial=0;
  const context={ currentTime:0,state:"running",outputLatency:.1,baseLatency:0,destination:{},
    createBuffer(channels,count,rate) { return { duration:count/rate,getChannelData:()=>new Float32Array(count) }; },
    createBufferSource() { const node={ connect(){},disconnect(){},start(t){this.startTime=t;},stop(){this.stopped=true;} };sources.push(node);return node; },
  };
  const environment={ atob:(s)=>Buffer.from(s,"base64").toString("binary"),
    setTimeout(fn,delay){const id=++serial;timers.set(id,{fn,time:context.currentTime+delay/1000});return id;},
    clearTimeout(id){timers.delete(id);},
  };
  const playback=new RealtimePlayback({context,environment,send:(e)=>events.push(e),onState:(s)=>states.push(s),onFault:(s)=>{states.push(s);playback.clear();}});
  function advance(t) {
    context.currentTime=t;
    for(const [id,item] of [...timers]) if(item.time<=t){timers.delete(id);item.fn();}
  }
  playback.begin(binding);
  const frame=(sequence=0,extra={})=>playback.frame({...binding,sequence,pcm:Buffer.alloc(2400).toString("base64"),...extra});
  return {playback,events,states,sources,context,timers,advance,frame};
}

test("completion waits for ordered audio to leave the output latency buffer",()=>{
  const h=harness();h.frame(0);h.frame(1);
  assert(h.sources[1].startTime>=h.sources[0].startTime+.05);
  h.playback.finish({...binding,sequence:1,samples:2400,seal:"s".repeat(43)});
  assert.deepEqual(h.events,[]);assert.deepEqual(h.states,["thinking"]);
  h.advance(.03);assert(h.states.includes("speaking"));
  h.sources.forEach(n=>n.onended());h.advance(.13);
  assert(!h.events.some(e=>e.type==="playback_drained"));
  h.advance(.3);
  assert.equal(h.events.filter(e=>e.type==="playback_drained").length,1);
  assert.equal(h.events.at(-1).samples,2400);
  h.playback.finish({...binding,sequence:1,samples:2400,seal:"s".repeat(43)});
  assert.equal(h.events.filter(e=>e.type==="playback_drained").length,1);
});

test("barge-in clears every source before sending the bound interruption",()=>{
  const h=harness();h.frame();
  const client=Object.create(RealtimeClient.prototype);client.playback=h.playback;
  client.sendPlayback=(e)=>{assert(h.sources.every(n=>n.stopped));assert.equal(h.playback.binding,null);h.events.push(e);};
  client.stopSpeaking();
  assert.equal(h.events[0].type,"interrupt");assert.equal(h.events[0].response_id,"resp");
  h.frame(1);h.advance(100);assert.equal(h.sources.length,1);assert.equal(h.events.length,1);
});

test("provider done before playback interruption never acknowledges full text",()=>{
  const h=harness();h.frame();h.playback.finish({...binding,sequence:0,samples:1200,seal:"s".repeat(43)});
  h.playback.clear();h.advance(10);
  assert.equal(h.events.length,0);assert.equal(h.timers.size,0);assert.equal(h.sources[0].stopped,true);
});

test("stale generations, duplicate starts and old ended callbacks cannot attach to next turn",()=>{
  const h=harness();h.frame();const ended=h.sources[0].onended;h.playback.clear();
  const next={...binding,turn_id:2,active_generation_id:"next",response_id:"next-response"};h.playback.begin(next);
  h.playback.begin(binding);h.frame(1);ended();h.advance(10);
  assert.equal(h.playback.binding.active_generation_id,"next");assert.equal(h.events.length,0);
});

test("out of order audio and forged final totals fail closed",()=>{
  const h=harness();assert.throws(()=>h.frame(1),/order/);h.frame();
  assert.throws(()=>h.playback.finish({...binding,sequence:0,samples:1,seal:"s".repeat(43)}),/receipt/);
});

test("queue duration and source count are bounded",()=>{
  const h=harness();const pcm=Buffer.alloc(48000).toString("base64");
  for(let i=0;i<20;i++)h.frame(i,{pcm});
  assert.throws(()=>h.frame(20),/overflow/);assert.equal(h.sources.length,20);
});

test("suspended audio interrupts rather than issuing a false playback ack",()=>{
  const h=harness();h.frame();h.context.state="suspended";h.advance(1);
  assert.equal(h.playback.binding,null);assert.equal(h.events.length,0);
});

test("pending response cannot overlap another response",()=>{
  const h=harness();assert.throws(()=>h.playback.begin({...binding,active_generation_id:"other"}),/Overlapping/);
});

test("local microphone worklet detects onset before transport requires provider VAD",()=>{
  const source=fs.readFileSync(new URL("../js/realtime-worklet.js",import.meta.url),"utf8").replace(/^import .*;\r?\n/,"");
  const events=[];let Processor;
  vm.runInNewContext(source,{sampleRate:48000,Float32Array,Math,PCMResampler:class{push(){}},
    AudioWorkletProcessor:class{constructor(){this.port={postMessage(e){events.push(e);}};}},
    registerProcessor(_name,cls){Processor=cls;}});
  const processor=new Processor();
  for(let i=0;i<23;i++)processor.process([[new Float32Array(128).fill(.1)]]);
  assert.equal(events.filter(e=>e.type==="speech_started").length,1);
  for(let i=0;i<23;i++)processor.process([[new Float32Array(128).fill(.1)]]);
  assert.equal(events.filter(e=>e.type==="speech_started").length,1);
});

test("shared output ownership excludes L12 during live calls and releases cleanly",async()=>{
  const locks=[];const window={addEventListener(){}};
  const navigator={locks:{request(_name,{mode},fn){
    const allowed=!locks.some(l=>l.mode==="exclusive"||mode==="exclusive");
    if(!allowed)return fn(null);
    const lock={mode};locks.push(lock);return Promise.resolve(fn(lock)).finally(()=>locks.splice(locks.indexOf(lock),1));
  }}};
  vm.runInNewContext(fs.readFileSync(new URL("../js/audio-ownership.js",import.meta.url),"utf8"),{window,navigator,Error,Promise,Object});
  const audio={play:async()=>"played",pause(){},addEventListener(){}};window.LegaryaAudioOwnership.protect(audio);
  const release=await window.LegaryaAudioOwnership.acquire();
  await assert.rejects(audio.play(),/Another voice/);release();await new Promise(r=>setImmediate(r));
  assert.equal(await audio.play(),"played");await assert.rejects(window.LegaryaAudioOwnership.acquire(),/Another voice/);
  audio.pause();await new Promise(r=>setImmediate(r));const again=await window.LegaryaAudioOwnership.acquire();again();
});
