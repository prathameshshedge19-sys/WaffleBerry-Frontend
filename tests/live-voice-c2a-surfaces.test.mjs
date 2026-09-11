import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const tick=()=>new Promise(setImmediate);
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
class Element extends EventTarget {
  constructor(){super();this.dataset={};this.style={setProperty(){}};this.children=new Map();this.classList={add(){},remove(){},toggle(){}};this.value='';this.hidden=false;}
  querySelector(key){if(!this.children.has(key))this.children.set(key,new Element());return this.children.get(key);}
  querySelectorAll(){return [];}
  setAttribute(key,value){this[key]=value;} removeAttribute(key){delete this[key];}
  append(){} replaceChildren(){} focus(){} closest(){return null;}
  showModal(){this.open=true;} close(){this.open=false;}
  click(){this.dispatchEvent(new Event('click'));}
}
function dom(){const document=new Element();document.body=new Element();document.documentElement=new Element();document.createElement=()=>new Element();const window=new Element();return {document,window};}

function surface(){
  const {document,window}=dom();let scope={legacyId:1,mode:'rya',name:'Rya',ready:true,version:0},account=1;
  const starting=deferred(),stopping=deferred(),refreshing=deferred();let client,refreshes=0;
  class Client {constructor(options){this.options=options;this.state='idle';client=this;}async start(){await starting.promise;} async stop(){this.state='idle';await stopping.promise;}invalidate(){this.state='idle';}setMuted(){}stopSpeaking(){} }
  window.LegaryaAuthApi={getSessionEpoch:()=>account,apiRequest:async()=>({enabled:true})};
  window.LegaryaLiveChat={context:()=>scope,setLive(){},accept:()=>true,refresh:()=>{++refreshes;return refreshing.promise;}};
  window.LegaryaSoundscape={acquireLive:()=>({release(){},speaking(){}})};window.LEGARYA_FORCE_STATIC_RYA=true;
  const dialogs=[];document.createElement=()=>{const node=new Element();dialogs.push(node);return node;};
  const source=fs.readFileSync(new URL('../js/live-voice.mjs',import.meta.url),'utf8').replace(/^import .*\r?\n/gm,'');
  vm.runInNewContext(source,{window,document,location:{},RealtimeClient:Client,liveVoiceAvailability:()=>'',liveVoiceError:()=> 'Call failed',liveWebsocketUrl:()=> 'wss://example.invalid',Event,AbortController,setTimeout,clearTimeout});
  return {window,document,dialog:dialogs[0],starting,stopping,refreshing,get client(){return client;},get refreshes(){return refreshes;},
    start:()=>document.querySelector('#startVoiceConversation').click(),logout(){++account;window.dispatchEvent(new Event('legarya:session-ending'));},
    legacy(){scope={...scope,legacyId:2,version:1};window.dispatchEvent(new Event('legarya:chat-context'));}};
}
for(const action of ['logout','legacy']) test(`C2A live surface: ${action} clears private presentation before pending start/end/refresh completes`,async()=>{
  const h=surface();await tick();h.start();await tick();assert.equal(h.dialog.open,true);
  h.client.options.onEvent({type:'transcript_final',...{conversation_id:7,content:'Synthetic old content'}});
  h.dialog.querySelector('[data-live-end]').click();await tick();
  h[action]();assert.equal(h.dialog.open,false);assert.equal(h.dialog.querySelector('.live-call-transcript').textContent,'');
  h.start();await tick();assert.equal(h.dialog.open,true);
  h.stopping.resolve();h.starting.resolve();h.refreshing.resolve();await tick();
  assert.equal(h.dialog.open,true,'old End handler must not close a new call');
  assert.equal(h.dialog.querySelector('[data-live-close]').hidden,true);
  assert.equal(h.refreshes,0,'old account/context cannot queue a refresh');
});

test('C2A saved-chat refresh coalesces duplicate demand and aborts on logout',async()=>{
  const h=surface();await tick();h.start();await tick();h.client.options.onEvent({type:'transcript_final',conversation_id:7,content:'Synthetic'});
  for(let i=0;i<100;i++)h.client.options.onEvent({type:'assistant_completed'});
  await tick();assert.equal(h.refreshes,1);h.logout();h.refreshing.resolve();await tick();assert.equal(h.refreshes,1);assert.equal(h.dialog.open,false);
});

test('C2A native platform: loss terminates once, stale loss cannot affect next focus, gain never restarts',async()=>{
  const {window,document}=dom();const nativeEvents=new Map(),appEvents=new Map();let generation=0,stops=0,releases=0;
  const Native={addListener:(name,fn)=>nativeEvents.set(name,fn),requestAudioFocus:async()=>({granted:true,generation:++generation}),releaseAudioFocus:async()=>{++releases;},configureTrustedWebView:async()=>{}};
  window.LegaryaLiveVoice={invalidate(){++stops;}};
  const source=fs.readFileSync(new URL('../mobile/platform-entry.js',import.meta.url),'utf8').replace(/^import .*\r?\n/gm,'');
  vm.runInNewContext(source,{window,document,navigator:{userAgent:'Chrome/133'},registerPlugin:()=>Native,App:{addListener:(name,fn)=>appEvents.set(name,fn)},
    Browser:{},Keyboard:{addListener(){}},SplashScreen:{hide:async()=>{}},StatusBar:{},Style:{Dark:'dark'},CustomEvent:class extends Event{constructor(name,options){super(name);this.detail=options?.detail;}},Event,URL});
  await tick();const first=await window.LegaryaPlatform.requestAudioFocus('l15');nativeEvents.get('audioFocusChange')({change:-1,generation:first.generation});await tick();assert.equal(stops,1);
  const next=await window.LegaryaPlatform.requestAudioFocus('l15');nativeEvents.get('audioFocusChange')({change:-1,generation:first.generation});nativeEvents.get('audioFocusChange')({change:1,generation:next.generation});
  assert.equal(stops,1);await appEvents.get('appStateChange')({isActive:false});assert.equal(stops,2);await appEvents.get('appStateChange')({isActive:true});assert.equal(stops,2);assert(releases>=2);
});

function dictation(){
  const {window,document}=dom();const recordings=[],tracks=[],contexts=[],urls=new Set(),timers=new Set(),fetches=[];
  let permission=null;
  class Audio extends Element{async play(){}pause(){} }
  class MediaRecorder extends Element{static isTypeSupported(){return true;}constructor(stream){super();this.stream=stream;this.mimeType='audio/webm';this.state='inactive';recordings.push(this);}start(){this.state='recording';}stop(){this.state='inactive';this.dispatchEvent(new Event('stop'));}}
  class AudioContext {constructor(){contexts.push(this);this.state='running';}async resume(){}async close(){this.state='closed';}createAnalyser(){return {fftSize:2048,getFloatTimeDomainData(){}};}createMediaStreamSource(){return {connect(){}};}}
  window.MediaRecorder=MediaRecorder;window.AudioContext=AudioContext;
  window.LegaryaAuthApi={apiRequest:async()=>({voice:'marin'}),authenticatedFetch:()=>{const d=deferred();fetches.push(d);return d.promise;}};
  const navigator={mediaDevices:{async getUserMedia(){if(permission)await permission.promise;const track={stop(){this.ended=true;}};tracks.push(track);return {getTracks:()=>[track]};}}};
  const environment={window,document,navigator,Audio,MediaRecorder,AudioContext,Event,AbortController,Blob,FormData,console,
    URL:{createObjectURL(){const url='blob:'+urls.size;urls.add(url);return url;},revokeObjectURL:url=>urls.delete(url)},
    setInterval:fn=>{timers.add(fn);return fn;},clearInterval:fn=>timers.delete(fn),setTimeout:fn=>{timers.add(fn);return fn;},clearTimeout:fn=>timers.delete(fn)};
  vm.runInNewContext(fs.readFileSync(new URL('../js/voice-chat.js',import.meta.url),'utf8'),environment);
  return {window,document,recordings,tracks,contexts,urls,timers,fetches,permission(value){permission=value;},click:()=>document.querySelector('#microphoneButton').click()};
}
test('C2A L12: pending permission is single-owner; stopAll fences late stream without touching replacement',async()=>{
  const h=dictation(),permission=deferred();h.permission(permission);h.click();h.click();await tick();assert.equal(h.window.LegaryaVoice.isCapturing(),true);
  await assert.rejects(h.window.LegaryaVoice.prepareLive(),/pending/);h.window.LegaryaVoice.stopAll();permission.resolve();await tick();
  assert.equal(h.recordings.length,0);assert(h.tracks.every(t=>t.ended));assert.equal(h.window.LegaryaVoice.isCapturing(),false);
  h.permission(null);h.click();await tick();assert.equal(h.recordings.length,1);h.window.LegaryaVoice.stopAll();assert(h.tracks.every(t=>t.ended));assert.equal(h.timers.size,0);
});
test('C2A L12: logout during transcription cannot populate composer or resurrect recorder',async()=>{
  const h=dictation();h.click();await tick();h.click();await tick();assert.equal(h.fetches.length,1);
  h.window.dispatchEvent(new Event('legarya:session-ending'));h.fetches[0].resolve({json:async()=>({text:'Synthetic stale transcript'})});await tick();
  assert.equal(h.document.querySelector('#messageInput').value,'');assert.equal(h.window.LegaryaVoice.isCapturing(),false);assert.equal(h.timers.size,0);assert(h.contexts.every(c=>c.state==='closed'));
});
test('C2A L12: delayed TTS after logout creates no private Blob URL or playback',async()=>{
  const h=dictation();const row=new Element();row.querySelector=()=>null;
  h.window.LegaryaVoice.attachAssistant(row,1,{autoPlay:true});await tick();assert.equal(h.fetches.length,1);
  h.window.dispatchEvent(new Event('legarya:session-ending'));h.fetches[0].resolve({blob:async()=>new Blob(['synthetic'])});await tick();assert.equal(h.urls.size,0);
});

test('C2A output lock: an old play rejection cannot release the newer playback owner',async()=>{
  const {window}=dom();let held=false,rejectOld,calls=0;
  const navigator={locks:{async request(_name,_options,fn){if(held)return fn(null);held=true;try{return await fn({});}finally{held=false;}}}};
  vm.runInNewContext(fs.readFileSync(new URL('../js/audio-ownership.js',import.meta.url),'utf8'),{window,navigator});
  const audio=new Element();audio.pause=()=>{};audio.play=()=>++calls===1?new Promise((_,reject)=>{rejectOld=reject;}):Promise.resolve();
  window.LegaryaAudioOwnership.protect(audio);const old=audio.play();await tick();await audio.play();rejectOld(new Error('synthetic old failure'));await assert.rejects(old);
  await assert.rejects(window.LegaryaAudioOwnership.acquire(),/Another voice/);audio.pause();await tick();assert.equal(held,false);
});
