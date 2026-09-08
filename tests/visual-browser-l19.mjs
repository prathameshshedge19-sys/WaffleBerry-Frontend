// Standalone browser acceptance. L19_PLAYWRIGHT_MODULE points to an installed
// Playwright index.mjs. Synthetic numeric/color fixtures are NOT likeness QA.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
const root=fileURLToPath(new URL("../",import.meta.url));
if(!process.env.L19_PLAYWRIGHT_MODULE)throw new Error("Set L19_PLAYWRIGHT_MODULE to the installed Playwright index.mjs.");
const {chromium}=await import(pathToFileURL(path.resolve(process.env.L19_PLAYWRIGHT_MODULE)));
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/visual-presence.css?v=l19c1"></head><body style="margin:0;background:#16120e;color:white;font-family:system-ui"><button id="openVisualPresence">Visual Presence</button><script src="/js/media-client.js"></script><script type="module" src="/js/visual-presence-settings.mjs?v=l19c1"></script></body></html>`;
const server=createServer(async(req,res)=>{
  try {const url=new URL(req.url,"http://127.0.0.1");if(url.pathname==="/"){res.setHeader("Content-Type","text/html");res.end(html);return;}
    const target=path.resolve(root,"."+decodeURIComponent(url.pathname));if(!target.startsWith(root+path.sep)&&!target.startsWith(root))throw new Error("Path");
    res.setHeader("Content-Type",url.pathname.endsWith(".css")?"text/css":"text/javascript");res.end(await readFile(target));
  }catch{res.statusCode=404;res.end("Not found");}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true,args:["--enable-unsafe-swiftshader"]});
const results={kind:"synthetic-local-browser",production:false,likeness_acceptance:false,checks:[]};
try {
 const context=await browser.newContext({viewport:{width:1280,height:1000}}),page=await context.newPage(),errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 await page.addInitScript(()=>{
   const id=n=>`${String(n).padStart(8,"0")}-1111-4111-8111-111111111111`;
   const state={legacy:{id:1,subject_name:"Synthetic QA Legacy",access_role:"owner",setup_status:"active"},calls:[],profile:{revision:0,enabled:false,current_version_id:null,desired_version_id:null,deleted:false},versions:{},revoke:false};
   window.__visualQA=state;window.LegaryaWorkspace={getActiveLegacy:()=>state.legacy};
   const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(n=>n.toString(16).padStart(2,"0")).join("");
   const picture=async(w,h)=>{const c=document.createElement("canvas");c.width=w;c.height=h;const g=c.getContext("2d");g.fillStyle="#b24e38";g.fillRect(0,0,w,h/2);g.fillStyle="#28567c";g.fillRect(0,h/2,w,h/2);g.fillStyle="#e6c999";g.fillRect(w*.4,h*.2,w*.2,h*.6);return new Uint8Array(await(await new Promise(r=>c.toBlob(r,"image/png"))).arrayBuffer());};
   let original,bundle;
   async function assets(){if(bundle)return bundle;const atlas=await picture(512,512),poster=await picture(256,256);const rig={recipe_version:"portrait_2d_v1",topology_version:1,fake_only:false,request_identity_sha256:"a".repeat(64),atlas_sha256:await digest(atlas),poster_sha256:await digest(poster),atlas_size:[512,512],crop_rect:[0,0,512,512],patches:{mouth:[.2,.6,.6,.3],blink_left:[.1,.2,.3,.2],blink_right:[.6,.2,.3,.2]},vertices:[[0,0],[1,0],[1,1],[0,1]],uvs:[[0,0],[1,0],[1,1],[0,1]],triangles:[[0,1,2],[0,2,3]],deformations:{mouth:[0,0,0,0],blink_left:[0,0,0,0],blink_right:[0,0,0,0]}};
    const bytes={poster,texture_atlas:atlas,rig:new TextEncoder().encode(JSON.stringify(rig))};const descriptors=[];
    for(const [i,role]of ["poster","rig","texture_atlas"].entries())descriptors.push({id:id(i+20),role,mime_type:role==="rig"?"application/json":"image/png",sha256:await digest(bytes[role]),byte_size:bytes[role].length});
    const bundle_digest=await digest(new TextEncoder().encode(JSON.stringify({assets:descriptors.map(a=>({byte_size:a.byte_size,mime_type:a.mime_type,role:a.role,sha256:a.sha256})),recipe:"portrait_2d_v1"})));
    bundle={bytes,descriptors,bundle_digest};return bundle;
   }
   let source={id:id(2),legacy_id:1,kind:"image",safety_state:"clean",state:"ready",mime_type:"image/png",original_filename:"Synthetic color-layout fixture.png"};
   state.sources={[source.id]:source};state.sourceSerial=2;state.requests={};
   function denied(){const e=new Error("Synthetic unavailable");e.status=404;throw e;}
   window.LegaryaAuthApi={
    async apiRequest(route,options={}){
      state.calls.push({route,method:options.method||"GET",body:options.body});
      if(options.signal?.aborted)throw new DOMException("Aborted","AbortError");
      if(route.endsWith("/capabilities"))return{enabled:true,can_manage:state.legacy.access_role==="owner",can_prepare:["active","collecting_identity"].includes(state.legacy.setup_status),confirmation_copy_version:"l19-likeness-v1"};
      if(route.endsWith("/sources")){if(options.method==="POST"){source={...source,id:id(++state.sourceSerial),legacy_id:state.legacy.id,processing_purpose:"visual_reference",original_filename:options.body.filename};state.sources[source.id]=source;return source;}return Object.values(state.sources);}
      if(/\/sources\/[^/]+$/.test(route))return state.sources[route.split("/").pop()];
      if(route.endsWith("/versions")&&options.method==="POST"){
        if(state.holdGeneration)await new Promise(resolve=>{state.releaseGeneration=resolve;});
        if(state.requests[options.body.request_key])return state.requests[options.body.request_key];assertBody(options.body);if(state.failGeneration){state.failGeneration=false;const e=new Error("Synthetic failure");e.status=503;throw e;}const b=await assets(),v={id:id(100+state.profile.revision),state:state.nextVersionState||"ready",failure_code:state.nextVersionFailure||null,version_number:state.profile.revision+1,source_id:options.body.source_id,crop:options.body.crop,bundle_digest:b.bundle_digest};state.versions[v.id]=v;state.profile.desired_version_id=v.id;state.profile.deleted=false;state.profile.revision++;state.requests[options.body.request_key]=v;return v;
      }
      if(route.endsWith("/activate")){const b=options.body;if(b.expected_revision!==state.profile.revision||!b.approved||b.bundle_digest!==(await assets()).bundle_digest)throw new Error("Stale activation");state.profile.current_version_id=b.version_id;state.profile.enabled=true;state.profile.revision++;return{...state.profile};}
      if(route.includes("/manifest")||route.endsWith("/active-manifest")){
        if(state.revoke)denied();const b=await assets(),v=route.includes("/versions/")?route.split("/versions/")[1].split("/")[0]:state.profile.current_version_id;if(!v)denied();
        const base=`/api/v1/legacies/${state.legacy.id}/visual-companion/${route.includes("/versions/")?"versions/"+v:"active"}/assets/`;
        return{version_id:v,recipe:"portrait_2d_v1",revision:state.profile.revision,bundle_digest:b.bundle_digest,lease_seconds:15,valid_until:new Date(Date.now()+15000).toISOString(),assets:b.descriptors.map(a=>({...a,content_path:base+a.id+"/content"}))};
      }
      if(route.includes("/versions/"))return {...state.versions[route.split("/versions/")[1]]};
      if(route.includes("/visual-companion")){
        if(options.method==="PATCH"){if(options.body.expected_revision!==state.profile.revision)throw new Error("Stale toggle");state.profile.enabled=options.body.enabled;state.profile.revision++;}
        if(options.method==="DELETE"){state.profile={...state.profile,enabled:false,current_version_id:null,desired_version_id:null,deleted:true,revision:state.profile.revision+1};}
        return{...state.profile};
      }
      throw new Error("Unexpected synthetic API path");
    },
    async authenticatedMediaFetch(route,options={}){original ||= await picture(1200,800);if(options.method==="PUT"){const row=state.sources[route.split("/").at(-2)];if(state.holdUpload)await new Promise(resolve=>{state.releaseUpload=resolve;});return new Response(JSON.stringify(row),{headers:{"Content-Type":"application/json"}});}return new Response(original,{headers:{"Content-Type":"image/png"}});},
    async authenticatedVisualFetch(route){if(state.revoke)denied();const b=await assets(),a=b.descriptors.find(a=>route.endsWith("/"+a.id+"/content"));if(!a)denied();return new Response(b.bytes[a.role],{headers:{"Content-Type":a.mime_type}});}
   };
   function assertBody(b){if(!b.confirmed||b.confirmation_copy_version!=="l19-likeness-v1"||!b.request_key||b.expected_revision!==state.profile.revision)throw new Error("Missing explicit confirmation");}
 });
 await page.goto(origin);
 const png=Buffer.from(await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=800;c.height=1000;const g=c.getContext('2d');g.fillStyle='#bda070';g.fillRect(0,0,800,1000);return [...new Uint8Array(await (await new Promise(r=>c.toBlob(r,'image/png'))).arrayBuffer())];}));
 const upload=async name=>{await page.locator('[data-upload]:not([disabled])').waitFor({state:'visible'});await page.locator('[data-upload]').setInputFiles({name,mimeType:'image/png',buffer:png});};
 const ready=()=>page.locator('[data-approve]:not([disabled])').waitFor();
 const approved=async()=>{await page.locator('[data-approve]').click();await page.getByText("Saved as this Legacy's face. Upload a new photo whenever you want to change it.",{exact:true}).waitFor();};
 const count=()=>page.evaluate(()=>window.__visualQA.calls.filter(c=>c.route.endsWith('/versions')&&c.method==='POST').length);
 await page.locator('#openVisualPresence').click();await page.locator('[data-manage]').waitFor({state:'visible'});
 assert.equal(await page.locator('[data-toggle],[data-replace],[data-source],[data-generate],[data-view-current]').count(),0);
 assert.match(await page.locator('#visualPermission').innerText(),/I confirm I have permission/);
 assert.equal(await count(),0);results.checks.push('no-prepare-on-open','simple-upload-preview-approve-controls');
 await page.evaluate(()=>{window.__visualQA.holdUpload=true;window.__visualQA.nextVersionState='queued';});
 await upload('Synthetic first portrait.png');await page.locator('[data-original]').waitFor({state:'visible'});
 assert.equal(await page.locator('[data-approve]').isDisabled(),true);assert.equal(await count(),0);
 await page.waitForFunction(()=>typeof window.__visualQA.releaseUpload==='function');
 await page.evaluate(()=>{window.__visualQA.holdUpload=false;window.__visualQA.releaseUpload();});
 await page.waitForFunction(()=>!!window.__visualQA.profile.desired_version_id);
 assert.equal(await page.locator('[data-approve]').isDisabled(),true);
 await page.evaluate(()=>{window.__visualQA.versions[window.__visualQA.profile.desired_version_id].state='ready';window.__visualQA.nextVersionState='ready';});
 await ready();assert.equal(await count(),1);assert.equal(await page.evaluate(()=>window.__visualQA.profile.enabled),false);
 if(process.env.L19_SCREENSHOT_DIR)await page.locator('dialog.visual-settings').screenshot({path:path.join(process.env.L19_SCREENSHOT_DIR,'face-flow-desktop.png')});
 results.checks.push('immediate-private-photo','upload-automatically-prepares','queued-preview-polls-to-ready-without-a-button','private-until-approval');
 await approved();const first=await page.evaluate(()=>window.__visualQA.profile.current_version_id);
 await page.locator('[data-close]').click();await page.locator('#openVisualPresence').click();
 await page.locator('[data-preview][data-visual-state="IDLE"]').waitFor({state:'visible'});
 await page.locator('.visual-presence-canvas:visible,.visual-presence-poster:visible').first().waitFor();
 assert.equal(await count(),1);results.checks.push('approved-face-opens-automatically-without-new-generation');
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('.visual-presence-poster').waitFor({state:'visible'});await page.emulateMedia({reducedMotion:'no-preference'});
 results.checks.push('system-reduced-motion-private-poster');
 await upload('Synthetic replacement portrait.png');await ready();
 assert.equal(await page.evaluate(()=>window.__visualQA.profile.current_version_id),first);
 assert.notEqual(await page.evaluate(()=>window.__visualQA.profile.desired_version_id),first);
 await approved();assert.notEqual(await page.evaluate(()=>window.__visualQA.profile.current_version_id),first);
 results.checks.push('replacement-preserves-current-until-approval','approve-replacement-sets-face-without-enable');
 await upload('Synthetic frame test.png');await ready();
 await page.locator('[data-framing] summary').click();await page.locator('.visual-crop-canvas').focus();await page.keyboard.press('+');
 assert.equal(await page.locator('[data-approve]').isDisabled(),true);const beforeCrop=await count();
 await page.locator('[data-regenerate]').click();await ready();assert.equal(await count(),beforeCrop+1);
 const lastBody=await page.evaluate(()=>window.__visualQA.calls.filter(c=>c.route.endsWith('/versions')&&c.method==='POST').at(-1).body);
 assert.ok(lastBody.crop.width<1);assert.equal(lastBody.confirmed,true);
 results.checks.push('framing-change-invalidates-approval','regenerate-beside-preview-new-confirmed-request');
 await page.evaluate(()=>{window.__visualQA.holdGeneration=true;window.__visualQA.nextVersionState='queued';});
 await page.locator('[data-regenerate]').click();await page.waitForFunction(()=>typeof window.__visualQA.releaseGeneration==='function');
 assert.equal(await page.locator('[data-preview]').isHidden(),true);
 assert.equal(await page.locator('[data-approve]').isDisabled(),true);
 assert.match(await page.locator('[data-candidate-status]').innerText(),/Creating your private preview/);
 await page.evaluate(()=>{window.__visualQA.holdGeneration=false;window.__visualQA.releaseGeneration();});
 await page.getByText('Creating your private preview… Your current Legacy face is unchanged.',{exact:true}).waitFor();
 assert.equal(await page.locator('[data-approve]').isDisabled(),true);
 await page.evaluate(()=>{window.__visualQA.versions[window.__visualQA.profile.desired_version_id].state='ready';window.__visualQA.nextVersionState='ready';});
 await ready();results.checks.push('regenerate-retires-old-preview-without-false-delivery-error');
 for(const width of [390,820,320]){await page.setViewportSize({width,height:1000});assert.ok(await page.locator('.visual-settings').evaluate(e=>e.scrollWidth<=innerWidth));}
 results.checks.push('mobile-and-tablet-no-overflow');
 await page.evaluate(()=>{window.__visualQA.revoke=true;});await page.locator('[data-preview][data-visual-state="DISABLED"]').waitFor();
 assert.equal(await page.locator('[data-approve]').isDisabled(),true);assert.equal(await page.locator('.visual-presence-poster').count(),0);
 assert.match(await page.locator('[data-candidate-status]').innerText(),/could not be displayed/);
 await page.evaluate(()=>{window.__visualQA.revoke=false;});
 results.checks.push('expired-access-removes-private-bytes-and-explains-retry');
 await page.evaluate(()=>{window.__visualQA.failGeneration=true;});const beforeFail=await count();
 await upload('Synthetic retry portrait.png');await page.getByText(/Face recreation is temporarily unavailable/).first().waitFor();
 assert.equal(await page.locator('[data-approve]').isDisabled(),true);
 await page.locator('[data-regenerate]').click();await ready();
 const retries=await page.evaluate(()=>window.__visualQA.calls.filter(c=>c.route.endsWith('/versions')&&c.method==='POST').slice(-2).map(c=>c.body.request_key));
 assert.equal(retries[0],retries[1]);assert.equal(await count(),beforeFail+2);results.checks.push('generation-error-visible-and-idempotent-retry');
 await page.evaluate(()=>{window.__visualQA.nextVersionState='needs_recrop';});
 await upload('Synthetic invalid frame.png');await page.getByText(/We could not prepare this photo/).waitFor();
 assert.equal(await page.locator('[data-approve]').isDisabled(),true);
 assert.equal(await page.locator('[data-framing]').evaluate(e=>e.open),true);
 await page.evaluate(()=>{window.__visualQA.nextVersionState='ready';});await page.locator('[data-regenerate]').click();await ready();
 results.checks.push('failed-preparation-explains-framing-and-regenerate-recovery');
 await page.evaluate(()=>{window.__visualQA.nextVersionState='failed';window.__visualQA.nextVersionFailure='visual_storage_unavailable';});
 await upload('Synthetic storage retry.png');await page.getByText(/Private photo storage could not be reached/).waitFor();
 assert.equal(await page.locator('[data-approve]').isDisabled(),true);assert.equal(await page.locator('[data-framing]').evaluate(e=>e.open),false);
 await page.evaluate(()=>{window.__visualQA.nextVersionState='ready';window.__visualQA.nextVersionFailure=null;});
 await page.locator('[data-regenerate]').click();await ready();assert.equal(await page.locator('[data-notice]').evaluate(e=>e.classList.contains('visual-error')),false);
 results.checks.push('storage-failure-not-misreported-as-bad-photo-and-retries');

 await page.locator('[data-close]').click();const beforeRole=await page.evaluate(()=>window.__visualQA.calls.length);
 await page.evaluate(()=>{window.__visualQA.legacy={...window.__visualQA.legacy,access_role:'collaborator'};dispatchEvent(new Event('legarya-legacy-change'));});
 await page.locator('#openVisualPresence').click();await page.getByText(/Face recreation is managed by the Legacy owner/).waitFor();
 assert.equal(await page.evaluate(()=>window.__visualQA.calls.length),beforeRole);results.checks.push('collaborator-no-owner-api');
 for(const id of [2,3]){
   await page.evaluate(id=>{window.__visualQA.legacy={id,subject_name:null,access_role:'owner',setup_status:'collecting_identity'};window.__visualQA.profile={revision:0,enabled:false,current_version_id:null,desired_version_id:null,deleted:false};dispatchEvent(new Event('legarya-legacy-change'));},id);
   await page.locator('#openVisualPresence').click();await upload('Synthetic unfinished Legacy.png');await ready();
   assert.equal(await page.evaluate(()=>window.__visualQA.profile.enabled),false);await approved();
   assert.equal(await page.evaluate(()=>window.__visualQA.legacy.subject_name),null);
   assert.equal(await page.evaluate(()=>window.__visualQA.legacy.setup_status),'collecting_identity');
   results.checks.push('pending-legacy-'+id+'-automatic-preview-and-approve');
 }
 await page.evaluate(()=>{window.__visualQA.holdUpload=true;});await upload('Synthetic interrupted upload.png');await page.waitForFunction(()=>typeof window.__visualQA.releaseUpload==='function');
 const beforeSwitch=await count();await page.locator('[data-close]').click();
 await page.evaluate(()=>{window.__visualQA.legacy={id:4,subject_name:null,access_role:'owner',setup_status:'collecting_identity'};window.__visualQA.profile={revision:0,enabled:false,current_version_id:null,desired_version_id:null,deleted:false};dispatchEvent(new Event('legarya-legacy-change'));window.__visualQA.holdUpload=false;window.__visualQA.releaseUpload();});
 await page.locator('#openVisualPresence').click();await page.locator('[data-manage]').waitFor({state:'visible'});
 assert.equal(await page.locator('[data-original]').isVisible(),false);assert.equal(await count(),beforeSwitch);
 assert.equal(await page.locator('.visual-crop-canvas').count(),0);results.checks.push('late-upload-after-close-cannot-cross-legacy-or-prepare');
 for(const legacy of [{id:5,access_role:'viewer',setup_status:'active'},null]){
   await page.evaluate(value=>{window.__visualQA.legacy=value;dispatchEvent(new Event('legarya-legacy-change'));},legacy);
   assert.equal(await page.locator('#openVisualPresence').isVisible(),false);assert.equal(await page.locator('dialog.visual-settings').evaluate(e=>e.open),false);
 }
 results.checks.push('viewer-and-missing-legacy-hidden');assert.deepEqual(errors,[]);results.pageErrors=0;
 console.log(JSON.stringify(results,null,2));await context.close();
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
