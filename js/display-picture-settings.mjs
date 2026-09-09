import {createPictureClient,createDisplayPicture} from './display-picture.mjs?v=dp1';
import {waitForVisualSource} from './visual-source-ready.mjs?v=l19c2';

const auth=window.LegaryaAuthApi,entry=document.querySelector('#openVisualPresence');
if(auth&&entry&&window.LegaryaMedia){
  const client=createPictureClient(auth),media=window.LegaryaMedia.createClient(auth);
  const dialog=document.createElement('dialog');dialog.className='visual-settings';dialog.setAttribute('aria-labelledby','pictureTitle');
  dialog.innerHTML=`<header><h2 id="pictureTitle">Legacy photo</h2><button type="button" data-close>Close</button></header>
    <p data-subject class="visual-subject"></p><p>Upload a picture to show in this Legacy's chats and calls. Your full image is kept—no cropping or animation.</p>
    <p data-notice role="status" aria-live="polite"></p>
    <label class="visual-upload" data-manage>Upload photo<input data-upload type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload Legacy photo"></label>
    <p class="visual-hint">JPEG, PNG or WebP, up to 20 MB. Upload only a picture you have permission to share with this Legacy's visitors. Identity setup is not required.</p>
    <div data-picture class="display-picture-preview"></div>`;
  document.body.append(dialog);
  const find=s=>dialog.querySelector(s),getLegacy=()=>window.LegaryaWorkspace?.getActiveLegacy();
  let epoch=0,abort=null,picture=null,legacy=null,account=null,busy=false;
  const current=t=>dialog.open&&epoch===t&&auth.getSessionEpoch?.()===account&&getLegacy()?.id===legacy?.id;
  function close(){++epoch;abort?.abort();picture?.dispose();picture=null;busy=false;find('[data-upload]').value='';dialog.close();entry.focus();}
  function showPicture(token){
    picture?.dispose();picture=createDisplayPicture({host:find('[data-picture]'),client,legacyId:legacy.id,name:legacy.subject_name||'Legacy',guard:()=>current(token),onState:state=>{
      if(current(token)&&state==='ERROR'&&!busy)find('[data-notice]').textContent='The photo could not load. Close and reopen to retry.';
    }});void picture.start();
  }
  entry.addEventListener('click',()=>{
    legacy=getLegacy();if(!legacy)return;const token=++epoch;account=auth.getSessionEpoch?.();abort=new AbortController();
    find('[data-subject]').textContent=legacy.subject_name||'Selected Legacy';
    const owner=legacy.access_role==='owner';find('[data-manage]').hidden=!owner;find('[data-upload]').disabled=!owner;
    find('[data-notice]').textContent=owner?'Your photo is saved automatically after upload.':'The Legacy owner manages this photo.';
    dialog.showModal();if(owner)showPicture(token);
  });
  find('[data-close]').addEventListener('click',close);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  find('[data-upload]').addEventListener('change',async()=>{
    const file=find('[data-upload]').files[0],token=epoch;if(!file||busy||!current(token)||legacy.access_role!=='owner')return;
    busy=true;find('[data-upload]').disabled=true;find('[data-notice]').textContent='Uploading photo…';
    try{
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)||!file.size||file.size>20*1048576)throw Error('Choose a JPEG, PNG or WebP image up to 20 MB.');
      await window.LegaryaAsync.withDeadline(async signal=>{
        let source=await auth.apiRequest(`/legacies/${legacy.id}/sources`,{method:'POST',authenticated:true,signal,body:{filename:file.name,kind:'image',mime_type:file.type,size_bytes:file.size,upload_request_key:crypto.randomUUID(),processing_purpose:'visual_reference'}});
        if(!current(token))return;
        source=await media.upload(legacy.id,source.id,file,signal);
        if(current(token))find('[data-notice]').textContent='Saving your photo…';
        source=await waitForVisualSource(media,legacy.id,source,{signal,current:()=>current(token)});
        if(!current(token))return;
        await client.select(legacy.id,source.id,signal);
        if(!current(token))return;
        window.dispatchEvent(new CustomEvent('legarya:visual-invalidated',{detail:{legacyId:legacy.id}}));
        showPicture(token);find('[data-notice]').textContent='Photo saved. Visitors will see it in chats and calls.';
      },{signal:abort.signal,timeoutMs:120000});
    }catch(error){if(current(token))find('[data-notice]').textContent=error.status?'Could not save the photo. Your previous picture is unchanged. Please try again.':error.message;}
    finally{if(current(token)){busy=false;find('[data-upload]').disabled=false;find('[data-upload]').value='';}}
  });
  const update=()=>{if(dialog.open)close();const selected=getLegacy();entry.hidden=!selected||!['owner','collaborator'].includes(selected.access_role);entry.title='Legacy photo';};
  window.addEventListener('legarya-legacy-change',update);window.addEventListener('legarya:session-expired',close);window.addEventListener('legarya:session-ending',close);window.addEventListener('pagehide',close);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&dialog.open)close();});update();
}
