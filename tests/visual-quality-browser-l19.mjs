// Real native-produced synthetic bundles only. No production authentication/data.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath,pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
const root=fileURLToPath(new URL("../",import.meta.url));
const {chromium}=await import(pathToFileURL(path.resolve(process.env.L19_PLAYWRIGHT_MODULE)));
const cases=JSON.parse(await readFile(process.env.L19_NATIVE_QUALITY_JSON,"utf8"));
assert.equal(cases.filter(c=>c.result==="pass").length,5);
const server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,"http://127.0.0.1").pathname;if(pathname==="/"){res.setHeader("Content-Type","text/html");res.end('<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/css/visual-presence.css"></head><body style="margin:20px;background:#16120f;color:#eee2cd;font-family:system-ui"><h1>Native synthetic portrait QA</h1><p>Source-derived 2D geometry · Neutral / mouth envelope / blink envelope</p><main style="display:grid;grid-template-columns:repeat(3,320px);gap:18px" id="samples"></main></body></html>');return;}const target=path.resolve(root,"."+pathname);if(!target.startsWith(root))throw new Error();res.setHeader("Content-Type",pathname.endsWith(".css")?"text/css":"text/javascript");res.end(await readFile(target));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,"127.0.0.1",r));const browser=await chromium.launch({headless:true,args:["--enable-unsafe-swiftshader","--js-flags=--expose-gc"]});
try {
 const page=await browser.newPage({viewport:{width:1050,height:1000}}),errors=[];page.on("pageerror",e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
 const result=await page.evaluate(async rows=>{
  const {validateRig}=await import("/js/visual-presence-client.mjs?v=l19c1"),{createPortraitRenderer}=await import("/js/legacy-portrait-renderer.mjs?v=l19c1");
  const decode=data=>Uint8Array.from(atob(data),c=>c.charCodeAt(0));const results=[];
  async function load(row){const rig=validateRig(JSON.parse(new TextDecoder().decode(decode(row.assets.rig))));const bitmap=await createImageBitmap(new Blob([decode(row.assets.texture_atlas)],{type:"image/png"}));const posterUrl=URL.createObjectURL(new Blob([decode(row.assets.poster)],{type:"image/png"}));return{rig,bitmap,posterUrl,dispose(){bitmap.close();URL.revokeObjectURL(posterUrl);}};}
  for(const row of rows.filter(c=>c.result==="pass")){
   const bundle=await load(row),host=document.createElement("div");host.className="visual-preview";host.style.width="320px";document.body.append(host);
   const section=document.createElement("section");section.id="quality-"+row.case;section.style.cssText="display:grid;grid-template-columns:repeat(3,320px);gap:18px;grid-column:1/-1";document.querySelector("#samples").append(section);
   let pending=null,pose=0,time=0,state="INTERRUPTED";const environment={performance,devicePixelRatio:1.5,matchMedia:matchMedia.bind(window),requestAnimationFrame(fn){pending=fn;return 1;},cancelAnimationFrame(){pending=null;}};
   // Suppress whole-crop idle transforms so changed pixels prove the actual
   // numeric mouth/blink channels, not a breathing/tilt difference.
   const renderer=createPortraitRenderer(host,bundle,{environment,sample:()=>({mouth:pose,state})});
   const step=()=>{time+=34;const fn=pending;pending=null;fn?.(time);};
   const capture=(label,staticOnly=false)=>{const canvas=host.querySelector("canvas");if(!canvas)throw new Error("Real animated rendering unavailable");const figure=document.createElement("figure");figure.style.margin="0";const caption=document.createElement("figcaption");caption.textContent=row.case+" · "+label;const image=new Image();image.width=image.height=320;image.src=staticOnly?"data:image/png;base64,"+row.assets.poster:canvas.toDataURL("image/png");figure.append(caption,image);section.append(figure);return image.src;};
   step();const neutral=capture("neutral");pose=.2;step();capture("low mouth 0.2");pose=.5;step();capture("medium mouth 0.5");pose=1;step();const mouth=capture("high mouth 1.0");if(neutral===mouth)throw new Error("Native mouth deformation produced no visible changed pixels");pose=0;
   while(time<4080)step();const blink=capture("blink");if(neutral===blink)throw new Error("Blink/idle frame did not change");
   for(const s of ["IDLE","LISTENING","THINKING","SPEAKING"]){state=s;pose=s==="SPEAKING"?.5:0;step();capture(s.toLowerCase());}
   renderer.reset();if(capture("interrupted")!==neutral)throw new Error("Synchronous reset did not return the exact neutral pixels");
   const diagnostics=renderer.diagnostics();if(diagnostics.static||diagnostics.tier!==0||diagnostics.p95Ms>=4)throw new Error("Native animation performance gate failed");
   renderer.setStatic(true);capture("static / reduced motion",true);renderer.setStatic(false);
   results.push({case:row.case,...diagnostics,canvasWidth:host.querySelector("canvas").width});
   renderer.dispose();bundle.dispose();host.remove();if(pending!==null)throw new Error("Animation callback retained");
  }
  const one=rows.find(c=>c.result==="pass");window.gc?.();const before=performance.memory?.usedJSHeapSize||null;
  for(let i=0;i<100;i++){
   const b=await load(one),host=document.createElement("div");host.className="visual-preview";document.body.append(host);let pending=null;
   const renderer=createPortraitRenderer(host,b,{environment:{performance,devicePixelRatio:1,matchMedia:matchMedia.bind(window),requestAnimationFrame(fn){pending=fn;return 1;},cancelAnimationFrame(){pending=null;}}});renderer.dispose();b.dispose();host.remove();if(pending!==null||renderer.diagnostics().gpuResources!==0)throw new Error("Resource leak on cycle "+i);
  }
  window.gc?.();const after=performance.memory?.usedJSHeapSize||null;
  // Exercise the actual browser AudioContext clock and renderer together. The
  // synthetic packet contains internal silence; this is not a microphone test.
  const {RealtimePlayback}=await import("/js/realtime-playback.mjs?v=l19c1"),{RealtimeClient}=await import("/js/realtime-client.mjs?v=l19c1"),{createVisualPresence}=await import("/js/visual-presence-controller.mjs?v=l19c1");
  const host=document.createElement("div");host.className="visual-preview";document.body.append(host);
  const bundle=await load(one),events=[],faults=[],presentations=[];
  const portrait=createVisualPresence({host,legacyId:1,client:{async manifest(){return{version_id:"synthetic",revision:1,bundle_digest:"synthetic",assets:[],lease_seconds:15,valid_until:new Date(Date.now()+15000).toISOString()};},async bundle(){return bundle;}},rendererFactory:createPortraitRenderer});await portrait.start();
  const audio=new AudioContext({sampleRate:24000});await audio.resume();
  const binding={session_id:"synthetic",generation:1,turn_id:1,active_generation_id:"synthetic-one",response_id:"synthetic-response"};
  const playback=new RealtimePlayback({context:audio,send:event=>events.push(event),onFault:message=>faults.push(message),onState:state=>portrait.setCallState(state),onPresentation:event=>{presentations.push({type:event.type,value:event.value,time:audio.currentTime});portrait.presentation(event);}});
  const pcm=(count,silent=false)=>{const bytes=new Uint8Array(count*2),view=new DataView(bytes.buffer);for(let i=0;i<count;i++)view.setInt16(i*2,silent&&(i<4800||i>=12000)?0:Math.round(Math.sin(i*Math.PI/12)*7000),true);let binary="";for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary);};
  const until=async(condition,timeout=3000)=>{const end=performance.now()+timeout;while(!condition()){if(performance.now()>end)throw new Error("Browser playback acceptance timed out");await new Promise(r=>setTimeout(r,10));}};
  playback.begin(binding);playback.frame({...binding,sequence:0,pcm:pcm(24000,true)});playback.finish({...binding,sequence:0,samples:24000,seal:"s".repeat(43)});
  if(portrait.diagnostics().mouth!==0)throw new Error("Packet arrival drove the portrait");
  await until(()=>portrait.diagnostics().mouth>.05);if(!presentations.some(e=>e.type==="playback_envelope"&&e.value>.08))throw new Error("No accepted scheduled envelope");
  await until(()=>events.some(e=>e.type==="playback_drained"));if(portrait.diagnostics().mouth!==0)throw new Error("Silence did not neutralize the actual rendered mouth");
  if(events.filter(e=>e.type==="playback_drained").length!==1)throw new Error("Duplicate playback receipt");
  playback.clear();const second={...binding,turn_id:2,active_generation_id:"synthetic-two",response_id:"synthetic-response-two"};playback.begin(second);playback.frame({...second,sequence:0,pcm:pcm(24000)});
  await until(()=>portrait.diagnostics().mouth>.05);
  const gl=host.querySelector("canvas").getContext("webgl2"),loss=gl.getExtension("WEBGL_lose_context");if(!loss)throw new Error("Context-loss test extension unavailable");loss.loseContext();
  await until(()=>!host.querySelector("canvas"));if(host.querySelector("img")?.hidden||audio.state!=="running"||!playback.nodes.size)throw new Error("WebGL loss did not preserve authorized static portrait and running audio");
  const client=Object.create(RealtimeClient.prototype);client.playback=playback;let cancelAfterNeutral=false;client.sendPlayback=()=>{cancelAfterNeutral=portrait.diagnostics().mouth===0;};
  const stopAt=performance.now();client.stopSpeaking();const neutralAfterMs=performance.now()-stopAt;
  if(!cancelAfterNeutral||portrait.diagnostics().mouth!==0||neutralAfterMs>50)throw new Error("Actual browser stop did not neutralize before cancellation");
  const retired=presentations.length;await new Promise(r=>setTimeout(r,100));if(presentations.length!==retired)throw new Error("Retired output resumed");
  portrait.dispose();host.remove();playback.clear();await audio.close();
  if(faults.length)throw new Error("Audio fault in browser acceptance");
  return{cases:results,churnCycles:100,retainedCanvases:document.querySelectorAll("canvas").length,heapBefore:before,heapAfter:after,heapDelta:before&&after?after-before:null,audioClock:{packetArrivalNeutral:true,internalSilenceNeutral:true,drainedReceipts:1,contextLossPreservedAudioAndPoster:true,neutralBeforeCancel:cancelAfterNeutral,neutralAfterMs,retiredOutputSuppressed:true,audioState:audio.state}};
 },cases);
 assert.equal(result.retainedCanvases,0);assert.ok(result.cases.every(c=>c.canvasWidth<=768));if(result.heapDelta!==null)assert.ok(result.heapDelta<32*1024*1024);assert.deepEqual(errors,[]);
 await page.evaluate(()=>Promise.all([...document.images].map(image=>image.decode())));
 if(process.env.L19_SCREENSHOT_DIR)for(const row of cases.filter(c=>c.result==="pass"))await page.locator("#quality-"+row.case).screenshot({path:path.join(process.env.L19_SCREENSHOT_DIR,"visual-native-"+row.case+".png")});
 console.log(JSON.stringify({...result,pageErrors:errors.length,softwareGpu:true,subjectiveQualityRequiresInspection:true},null,2));
} finally {await browser.close();await new Promise(r=>server.close(r));}
