import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { RealtimeClient } from '../js/realtime-client.mjs';

const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
const binding = {session_id:'session',generation:1,turn_id:1,active_generation_id:'claim',response_id:'response'};
const final = {type:'transcript_final',item_id:'item',message_id:1,conversation_id:7,legacy_id:1,mode:'rya',content:'Synthetic QA'};

function harness() {
  const timers=new Map(), listeners=new Map(), sockets=[], contexts=[], tracks=[], nodes=[], events=[], requests=[];
  let clock=0, serial=0, account=1, locks=0;
  const gates={};
  const wait = async key => { if(gates[key]) await gates[key].promise; };
  class Socket {
    constructor(url){this.url=url;this.readyState=0;this.bufferedAmount=0;this.sent=[];sockets.push(this);}
    send(data){this.sent.push(JSON.parse(data));}
    open(){this.readyState=1;this.onopen?.();}
    event(event){this.onmessage?.({data:JSON.stringify(event)});}
    close(){if(this.readyState===3)return;this.readyState=3;this.onclose?.();}
  }
  const node = () => { const value={live:true,connect(){},disconnect(){this.live=false;}};nodes.push(value);return value; };
  class Context {
    constructor(){this.state='suspended';this.currentTime=0;this.destination={};this.audioWorklet={addModule:()=>wait('worklet')};contexts.push(this);}
    async resume(){await wait('context');if(this.state!=='closed')this.state='running';}
    async close(){this.state='closed';}
    createMediaStreamSource(){return node();}
    createBuffer(_channels,n,rate){return {duration:n/rate,getChannelData:()=>new Float32Array(n)};}
    createBufferSource(){return Object.assign(node(),{start(){},stop(){this.live=false;this.onended?.();}});}
  }
  class Worklet {
    constructor(){this.live=true;nodes.push(this);this.port={postMessage(){},onmessage:null};}
    connect(){} disconnect(){this.live=false;}
  }
  const environment={location:{href:'https://localhost/chat.html'},isSecureContext:true,
    LegaryaAuthApi:{getSessionEpoch:()=>account},AudioContext:Context,AudioWorkletNode:Worklet,WebSocket:Socket,
    LegaryaAudioOwnership:{async acquire(){await wait('output');++locks;let held=true;return ()=>{if(held){--locks;held=false;}};}},
    LegaryaMicrophone:{async capture(){await wait('permission');const track={readyState:'live',enabled:true,muted:false,callbacks:new Map(),
      addEventListener(name,fn){this.callbacks.set(name,fn);},removeEventListener(name){this.callbacks.delete(name);},stop(){this.readyState='ended';}};
      tracks.push(track);return {getTracks:()=>[track],getAudioTracks:()=>[track]};}},
    setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,due:clock+ms});return id;},clearTimeout(id){timers.delete(id);},
    setInterval(fn,ms){const id=++serial;timers.set(id,{fn,due:clock+ms,interval:ms});return id;},clearInterval(id){timers.delete(id);},
    addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},
    removeEventListener(name,fn){listeners.get(name)?.delete(fn);},
    btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),
  };
  const client=new RealtimeClient({environment,websocketUrl:'wss://api.example/api/v1/realtime/connect',onEvent:e=>events.push(e),
    api:async(path,options)=>{requests.push({path,options});await wait(path.endsWith('/reconnect')?'ticket':'session');return {session_id:'session',ticket:'synthetic-ticket'};}});
  const advance = async ms => {clock+=ms;for(const c of contexts)c.currentTime=clock/1000;
    for(const [id,t] of [...timers])if(t.due<=clock){if(t.interval)t.due=clock+t.interval;else timers.delete(id);t.fn();}await tick();};
  const emit = name => {for(const fn of listeners.get(name)||[])fn();};
  const connect = async (pending,generation=1) => {await tick();const socket=sockets.at(-1);assert(socket);socket.open();socket.event({type:'ready',session_id:'session',generation});await pending;return socket;};
  const start = () => client.start({legacy_id:1,mode:'rya'});
  const end = async () => {const pending=client.stop();sockets.at(-1)?.event({type:'ended'});await pending;await tick();};
  const baseline = () => {assert.equal(sockets.filter(s=>s.readyState!==3).length,0,'open sockets');assert.equal(contexts.filter(c=>c.state!=='closed').length,0,'contexts');
    assert.equal(tracks.filter(t=>t.readyState!=='ended').length,0,'microphones');assert.equal(nodes.filter(n=>n.live).length,0,'nodes');assert.equal(locks,0,'output locks');
    assert.equal(timers.size,0,'timers');assert.equal(tracks.reduce((n,t)=>n+t.callbacks.size,0),0,'track listeners');assert.equal(client.receipts.size,0,'private receipts');assert.equal(client.endings.size,0,'ending operations');assert.equal(client.requestController,null);};
  return {client,environment,gates,timers,listeners,sockets,contexts,tracks,nodes,events,requests,advance,emit,start,connect,end,baseline,changeAccount(){++account;emit('legarya:session-ending');}};
}

test('C2A: 100 rapid start/end/start cycles with 600 late socket/worklet/playback/timer callbacks',async()=>{
  const h=harness();
  for(let i=0;i<100;i++){
    const old=await h.connect(h.start());
    old.event({type:'assistant_started',...binding});old.event({type:'assistant_audio',...binding,sequence:0,pcm:Buffer.alloc(2400).toString('base64')});
    const stale=[old.onopen,old.onclose,()=>old.onmessage?.({data:JSON.stringify(final)}),h.client.worklet.port.onmessage,h.client.playback.nodes.values().next().value.onended,[...h.timers.values()][0].fn];
    const oldMessage=old.onmessage;
    const ending=h.client.stop();
    const next=await h.connect(h.start());
    const count=h.events.length;
    stale[0]();stale[1]();oldMessage({data:JSON.stringify(final)});stale[3]({data:{type:'speech_started'}});stale[4]();stale[5]();
    await ending;
    assert.equal(h.client.socket,next);assert.equal(h.client.state,'connected');assert.equal(h.events.length,count);
    await h.end();h.baseline();
  }
  h.client.dispose();assert.equal([...h.listeners.values()].reduce((n,s)=>n+s.size,0),0);
});

for(const stage of ['context','output','permission','session','worklet']) for(const action of ['end','logout','legacy']) test(`C2A: ${action} fences pending ${stage} and its late completion`,async()=>{
  const h=harness();h.gates[stage]=deferred();const pending=h.start();await tick();
  if(stage==='worklet'){const s=h.sockets.at(-1);s.open();s.event({type:'ready',session_id:'session',generation:1});await tick();}
  if(action==='logout')h.changeAccount();else if(action==='legacy')h.emit('popstate');else {const stop=h.client.stop();h.sockets.at(-1)?.event({type:'ended'});await stop;}
  const gate=h.gates[stage];delete h.gates[stage];
  const next=await h.connect(h.start());const count=h.events.length;
  gate.resolve();await pending;await tick();
  assert.equal(h.client.socket,next);assert.equal(h.events.length,count);await h.end();h.baseline();h.client.dispose();
});

test('C2A: 50 disconnect/reconcile/explicit-resume cycles ignore old callbacks and never auto-capture',async()=>{
  const h=harness();
  for(let i=0;i<50;i++){
    const old=await h.connect(h.start());const callback=old.onmessage;old.close();
    const count=h.tracks.length;
    const replacement=await h.connect(h.client.reconnect(),3);
    assert.equal(h.tracks.length,count);assert.equal(h.client.stream,null);
    callback({data:JSON.stringify({...final})});assert.equal(h.client.receipts.size,0);
    await Promise.all([h.client.resumeCapture(),h.client.resumeCapture(),h.client.resumeCapture()]);
    assert.equal(h.tracks.length,count+1);assert.equal(h.client.socket,replacement);
    await h.end();h.baseline();
  }
  h.client.dispose();
});

for(const name of ['legarya:session-ending','legarya:session-expired','legarya:android-sensitive-stop','pagehide','popstate']) test(`C2A: ${name} cancels reconnect ticket, ending and playback`,async()=>{
  const h=harness();const old=await h.connect(h.start());old.close();
  h.gates.ticket=deferred();const reconnect=h.client.reconnect();await tick();h.emit(name);
  h.gates.ticket.resolve();await reconnect;h.baseline();
  const socket=await h.connect(h.start());socket.event({type:'assistant_started',...binding});socket.event({type:'assistant_audio',...binding,sequence:0,pcm:Buffer.alloc(2400).toString('base64')});
  const ended=h.client.stop();h.emit(name);await ended;await h.advance(10000);h.baseline();h.client.dispose();
});

test('C2A: duplicate ready/finals/completion and provisional-after-final are bounded',async()=>{
  const h=harness();const s=await h.connect(h.start());
  for(let i=0;i<100;i++){s.event({type:'ready',session_id:'session',generation:1});s.event(final);s.event({type:'transcript_provisional',item_id:'item',delta:'late'});s.event({type:'assistant_completed',...binding});}
  assert.equal(h.timers.size,1);assert.equal(h.events.filter(e=>e.type==='transcript_final').length,1);
  assert.equal(h.events.filter(e=>e.type==='assistant_completed').length,1);assert.equal(h.events.filter(e=>e.type==='transcript_provisional').length,0);
  await h.end();h.baseline();h.client.dispose();
});

for(const value of [null,[],42,{}, {type:{}},{type:'ready',generation:-1,session_id:'session'}, {...final,content:{}},
  {type:'transcript_provisional',item_id:{},delta:'x'},{type:'assistant_audio',...binding,turn_id:-1},{type:'unknown',padding:'x'.repeat(96000)}]) test(`C2A: malformed message fails closed (${JSON.stringify(value).slice(0,65)})`,async()=>{
  const h=harness();const s=await h.connect(h.start());s.event(value);await tick();assert.equal(h.client.state,'idle');h.baseline();
  await h.connect(h.start());await h.end();h.baseline();h.client.dispose();
});

test('C2A: unknown bounded messages are ignored; account epoch checks also fence without notification',async()=>{
  const h=harness();const s=await h.connect(h.start());const count=h.events.length;s.event({type:'future_event',value:1});assert.equal(h.events.length,count);
  h.environment.LegaryaAuthApi.getSessionEpoch=()=>99;s.event(final);assert.equal(h.client.receipts.size,0);
  h.client.invalidate();h.baseline();h.client.dispose();
});

test('C2A: request/connect timeout, worklet/context failure and socket error recover without reload',async()=>{
  for(const stage of ['session','context','worklet','socket','connect']){
    const h=harness();if(['session','context','worklet'].includes(stage))h.gates[stage]=deferred();
    const pending=h.start().catch(()=>{});await tick();
    if(stage==='worklet'){const s=h.sockets.at(-1);s.open();s.event({type:'ready',session_id:'session',generation:1});await tick();}
    if(stage==='session'||stage==='connect')await h.advance(12001);
    else if(stage==='socket')h.sockets.at(-1).onerror();
    else h.gates[stage].reject(new Error('synthetic failure'));
    await pending;delete h.gates[stage];h.baseline();
    await h.connect(h.start());await h.end();h.baseline();h.client.dispose();
  }
});

test('C2A: rapid repeated Start and End allocate one session and one socket',async()=>{
  const h=harness();const first=h.start();const duplicates=Array.from({length:50},()=>assert.rejects(h.start()));
  const s=await h.connect(first);await Promise.all(duplicates);assert.equal(h.requests.length,1);assert.equal(h.sockets.length,1);
  await Promise.all(Array.from({length:50},()=>h.client.stop()));assert.equal(s.sent.filter(e=>e.type==='end_call').length,1);h.baseline();h.client.dispose();
});

test('C2A: software barge-in retires playback before interrupt; late drain and frames are inert',async()=>{
  const h=harness();const s=await h.connect(h.start());s.event({type:'assistant_started',...binding});s.event({type:'assistant_audio',...binding,sequence:0,pcm:Buffer.alloc(2400).toString('base64')});
  const source=[...h.client.playback.nodes][0],late=source.onended;
  h.client.worklet.port.onmessage({data:{type:'speech_started'}});
  assert.equal(source.live,false);assert.equal(h.client.playback.binding,null);assert.equal(s.sent.at(-1).type,'interrupt');
  late();s.event({type:'assistant_audio',...binding,sequence:1,pcm:Buffer.alloc(2400).toString('base64')});await h.advance(1000);
  assert.equal(s.sent.filter(e=>e.type==='playback_drained').length,0);assert.equal(h.client.state,'connected');
  await h.end();h.baseline();h.client.dispose();
});

test('C2A: real shared microphone boundary survives 50 contention cycles and late permission/logout',async()=>{
  let held=false,account=1,permission=null,focus=0;
  const listeners=new Map(),streams=[];
  const window={LegaryaAuthApi:{getSessionEpoch:()=>account},addEventListener(n,f){listeners.set(n,f);},
    LegaryaPlatform:{kind:'android',armMicrophone:async()=>{},requestAudioFocus:async()=>{++focus;return {granted:true};},releaseAudioFocus:async()=>{--focus;}}};
  const navigator={locks:{async request(_n,_o,fn){if(held)return fn(null);held=true;try{return await fn({});}finally{held=false;}}},mediaDevices:{async getUserMedia(){if(permission)await permission.promise;
    const track={readyState:'live',addEventListener(){},stop(){this.readyState='ended';}};const stream={getTracks:()=>[track],getAudioTracks:()=>[track]};streams.push(stream);return stream;}}};
  vm.runInNewContext(fs.readFileSync(new URL('../js/microphone-ownership.js',import.meta.url),'utf8'),{window,navigator,DOMException});
  for(let i=0;i<50;i++){
    const a=await navigator.mediaDevices.getUserMedia({audio:true});await assert.rejects(window.LegaryaMicrophone.capture({audio:true}));a.getTracks()[0].stop();await tick();
    const b=await window.LegaryaMicrophone.capture({audio:true});await assert.rejects(navigator.mediaDevices.getUserMedia({audio:true}));b.getTracks()[0].stop();await tick();
    assert.equal(focus,0);assert.equal(held,false);
  }
  permission=deferred();const pending=window.LegaryaMicrophone.capture({audio:true});await tick();++account;listeners.get('legarya:session-ending')();
  permission.resolve();await assert.rejects(pending,{name:'AbortError'});await tick();assert.equal(focus,0);assert.equal(held,false);
  assert(streams.every(s=>s.getTracks()[0].readyState==='ended'));
});
