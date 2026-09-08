import { createVisualClient, visualError } from "./visual-presence-client.mjs?v=l19c1";
import { mountCropControls } from "./visual-crop.mjs?v=l19c1";
import { createVisualPresence } from "./visual-presence-controller.mjs?v=l19c1";
import { createPortraitRenderer } from "./legacy-portrait-renderer.mjs?v=l19c1";

const auth = window.LegaryaAuthApi, entry = document.querySelector("#openVisualPresence");
if (auth && entry && window.LegaryaMedia) {
  const client = createVisualClient(auth), media = window.LegaryaMedia.createClient(auth);
  const dialog = document.createElement("dialog"); dialog.className = "visual-settings";
  dialog.setAttribute("aria-labelledby", "visualTitle");
  dialog.innerHTML = `<header><div><p class="visual-eyebrow">Legacy settings</p><h2 id="visualTitle">Visual Presence</h2></div><button type="button" data-close aria-label="Close Visual Presence">Close</button></header>
    <p data-subject class="visual-subject"></p>
    <p class="visual-intro">A gentle, animated portrait for Legacy voice calls. Your memories remain the source of what is said. Visual Presence never creates facts or changes a voice.</p>
    <p data-notice role="status" aria-live="polite"></p>
    <section data-manage hidden><div class="visual-current"><h3>Current portrait</h3><p data-current></p><div class="visual-actions"><button type="button" data-view-current>Preview current</button><button type="button" data-toggle>Disable</button><button type="button" data-replace>Replace photo</button><button type="button" data-regenerate>Regenerate</button><button type="button" data-remove>Delete Visual Companion</button></div></div>
    <div data-delete-confirm hidden class="visual-warning"><p>Delete the Visual Companion and its prepared portraits? The original photo stays in Media &amp; Sources. Memories, Timeline, Stories and conversations are unchanged.</p><button type="button" data-delete-yes>Delete prepared portraits</button><button type="button" data-delete-no>Keep portraits</button></div>
    <div data-chooser><h3>Choose a photo</h3><p>Use one clear face with room around the head. For a group photo, manually frame only the intended person. Faded, grayscale and old photographs are welcome.</p><label>Existing Media &amp; Sources image<select data-source><option value="">Choose an image</option></select></label><p class="visual-or">or</p><label class="visual-upload">Upload a portrait<input data-upload type="file" accept="image/jpeg,image/png,image/webp"></label><p class="visual-hint">JPEG, PNG or WebP · up to 20 MB. New portrait uploads are private visual references: no memory suggestions or factual extraction.</p></div>
    <section data-crop-section hidden><h3>Frame one person</h3><p>Drag to position, use Zoom, or focus the image and use arrow keys. The square shown here is the exact crop used.</p><div data-crop></div>
    <label class="visual-confirm"><input type="checkbox" data-confirm><span data-consent></span></label><button type="button" data-generate disabled>Prepare private preview</button></section>
    <section data-candidate hidden><h3>Private preview</h3><p data-candidate-status></p><div class="visual-preview" data-preview aria-hidden="true"></div><p>AI-animated portrait, not a recording. Movement is approximate. Live calls use the existing standard AI voice, not the person's recorded voice.</p><label><input type="checkbox" data-static>Show static photo</label><div class="visual-actions"><button type="button" data-approve disabled>Approve &amp; use in Legacy calls</button><button type="button" data-refresh>Refresh preparation status</button></div><p class="visual-hint">Nothing is shown to visitors until you approve this exact preview. Your current approved portrait stays active while a replacement is prepared.</p></section>
    </section>`;
  document.body.append(dialog);
  const find = s => dialog.querySelector(s), getLegacy = () => window.LegaryaWorkspace?.getActiveLegacy();
  let epoch=0, selection=0, account=null, abort=null, timer=null, busy=false, legacy=null, capabilities=null, profile=null, candidate=null, sources=[];
  let crop=null, bitmap=null, source=null, preview=null, pending=null, upload=null, polls=0, focus=null;
  const current = token => dialog.open && token===epoch && account===auth.getSessionEpoch?.() && getLegacy()?.id===legacy?.id && getLegacy()?.access_role==="owner";
  function notice(text, error=false) { find("[data-notice]").textContent=text; find("[data-notice]").classList.toggle("visual-error",error); }
  function clearPreview() { preview?.dispose(); preview=null; find("[data-preview]").replaceChildren(); find("[data-approve]").disabled=true; }
  function clearCrop() { ++selection; crop?.dispose(); crop=null; bitmap?.close(); bitmap=null; source=null; pending=null; find("[data-confirm]").checked=false; find("[data-generate]").disabled=true; find("[data-crop-section]").hidden=true; }
  function retire() { ++epoch; abort?.abort(); abort=null; clearTimeout(timer); timer=null; clearPreview(); clearCrop(); sources=[]; upload=null; pending=null; busy=false; candidate=profile=capabilities=null; }
  function close() { retire(); dialog.close(); focus?.focus(); }
  const invalidate = () => window.dispatchEvent(new CustomEvent("legarya:visual-invalidated",{detail:{legacyId:legacy.id}}));
  function lock(value) {
    busy=value;
    find("[data-crop]").inert=value;
    for(const button of dialog.querySelectorAll("[data-manage] button, [data-manage] select, [data-upload], [data-confirm]")) button.disabled=value;
    find("[data-generate]").disabled=value || !crop || !find("[data-confirm]").checked || !capabilities?.can_prepare;
    find("[data-approve]").disabled=value || !preview?.approval() || candidate?.id===profile?.current_version_id;
    find("[data-toggle]").disabled=value || !profile?.current_version_id || profile.deleted;
    find("[data-regenerate]").disabled=value || !profile?.current_version_id || !capabilities?.can_prepare;
    find("[data-view-current]").disabled=value || !profile?.current_version_id;
    find("[data-remove]").disabled=value || !profile?.revision || profile.deleted;
  }
  async function perform(action) {
    if(busy || !current(epoch)) return;
    const token=epoch; lock(true);
    try { await action(token,abort.signal); }
    catch(error) { if(current(token)) { notice(visualError(error),true); if([401,403,404,409,410].includes(error.status)){clearPreview();clearCrop();} } }
    finally { if(current(token))lock(false); }
  }
  async function refreshProfile(token) {
    const row=await client.profile(legacy.id,abort.signal); if(!current(token))return;
    profile=row; find("[data-current]").textContent=row.deleted ? "Visual Companion deleted. Your original photo remains." : !row.current_version_id ? "No approved portrait yet." : row.enabled ? "Enabled for authorized Legacy voice calls." : "Disabled. Your approved portrait is retained privately.";
    find("[data-toggle]").textContent=row.enabled ? "Disable" : "Enable";
    lock(busy);
  }
  async function showVersion(id,token) {
    clearTimeout(timer); timer=null;
    const next=await client.version(legacy.id,id,abort.signal); if(!current(token))return;
    const changed=candidate?.id!==next.id; candidate=next;
    find("[data-candidate]").hidden=false;
    find("[data-candidate-status]").textContent=({queued:"Queued for private preparation…",preparing:"Preparing your portrait privately…",ready:"Ready. Inspect the face at rest and during the motion preview before approving.",failed:"This photo could not be prepared. Reposition the crop or choose another photo.",needs_recrop:"Please crop a single, clear face with some headroom, then confirm again.",purge_pending:"This version is being removed.",purged:"This version was removed.",cancelled:"Preparation was cancelled."})[next.state] || "Checking preparation…";
    if(next.state==="ready") {
      if(changed || !preview) {
        clearPreview();
        preview=createVisualPresence({host:find("[data-preview]"),client,legacyId:legacy.id,version:next.id,name:legacy.subject_name||"L",preview:true,staticPhoto:find("[data-static]").checked,
          guard:()=>current(token)&&candidate?.id===next.id,rendererFactory:createPortraitRenderer,onState:()=>lock(busy)});
        await preview.start(); if(current(token)) { lock(busy); find("[data-candidate]").scrollIntoView({block:"start"}); }
      }
    } else {
      clearPreview();
      if(["queued","preparing"].includes(next.state) && polls++<100) timer=setTimeout(()=>{timer=null;if(current(token))void perform(t=>showVersion(id,t));},3000);
      else if(["queued","preparing"].includes(next.state))notice("Preparation is taking longer. You can close this panel and check again later.");
    }
  }
  async function choose(row,token,initial=null) {
    clearCrop(); clearPreview(); const chosen=selection;
    if(!row)return;
    notice("Opening your private photo…");
    const blob=await media.original(legacy.id,row.id,abort.signal);
    if(!current(token)||chosen!==selection)return;
    if(blob.size>20*1024*1024 || !["image/jpeg","image/png","image/webp"].includes(blob.type))throw new Error("Photo unavailable.");
    const decoded=await createImageBitmap(blob,{imageOrientation:"from-image"});
    if(!current(token)||chosen!==selection){decoded.close();return;}
    bitmap=decoded;source=row;
    try { crop=mountCropControls(find("[data-crop]"),bitmap,{initial,onChange:()=>{pending=null;find("[data-confirm]").checked=false;find("[data-generate]").disabled=true;}}); }
    catch(error){clearCrop();throw error;}
    find("[data-crop-section]").hidden=false;
    find("[data-consent]").textContent=`Use this selected image for ${legacy.subject_name || "this Legacy"}'s Visual Companion. I have permission to use this likeness and understand that the animated result is an AI-generated representation, not a recording of this person.`;
    notice("");find("[data-crop-section]").scrollIntoView({block:"nearest"});
  }
  async function sourceList(token) {
    const rows=await media.list(legacy.id,abort.signal);if(!current(token))return;
    sources=rows.filter(s=>s.kind==="image" && s.safety_state==="clean" && !["uploading","deleting","deleted"].includes(s.state) && s.legacy_id===legacy.id);
    const select=find("[data-source]"); select.replaceChildren(new Option("Choose an image",""));
    for(const row of sources)select.add(new Option(row.original_filename,row.id));
  }
  async function open() {
    retire(); legacy=getLegacy();if(!legacy)return;account=auth.getSessionEpoch?.();
    legacy={...legacy}; focus=document.activeElement; dialog.showModal(); abort=new AbortController(); const token=epoch;
    find("[data-manage]").hidden=true;find("[data-delete-confirm]").hidden=true;find("[data-candidate]").hidden=true;find("[data-chooser]").hidden=false;
    find("[data-subject]").textContent=legacy.subject_name || "Selected Legacy";
    if(legacy.access_role!=="owner"){notice("Visual Presence is managed by the Legacy owner. You cannot prepare, preview or change their portrait.");return;}
    await perform(async()=>{
      const available=await client.capabilities(legacy.id,abort.signal);if(!current(token))return;capabilities=available;
      if(!capabilities.enabled){notice("Visual Presence is not enabled for this Legacy yet.");return;}
      if(!capabilities.can_manage || capabilities.confirmation_copy_version!=="l19-likeness-v1")throw new Error("Unsupported visual setup.");
      await refreshProfile(token); if(!current(token))return;
      await sourceList(token); if(!current(token))return;
      find("[data-manage]").hidden=false;notice(capabilities.can_prepare ? "" : "Preparation is temporarily unavailable. You can still manage an existing portrait.");
      polls=0;if(profile.desired_version_id && profile.desired_version_id!==profile.current_version_id)await showVersion(profile.desired_version_id,token);
    });
  }
  find("[data-source]").addEventListener("change",()=>void perform(token=>choose(sources.find(s=>s.id===find("[data-source]").value),token)));
  find("[data-upload]").addEventListener("change",()=>void perform(async token=>{
    const file=find("[data-upload]").files[0]; if(!file)return;
    if(!["image/jpeg","image/png","image/webp"].includes(file.type)||!file.size||file.size>20*1024*1024)throw new Error("Unsupported photo.");
    const pendingUpload=upload?.file===file?upload:{file,key:crypto.randomUUID(),source:null}; upload=pendingUpload;
    notice("Uploading a private visual reference. No memory extraction will run…");
    pendingUpload.source ||= await auth.apiRequest(`/legacies/${legacy.id}/sources`,{authenticated:true,method:"POST",signal:abort.signal,body:{filename:file.name,kind:"image",mime_type:file.type,size_bytes:file.size,upload_request_key:pendingUpload.key,processing_purpose:"visual_reference"}});
    if(!current(token))return;
    const row=await media.upload(legacy.id,pendingUpload.source.id,file,abort.signal);if(!current(token))return;
    upload=null;find("[data-upload]").value="";await sourceList(token);if(current(token))await choose(row,token);
  }));
  find("[data-confirm]").addEventListener("change",()=>lock(busy));
  find("[data-generate]").addEventListener("click",()=>void perform(async token=>{
    if(!crop||!source||!find("[data-confirm]").checked||!capabilities.can_prepare)return;
    pending ||= {source_id:source.id,crop:crop.value(),confirmed:true,confirmation_copy_version:capabilities.confirmation_copy_version,request_key:crypto.randomUUID(),expected_revision:profile.revision};
    notice("Requesting your private preview…");
    const created=await client.generate(legacy.id,pending,abort.signal);if(!current(token))return;
    pending=null;find("[data-confirm]").checked=false;await refreshProfile(token);if(!current(token))return;
    polls=0;notice("Preparing privately. Visitors still see only your current approved portrait.");await showVersion(created.id,token);
  }));
  find("[data-approve]").addEventListener("click",()=>void perform(async token=>{
    const receipt=preview?.approval();if(!receipt||receipt.version_id!==candidate?.id)return;
    await client.activate(legacy.id,receipt,abort.signal);if(!current(token))return;
    clearPreview();invalidate();await refreshProfile(token);if(current(token)){notice("Approved and enabled for authorized Legacy calls.");find("[data-candidate]").hidden=true;}
  }));
  find("[data-toggle]").addEventListener("click",()=>void perform(async token=>{
    clearPreview();await client.toggle(legacy.id,!profile.enabled,profile.revision,abort.signal);if(!current(token))return;
    invalidate();await refreshProfile(token);if(current(token))notice(profile.enabled?"Visual Presence enabled.":"Visual Presence disabled. Voice and memories are unchanged.");
  }));
  find("[data-replace]").addEventListener("click",()=>{clearCrop();find("[data-chooser]").hidden=false;find("[data-source]").focus();});
  find("[data-regenerate]").addEventListener("click",()=>void perform(async token=>{
    const version=await client.version(legacy.id,profile.current_version_id,abort.signal);if(!current(token))return;
    const row=await media.source(legacy.id,version.source_id,abort.signal);if(!current(token))return;
    await choose(row,token,version.crop);if(current(token))notice("Review this crop and confirm again to prepare a new private version. The current approved portrait stays active.");
  }));
  find("[data-view-current]").addEventListener("click",()=>void perform(token=>showVersion(profile.current_version_id,token)));
  find("[data-refresh]").addEventListener("click",()=>void perform(async token=>{polls=0;await refreshProfile(token);if(current(token)&&profile.desired_version_id)await showVersion(profile.desired_version_id,token);}));
  find("[data-static]").addEventListener("change",()=>preview?.setStatic(find("[data-static]").checked));
  find("[data-remove]").addEventListener("click",()=>{find("[data-delete-confirm]").hidden=false;find("[data-delete-yes]").focus();});
  find("[data-delete-no]").addEventListener("click",()=>{find("[data-delete-confirm]").hidden=true;});
  find("[data-delete-yes]").addEventListener("click",()=>void perform(async token=>{
    clearPreview();clearCrop();await client.remove(legacy.id,profile.revision,abort.signal);if(!current(token))return;
    invalidate();find("[data-delete-confirm]").hidden=true;find("[data-candidate]").hidden=true;await refreshProfile(token);if(current(token))notice("Prepared portraits are being erased. The original photo remains in Media & Sources.");
  }));
  find("[data-close]").addEventListener("click",close); dialog.addEventListener("cancel",event=>{event.preventDefault();close();});
  entry.addEventListener("click",()=>void open());
  function updateEntry(){if(dialog.open)close();const active=getLegacy();entry.hidden=!active||active.setup_status!=="active"||!["owner","collaborator"].includes(active.access_role);entry.title=active?.access_role==="collaborator"?"Managed by the Legacy owner":"Manage Visual Presence";}
  window.addEventListener("legarya-legacy-change",updateEntry);window.addEventListener("legarya:session-expired",close);window.addEventListener("pagehide",close);
  window.addEventListener("legarya:session-ending",close);
  document.addEventListener("visibilitychange",()=>{if(document.hidden&&dialog.open)close();});updateEntry();
}
