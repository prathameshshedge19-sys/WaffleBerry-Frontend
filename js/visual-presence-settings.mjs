import { createVisualClient, visualError } from "./visual-presence-client.mjs?v=face1";
import { mountCropControls } from "./visual-crop.mjs?v=l19c1";
import { createVisualPresence } from "./visual-presence-controller.mjs?v=l19c1";
import { createPortraitRenderer } from "./legacy-portrait-renderer.mjs?v=l19c1";
import { waitForVisualSource } from "./visual-source-ready.mjs?v=l19c2";

const auth=window.LegaryaAuthApi, entry=document.querySelector("#openVisualPresence");
if(auth && entry && window.LegaryaMedia) {
  const client=createVisualClient(auth), media=window.LegaryaMedia.createClient(auth);
  const dialog=document.createElement("dialog");dialog.className="visual-settings";dialog.setAttribute("aria-labelledby","visualTitle");
  dialog.innerHTML=`<header><div><p class="visual-eyebrow">Legacy settings</p><h2 id="visualTitle">Recreate Legacy's Face</h2></div><button type="button" data-close aria-label="Close Recreate Legacy's Face">Close</button></header>
    <p data-subject class="visual-subject"></p><p class="visual-intro">Upload a photo. Review the private preview. Approve it as this Legacy's face. Identity setup is not required.</p>
    <p data-notice role="status" aria-live="polite"></p>
    <section data-manage hidden>
      <label class="visual-upload">Upload photo &amp; create private preview<input data-upload type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="visualPermission" disabled></label>
      <p id="visualPermission" class="visual-hint">By selecting a photo or clicking Regenerate, I confirm I have permission to use the pictured person's likeness for this Legacy's AI-generated Visual Companion, not a recording of that person.</p>
      <p class="visual-hint">Use a clear photo of one person. JPEG, PNG or WebP, up to 20 MB. A new upload never changes the current face until you approve its preview.</p>
      <section data-candidate hidden><h3 data-preview-title>Private preview</h3><p data-candidate-status role="status" aria-live="polite"></p>
        <img data-original class="visual-upload-preview" alt="Your uploaded photo, not yet approved as the Legacy face" hidden>
        <div class="visual-preview" data-preview aria-hidden="true" hidden></div>
        <div class="visual-actions"><button type="button" data-approve disabled>Approve as Legacy face</button><button type="button" data-regenerate aria-describedby="visualPermission" disabled>Regenerate</button></div>
        <p class="visual-hint">Only an approved preview becomes the Legacy's face. Memories and voice are unchanged.</p>
        <details data-framing hidden><summary>Adjust framing (optional)</summary><p>Frame one person's full face with some headroom, then click Regenerate above to update the preview.</p><div data-crop></div></details>
      </section>
    </section>`;
  document.body.append(dialog);
  const find=s=>dialog.querySelector(s), getLegacy=()=>window.LegaryaWorkspace?.getActiveLegacy();
  let epoch=0,account=null,abort=null,timer=null,busy=false,legacy=null,capabilities=null,profile=null;
  let candidate=null,crop=null,bitmap=null,source=null,preview=null,pending=null,upload=null,queuedFile=null;
  let originalUrl=null,framingChanged=false,polls=0,focus=null,mounting=false,previewEpoch=0;
  const current=t=>dialog.open&&t===epoch&&account===auth.getSessionEpoch?.()&&getLegacy()?.id===legacy?.id&&getLegacy()?.access_role==="owner";
  const notice=(text,error=false)=>{find("[data-notice]").textContent=text;find("[data-notice]").classList.toggle("visual-error",error);};
  const status=text=>{find("[data-candidate-status]").textContent=text;};
  function clearPreview(){++previewEpoch;preview?.dispose();preview=null;find("[data-preview]").replaceChildren();find("[data-preview]").hidden=true;}
  function clearPhoto(){
    crop?.dispose();crop=null;bitmap?.close();bitmap=null;source=null;pending=null;framingChanged=false;
    if(originalUrl)URL.revokeObjectURL(originalUrl);originalUrl=null;
    find("[data-original]").removeAttribute("src");find("[data-original]").hidden=true;find("[data-framing]").hidden=true;find("[data-framing]").open=false;
  }
  function retire(){++epoch;abort?.abort();abort=null;clearTimeout(timer);timer=null;clearPreview();clearPhoto();upload=queuedFile=candidate=profile=capabilities=null;busy=false;find("[data-upload]").value="";}
  function close(){retire();dialog.close();focus?.focus();}
  function lock(value){
    busy=value;find("[data-crop]").inert=value;find("[data-upload]").disabled=value||!capabilities?.can_manage;
    const preparing=["queued","preparing"].includes(candidate?.state),approved=candidate?.id===profile?.current_version_id&&profile?.enabled;
    find("[data-approve]").disabled=value||framingChanged||!preview?.approval()||approved;
    find("[data-approve]").textContent=approved?"Current Legacy face":"Approve as Legacy face";
    find("[data-regenerate]").disabled=value||preparing||!capabilities?.can_prepare||!(source||candidate||upload);
    find("[data-candidate]").setAttribute("aria-busy",String(value||preparing));
  }
  function userError(message){const error=new Error("Face preparation interrupted");error.userMessage=message;return error;}
  async function perform(action){
    if(busy||!current(epoch))return;const token=epoch;lock(true);
    try{await action(token);}catch(error){if(current(token)){
      const message=error.userMessage||visualError(error);notice(message,true);status(message);
      if([401,403,404,410].includes(error.status)){clearPreview();clearPhoto();candidate=upload=null;}
    }}finally{if(current(token)){lock(false);if(queuedFile){const file=queuedFile;queuedFile=null;void perform(t=>uploadPhoto(file,t));}}}
  }
  async function refreshProfile(token){const row=await client.profile(legacy.id,abort.signal);if(current(token)){profile=row;lock(busy);}}
  function schedule(id,token){
    clearTimeout(timer);timer=setTimeout(()=>{timer=null;if(!current(token)||candidate?.id!==id)return;
      // A busy upload must not permanently swallow the status polling tick.
      if(busy){schedule(id,token);return;}void perform(t=>showVersion(id,t));
    },3000);
  }
  async function showVersion(id,token){
    clearTimeout(timer);timer=null;const next=await client.version(legacy.id,id,abort.signal);if(!current(token))return;
    const changed=candidate?.id!==next.id;candidate=next;find("[data-candidate]").hidden=false;
    const approved=next.id===profile?.current_version_id&&profile?.enabled;find("[data-preview-title]").textContent=approved?"Current Legacy face":"Private preview";
    if(next.state==="ready"){
      if(changed||!preview||!preview.approval()){
        clearPreview();const presentation=previewEpoch;find("[data-preview]").hidden=false;
        preview=createVisualPresence({host:find("[data-preview]"),client,legacyId:legacy.id,version:next.id,name:legacy.subject_name||"L",preview:true,
          guard:()=>current(token)&&candidate?.id===next.id,rendererFactory:createPortraitRenderer,onState:state=>{
            if(!current(token)||presentation!==previewEpoch)return;
            if(state==="ERROR"||state==="DISABLED")status("Preview could not be displayed. Click Regenerate to try again; your current face is unchanged.");lock(busy);
          }});
        await preview.start();if(!current(token))return;
      }
      if(preview?.approval()){
        find("[data-original]").hidden=true;
        status(framingChanged?"Framing changed. Click Regenerate to create a preview of this frame before approving.":approved?"This is the approved face. Upload a new photo whenever you want to change it.":"Your private preview is ready. Approve it if you are happy with the result, or Regenerate.");
      }
    }else{
      clearPreview();if(originalUrl)find("[data-original]").hidden=false;
      if(["queued","preparing"].includes(next.state)){
        status("Creating your private preview… Your current Legacy face is unchanged.");
        if(polls++<100)schedule(id,token);else{candidate={...candidate,state:"polling_paused"};status("Preparation is taking longer. Click Regenerate to check again, or reopen this panel later.");}
      }else{
        const recrop=next.state==="needs_recrop"||["visual_needs_recrop","visual_crop_invalid","visual_crop_not_square","visual_image_dimensions"].includes(next.failure_code);
        if(recrop){
          if(!crop&&next.source_id){const row=await media.source(legacy.id,next.source_id,abort.signal);if(!current(token))return;await loadSource(row,token,next.crop);if(!current(token))return;}
          status("We could not prepare this photo. Open Adjust framing, include one clear face, then click Regenerate. You can also upload a different photo.");
          if(crop)find("[data-framing]").open=true;
        }else status(next.failure_code==="visual_storage_unavailable"?"Private photo storage could not be reached. Click Regenerate to retry. Your current Legacy face is unchanged.":"Preview preparation did not finish. Click Regenerate to retry, or upload another photo. Your current Legacy face is unchanged.");
      }
    }lock(busy);
  }
  async function showPhoto(blob,token,initial=null){
    if(blob.size>20*1024*1024||!["image/jpeg","image/png","image/webp"].includes(blob.type))throw userError("Upload a JPEG, PNG or WebP photo up to 20 MB.");
    let decoded;try{decoded=await createImageBitmap(blob,{imageOrientation:"from-image"});}catch{throw userError("This photo could not be opened. Try another JPEG, PNG or WebP image.");}
    if(!current(token)){decoded.close();return;}clearPhoto();bitmap=decoded;originalUrl=URL.createObjectURL(blob);find("[data-original]").src=originalUrl;
    find("[data-original]").hidden=false;find("[data-candidate]").hidden=false;find("[data-preview-title]").textContent="Private preview";mounting=true;
    try{crop=mountCropControls(find("[data-crop]"),bitmap,{initial,onChange:()=>{
      if(mounting)return;pending=null;framingChanged=true;status("Framing changed. Click Regenerate to create a preview of this frame before approving.");lock(busy);
    }});}catch{throw userError("Use a photo at least 128 pixels wide and high, no larger than 24 megapixels or 8192 pixels on either edge.");}finally{mounting=false;}
    find("[data-framing]").hidden=false;
  }
  async function loadSource(row,token,initial=null){
    if(row.legacy_id!==legacy.id)throw userError("This photo is not available in the selected Legacy.");
    await showPhoto(await media.original(legacy.id,row.id,abort.signal),token,initial);if(current(token))source=row;
  }
  async function prepare(token){
    if(!source||!crop)return;
    if(!capabilities.can_prepare)throw userError("Your photo is saved, but face preparation is temporarily unavailable. Reopen this panel to try again later.");
    await refreshProfile(token);if(!current(token))return;
    // Upload/Regenerate is an explicit confirmation with adjacent permission
    // wording. Opening/reloading a saved photo never grants consent or approval.
    pending||={source_id:source.id,crop:crop.value(),confirmed:true,confirmation_copy_version:capabilities.confirmation_copy_version,
      request_key:crypto.randomUUID(),expected_revision:profile.revision};
    pending.expected_revision=profile.revision;
    // Retiring a previous private preview is intentional, not a delivery error.
    clearPreview();if(originalUrl)find("[data-original]").hidden=false;
    notice("Your photo stays private until you approve its preview.");status("Creating your private preview…");const created=await client.generate(legacy.id,pending,abort.signal);if(!current(token))return;
    pending=null;framingChanged=false;polls=0;clearPreview();candidate=null;await refreshProfile(token);if(current(token))await showVersion(created.id,token);
  }
  async function uploadPhoto(file,token){
    if(!file)return;if(!["image/jpeg","image/png","image/webp"].includes(file.type)||!file.size||file.size>20*1024*1024)throw userError("Upload a JPEG, PNG or WebP photo up to 20 MB.");
    clearTimeout(timer);timer=null;clearPreview();candidate=null;pending=null;
    const request=upload?.file===file?upload:{file,key:crypto.randomUUID(),source:null};upload=request;
    await showPhoto(file,token);if(!current(token))return;notice("Your photo stays private until you approve its preview.");status("Uploading your photo…");
    request.source||=await auth.apiRequest(`/legacies/${legacy.id}/sources`,{authenticated:true,method:"POST",signal:abort.signal,
      body:{filename:file.name,kind:"image",mime_type:file.type,size_bytes:file.size,upload_request_key:request.key,processing_purpose:"visual_reference"}});
    if(!current(token))return;const uploaded=await media.upload(legacy.id,request.source.id,file,abort.signal);if(!current(token))return;
    status("Checking your photo, then creating your private preview…");let row;
    try{row=await waitForVisualSource(media,legacy.id,uploaded,{signal:abort.signal,current:()=>current(token)});}
    catch(error){if(error.name==="AbortError")throw error;throw userError("Your photo could not finish validation. Click Regenerate to retry, or upload another photo.");}
    if(!current(token))return;source=row;upload=null;find("[data-upload]").value="";await prepare(token);
  }
  async function regenerate(token){
    if(upload){await uploadPhoto(upload.file,token);return;}
    if(candidate&&["polling_paused","queued","preparing"].includes(candidate.state)){polls=0;await showVersion(candidate.id,token);return;}
    if(!source&&candidate){const version=await client.version(legacy.id,candidate.id,abort.signal);if(!current(token))return;
      const row=await media.source(legacy.id,version.source_id,abort.signal);if(!current(token))return;await loadSource(row,token,version.crop);}
    if(current(token))await prepare(token);
  }
  async function open(){
    retire();legacy=getLegacy();if(!legacy)return;legacy={...legacy};account=auth.getSessionEpoch?.();focus=document.activeElement;dialog.showModal();abort=new AbortController();
    find("[data-manage]").hidden=true;find("[data-candidate]").hidden=true;find("[data-subject]").textContent=legacy.subject_name||"Selected Legacy";
    if(legacy.access_role!=="owner"){notice("Face recreation is managed by the Legacy owner.");return;}
    await perform(async token=>{
      notice("Loading your Legacy face…");const available=await client.capabilities(legacy.id,abort.signal);if(!current(token))return;capabilities=available;
      if(!capabilities.enabled||!capabilities.can_manage||capabilities.confirmation_copy_version!=="l19-likeness-v1")throw userError("Face recreation is not available for this Legacy right now.");
      await refreshProfile(token);if(!current(token))return;find("[data-manage]").hidden=false;
      notice("Upload a photo to create a private preview automatically. Nothing changes until you approve.");polls=0;
      const id=profile.desired_version_id||profile.current_version_id;
      if(id)await showVersion(id,token);
      else{
        // Recover an unfinished upload without recording consent on panel open.
        const rows=await media.list(legacy.id,abort.signal);if(!current(token))return;
        const last=rows.filter(row=>row.legacy_id===legacy.id&&row.processing_purpose==="visual_reference"&&row.kind==="image"&&row.safety_state==="clean"&&!["uploading","failed","deleting","deleted"].includes(row.state))
          .sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")))[0];
        if(last){await loadSource(last,token);if(current(token))status("Your previous upload is saved. Click Regenerate to create its private preview, or upload a new photo.");}
      }
    });
  }
  find("[data-upload]").addEventListener("change",()=>{const file=find("[data-upload]").files[0];if(!file||!current(epoch))return;if(busy){queuedFile=file;return;}void perform(t=>uploadPhoto(file,t));});
  find("[data-regenerate]").addEventListener("click",()=>void perform(regenerate));
  find("[data-approve]").addEventListener("click",()=>void perform(async token=>{
    const receipt=preview?.approval();if(!receipt||framingChanged||receipt.version_id!==candidate?.id)return;
    await client.activate(legacy.id,receipt,abort.signal);if(!current(token))return;
    window.dispatchEvent(new CustomEvent("legarya:visual-invalidated",{detail:{legacyId:legacy.id}}));await refreshProfile(token);if(!current(token))return;
    notice("Saved as this Legacy's face. Upload a new photo whenever you want to change it.");await showVersion(receipt.version_id,token);
  }));
  find("[data-close]").addEventListener("click",close);dialog.addEventListener("cancel",e=>{e.preventDefault();close();});entry.addEventListener("click",()=>void open());
  function updateEntry(){if(dialog.open)close();const active=getLegacy();entry.hidden=!active||!["owner","collaborator"].includes(active.access_role);entry.title=active?.access_role==="collaborator"?"Managed by the Legacy owner":"Recreate Legacy's Face";}
  window.addEventListener("legarya-legacy-change",updateEntry);window.addEventListener("legarya:session-expired",close);window.addEventListener("legarya:session-ending",close);window.addEventListener("pagehide",close);
  document.addEventListener("visibilitychange",()=>{if(document.hidden&&dialog.open)close();});updateEntry();
}
