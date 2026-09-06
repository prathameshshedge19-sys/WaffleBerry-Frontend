import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync(new URL("../js/legarya-soundscape.js",import.meta.url),"utf8");
function harness({homepage=false,muted=false,delayed=false}={}) {
  class Target extends EventTarget {
    constructor(live=false){super();this.dataset={};this.live=live;}
    setAttribute(name,value){this[name]=value;}
    hasAttribute(name){return this.live&&name==="data-live-ambience";}
    contains(target){return target===this;}
  }
  const graphs=[],timers=new Map(),storage=new Map([["legarya_ambient_enabled",String(!muted)]]);
  let timer=0,resolveResume;
  const parameter=()=>({value:0,setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;},exponentialRampToValueAtTime(v){this.value=v;},cancelAndHoldAtTime(){},cancelScheduledValues(){}});
  class AudioContext {
    constructor(){this.state="suspended";this.currentTime=0;this.sampleRate=1000;this.nodes=[];this.destination={};graphs.push(this);}
    node(kind){const n=new Target();Object.assign(n,{kind,gain:parameter(),frequency:parameter(),detune:parameter(),Q:parameter(),pan:parameter(),playbackRate:parameter(),connect(){return arguments[0]},disconnect(){this.disconnected=true},start(){this.started=true},stop(){this.stopped=true}});this.nodes.push(n);return n;}
    createGain(){return this.node("gain");} createOscillator(){return this.node("oscillator");}
    createBiquadFilter(){return this.node("filter");} createStereoPanner(){return this.node("panner");}
    createBufferSource(){return this.node("buffer");}
    createBuffer(channels,length,rate){return {duration:length/rate,getChannelData:()=>new Float32Array(length)};}
    resume(){this.state="running";return delayed?new Promise(r=>{resolveResume=r}):Promise.resolve();}
    suspend(){this.state="suspended";return Promise.resolve();}
    close(){this.state="closed";return Promise.resolve();}
  }
  const control=new Target(),document=new Target(),window=new Target();
  document.hidden=false;document.querySelector=s=>s==="[data-soundscape-toggle]"&&homepage?control:null;
  const env={window,document,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},AudioContext,AbortController,Event,console,performance:{now:()=>1000},setTimeout:(fn)=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id)};
  Object.assign(window,{AudioContext,setTimeout:env.setTimeout});
  vm.runInNewContext(source,env);
  return {window,control,button:()=>new Target(true),graphs,timers,storage,resolve:()=>resolveResume?.(),reload:()=>vm.runInNewContext(source,env)};
}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};

test("live ambience shares the existing homepage graph and restores homepage levels",async()=>{
  const h=harness({homepage:true});await flush();assert.equal(h.graphs.length,1);
  h.reload();await flush();assert.equal(h.graphs.length,1);
  const graph=h.graphs[0],master=graph.nodes[0];assert.equal(master.gain.value,3);
  const lease=h.window.LegaryaSoundscape.acquireLive(h.button());await flush();
  assert.equal(h.graphs.length,1);assert.equal(master.gain.value,.36);
  lease.speaking(true);assert.ok(master.gain.value<.08);
  lease.speaking(false);assert.equal(master.gain.value,.36);
  lease.release();assert.equal(graph.state,"running");assert.equal(master.gain.value,3);
});
test("muted ambience allocates no audio context and never mutes microphone or speech",async()=>{
  const h=harness({muted:true});const button=h.button(),lease=h.window.LegaryaSoundscape.acquireLive(button);await flush();
  assert.equal(h.graphs.length,0);assert.equal(button.textContent,"Ambient sound off");
  lease.speaking(true);lease.arc({strength:1});assert.equal(h.graphs.length,0);lease.release();
});
test("call release stops sources, closes its graph, clears timers and permits a fresh call",async()=>{
  const h=harness(),button=h.button(),lease=h.window.LegaryaSoundscape.acquireLive(button);await flush();
  lease.arc({strength:1,length:1,pathCount:3});
  const graph=h.graphs[0];assert.ok(graph.nodes.some(n=>n.kind==="buffer"&&n.started));
  lease.release();assert.equal(graph.state,"closed");assert.equal(h.timers.size,0);
  assert.ok(graph.nodes.filter(n=>n.started).every(n=>n.stopped&&n.disconnected));
  button.dispatchEvent(new Event("click"));await flush();assert.equal(h.graphs.length,1);
  const next=h.window.LegaryaSoundscape.acquireLive(h.button());await flush();assert.equal(h.graphs.length,2);next.release();
});
test("ending while browser audio unlock is pending cannot resurrect ambience",async()=>{
  const h=harness({delayed:true}),lease=h.window.LegaryaSoundscape.acquireLive(h.button());
  lease.release();h.resolve();await flush();assert.equal(h.graphs[0].state,"closed");assert.equal(h.timers.size,0);
});
test("ambient mute preference persists across calls independently from call state",async()=>{
  const h=harness(),button=h.button(),lease=h.window.LegaryaSoundscape.acquireLive(button);await flush();
  button.dispatchEvent(new Event("click"));await flush();assert.equal(h.storage.get("legarya_ambient_enabled"),"false");
  lease.release();const next=h.window.LegaryaSoundscape.acquireLive(h.button());await flush();assert.equal(h.graphs.length,1);next.release();
});
