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
   const source={id:id(2),legacy_id:1,kind:"image",safety_state:"clean",state:"ready",mime_type:"image/png",original_filename:"Synthetic color-layout fixture.png"};
   function denied(){const e=new Error("Synthetic unavailable");e.status=404;throw e;}
   window.LegaryaAuthApi={
    async apiRequest(route,options={}){
      state.calls.push({route,method:options.method||"GET",body:options.body});
      if(options.signal?.aborted)throw new DOMException("Aborted","AbortError");
      if(route.endsWith("/capabilities"))return{enabled:true,can_manage:state.legacy.access_role==="owner",can_prepare:["active","collecting_identity"].includes(state.legacy.setup_status),confirmation_copy_version:"l19-likeness-v1"};
      if(route.endsWith("/sources")){if(options.method==="POST"){source.legacy_id=state.legacy.id;return source;}return [source];}
      if(route.endsWith("/sources/"+source.id))return source;
      if(route.endsWith("/versions")&&options.method==="POST"){
        assertBody(options.body);const b=await assets(),v={id:id(100+state.profile.revision),state:"ready",version_number:state.profile.revision+1,source_id:source.id,crop:options.body.crop,bundle_digest:b.bundle_digest};state.versions[v.id]=v;state.profile.desired_version_id=v.id;state.profile.deleted=false;state.profile.revision++;return v;
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
    async authenticatedMediaFetch(route,options={}){original ||= await picture(1200,800);if(options.method==="PUT")return new Response(JSON.stringify(source),{headers:{"Content-Type":"application/json"}});return new Response(original,{headers:{"Content-Type":"image/png"}});},
    async authenticatedVisualFetch(route){if(state.revoke)denied();const b=await assets(),a=b.descriptors.find(a=>route.endsWith("/"+a.id+"/content"));if(!a)denied();return new Response(b.bytes[a.role],{headers:{"Content-Type":a.mime_type}});}
   };
   function assertBody(b){if(!b.confirmed||b.confirmation_copy_version!=="l19-likeness-v1"||!b.request_key||b.expected_revision!==state.profile.revision)throw new Error("Missing explicit confirmation");}
 });
 await page.goto(origin);await page.locator("#openVisualPresence").click();
 await page.locator("[data-source]").selectOption({label:"Synthetic color-layout fixture.png"});await page.locator(".visual-crop-canvas").waitFor();
 assert.equal(await page.locator("[data-generate]").isDisabled(),true);
 await page.locator(".visual-crop-canvas").focus();await page.keyboard.press("ArrowRight");await page.keyboard.press("+");
 await page.locator("[data-confirm]").check();await page.getByRole("button",{name:"Rotate 90°"}).click();assert.equal(await page.locator("[data-confirm]").isChecked(),false);
 await page.locator("[data-confirm]").check();await page.locator("[data-generate]").click();await page.locator("[data-approve]:not([disabled])").waitFor();
 const body=await page.evaluate(()=>window.__visualQA.calls.find(c=>c.route.endsWith("/versions")&&c.method==="POST").body);
 assert.equal(body.crop.rotation,90);assert.ok(Math.abs(body.crop.width*800-body.crop.height*1200)<1e-6);
 assert.equal(await page.evaluate(()=>window.__visualQA.profile.enabled),false);results.checks.push("crop-keyboard-rotation-confirmation","private-before-approval");
 await page.locator(".visual-presence-canvas").waitFor({state:"visible"});
 if(process.env.L19_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.L19_SCREENSHOT_DIR,"visual-owner-desktop.png"),fullPage:true});
 await page.locator("[data-static]").check();assert.equal(await page.locator(".visual-presence-canvas").isVisible(),false);assert.equal(await page.locator(".visual-presence-poster").isVisible(),true);
 await page.locator("[data-static]").uncheck();await page.emulateMedia({reducedMotion:"reduce"});await page.locator(".visual-presence-canvas").waitFor({state:"hidden",timeout:1000});assert.equal(await page.locator(".visual-presence-poster").isVisible(),true);await page.emulateMedia({reducedMotion:"no-preference"});results.checks.push("static-toggle","system-reduced-motion");
 await page.locator("[data-approve]").click();await page.getByText("Approved and enabled for authorized Legacy calls.",{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__visualQA.profile.enabled),true);results.checks.push("explicit-exact-bundle-activation");
 await page.locator("[data-regenerate]").click();await page.locator(".visual-crop-canvas").waitFor();assert.equal(await page.locator("[data-confirm]").isChecked(),false);await page.locator("[data-confirm]").check();await page.locator("[data-generate]").click();await page.locator("[data-approve]:not([disabled])").waitFor();
 const profiles=await page.evaluate(()=>window.__visualQA.profile);assert.notEqual(profiles.current_version_id,profiles.desired_version_id);assert.equal(profiles.enabled,true);results.checks.push("replacement-preserves-current","regeneration-needs-fresh-confirmation");
 await page.setViewportSize({width:390,height:844});await page.locator("[data-candidate]").scrollIntoViewIfNeeded();if(process.env.L19_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.L19_SCREENSHOT_DIR,"visual-owner-mobile.png")});
 assert.ok(await page.evaluate(()=>document.querySelector(".visual-settings").scrollWidth<=390));results.checks.push("390px-layout");
 await page.setViewportSize({width:820,height:1180});assert.ok(await page.evaluate(()=>document.querySelector(".visual-settings").getBoundingClientRect().width<=820));results.checks.push("tablet-layout");
 await page.evaluate(()=>{window.__visualQA.revoke=true;});await page.locator(".visual-presence-poster").waitFor({state:"detached",timeout:10000});assert.equal(await page.locator("[data-approve]").isDisabled(),true);results.checks.push("lease-revocation-removes-private-bytes");
 await page.evaluate(()=>{window.__visualQA.revoke=false;});await page.locator("[data-toggle]").click();await page.getByText("Recreated face disabled. Voice and memories are unchanged.",{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__visualQA.profile.enabled),false);results.checks.push("owner-disable");
 await page.locator("[data-remove]").click();await page.locator("[data-delete-yes]").click();await page.getByText("Prepared portraits are being erased. The original photo remains in Media & Sources.",{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.__visualQA.calls.filter(c=>c.route.includes("/sources")&&c.method==="DELETE").length),0);results.checks.push("delete-retains-original");
 await page.locator("[data-close]").click();assert.equal(await page.locator(".visual-presence-canvas").count(),0);assert.equal(await page.locator(".visual-crop-canvas").count(),0);
 const before=await page.evaluate(()=>window.__visualQA.calls.length);await page.evaluate(()=>{window.__visualQA.legacy={...window.__visualQA.legacy,access_role:"collaborator"};dispatchEvent(new Event("legarya-legacy-change"));});await page.locator("#openVisualPresence").click();await page.getByText(/Face recreation is managed by the Legacy owner/).waitFor();assert.equal(await page.evaluate(()=>window.__visualQA.calls.length),before);results.checks.push("collaborator-no-owner-api","close-disposal");
 for(const legacyId of [2,3]) {
   await page.evaluate(id=>{window.__visualQA.legacy={id,subject_name:null,access_role:"owner",setup_status:"collecting_identity"};window.__visualQA.profile={revision:0,enabled:false,current_version_id:null,desired_version_id:null,deleted:false};window.__visualQA.versions={};dispatchEvent(new Event("legarya-legacy-change"));},legacyId);
   assert.equal(await page.locator("#openVisualPresence").isVisible(),true);
   const preparations=await page.evaluate(()=>window.__visualQA.calls.filter(c=>c.route.endsWith('/versions')&&c.method==='POST').length);
   await page.locator("#openVisualPresence").click();
   await page.locator('[data-upload]').waitFor({state:'visible'});
   await page.locator('[data-upload]').setInputFiles({name:'Synthetic pending photo.png',mimeType:'image/png',buffer:Buffer.from('synthetic upload adapter')});
   await page.locator('.visual-crop-canvas').waitFor();
   await page.locator('[data-confirm]').check();
   assert.equal(await page.locator('[data-generate]').isDisabled(),false);
   assert.match(await page.locator('[data-prepare-help]').innerText(),/Identity setup is not required/);
   await page.locator('[data-generate]').click();
   await page.locator('[data-approve]:not([disabled])').waitFor();
   assert.equal(await page.evaluate(()=>window.__visualQA.profile.enabled),false);
   await page.locator('[data-approve]').click();
   await page.getByText("Approved and enabled for authorized Legacy calls.",{exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>window.__visualQA.profile.enabled),true);
   assert.equal(await page.evaluate(()=>window.__visualQA.legacy.setup_status),'collecting_identity');
   assert.equal(await page.evaluate(()=>window.__visualQA.legacy.subject_name),null);
   assert.equal(await page.evaluate(()=>window.__visualQA.calls.filter(c=>c.route.endsWith('/versions')&&c.method==='POST').length),preparations+1);
   results.checks.push(`pending-legacy-${legacyId}-prepare-preview-approve-no-identity`);
 }
 await page.evaluate(()=>{window.__visualQA.legacy.setup_status="active";dispatchEvent(new Event("legarya-legacy-change"));});
 assert.equal(await page.locator("dialog.visual-settings").evaluate(e=>e.open),false);
 await page.locator("#openVisualPresence").click();await page.locator("[data-manage]").waitFor({state:"visible"});
 assert.ok(await page.evaluate(()=>window.__visualQA.calls.some(c=>c.route==="/legacies/3/visual-companion/capabilities")));
 assert.equal(await page.locator("[data-source] option").count(),2);
 results.checks.push("setup-completion-preserves-current-legacy-scope");
 await page.evaluate(()=>{window.__visualQA.legacy={id:4,subject_name:"Another completed Legacy",access_role:"owner",setup_status:"active"};dispatchEvent(new Event("legarya-legacy-change"));});
 assert.equal(await page.locator("dialog.visual-settings").evaluate(e=>e.open),false);
 assert.equal(await page.locator("#openVisualPresence").isVisible(),true);
 await page.locator("#openVisualPresence").click();await page.locator("[data-manage]").waitFor({state:"visible"});
 assert.ok(await page.evaluate(()=>window.__visualQA.calls.some(c=>c.route==="/legacies/4/sources")));
 assert.equal(await page.locator("[data-source] option").count(),1);
 results.checks.push("second-completed-legacy-visible-scoped");
 for(const legacy of [{id:5,access_role:"viewer",setup_status:"active"},null]) {
   await page.evaluate(value=>{window.__visualQA.legacy=value;dispatchEvent(new Event("legarya-legacy-change"));},legacy);
   assert.equal(await page.locator("#openVisualPresence").isVisible(),false);
   assert.equal(await page.locator("dialog.visual-settings").evaluate(e=>e.open),false);
 }
 results.checks.push("viewer-and-missing-legacy-hidden");
 assert.deepEqual(errors,[]);results.pageErrors=0;console.log(JSON.stringify(results,null,2));await context.close();
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
