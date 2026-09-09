"use strict";
(() => {
  const {apiRequest,ensureAuthenticated,logout}=window.LegaryaAuthApi;
  const {withDeadline}=window.LegaryaAsync;
  const find=s=>document.querySelector(s);
  const deletionNotice=find('#legacyDeletedNotice');
  if(deletionNotice)deletionNotice.hidden=new URLSearchParams(location.search).get('legacyDeleted')!=='1';
  function installJoin({prefix,route,dialog,form,input,codeStep,confirmStep,status,open,close,change,previewButton,joinButton,showPreview,destination}) {
    let epoch=0,busy=false,abort=null,code='',preview=null;
    const elements={dialog,form,input,codeStep,confirmStep,status,open,close,change,previewButton,joinButton};
    for(const key of Object.keys(elements))elements[key]=find(elements[key]);
    const e=elements;
    const lock=value=>{busy=value;e.previewButton.disabled=value;e.joinButton.disabled=value;e.input.disabled=value;e.form.setAttribute('aria-busy',String(value));};
    const reset=()=>{++epoch;abort?.abort();abort=null;lock(false);code='';preview=null;e.codeStep.hidden=false;e.confirmStep.hidden=true;e.status.textContent='';};
    const current=token=>epoch===token&&e.dialog.open;
    async function request(path,work){
      if(busy)return;
      const token=epoch,submitted=code;abort=new AbortController();lock(true);
      try{
        const result=await withDeadline(signal=>apiRequest(route+path,{method:'POST',authenticated:true,signal,body:{code:submitted}}),{signal:abort.signal});
        if(current(token))work(result);
      }catch(error){if(current(token)&&error.name!=='AbortError')e.status.textContent=error.message||'Unable to open this Legacy. Please retry.';}
      finally{if(current(token)){abort=null;lock(false);if(path==='/preview'&&preview&&!e.confirmStep.hidden)e.joinButton.focus();}}
    }
    e.input.addEventListener('input',()=>{const clean=e.input.value.toUpperCase().replace(/[^A-Z0-9]/g,'').replace(new RegExp('^'+prefix),'').slice(0,8);e.input.value=`${prefix}-${clean.slice(0,4)}${clean.length>4?'-'+clean.slice(4):''}`;});
    e.open.addEventListener('click',()=>{reset();e.form.reset();e.dialog.showModal();requestAnimationFrame(()=>e.input.focus());});
    e.close.addEventListener('click',()=>{reset();e.dialog.close();});
    e.dialog.addEventListener('close',reset);e.dialog.addEventListener('cancel',reset);
    e.change.addEventListener('click',()=>{reset();e.input.focus();});
    e.form.addEventListener('submit',event=>{
      event.preventDefault();if(busy||e.codeStep.hidden)return;
      code=e.input.value.trim();e.status.textContent='Checking code…';
      void request('/preview',result=>{
        if(!Number.isSafeInteger(result.legacy_id)||result.legacy_id<1)throw new Error('Unable to verify this Legacy. Please retry.');
        if(result.access_role==='revoked')throw new Error('The owner must restore your access to this Legacy.');
        if(prefix==='COL'&&result.access_role==='owner'){location.href=destination(result.legacy_id);return;}
        preview=result;showPreview(result);e.codeStep.hidden=true;e.confirmStep.hidden=false;e.status.textContent='';
      });
    });
    e.joinButton.addEventListener('click',()=>{
      if(busy||!preview||e.confirmStep.hidden)return;
      e.status.textContent='Opening your conversation…';
      void request('/join',result=>{
        if(result.legacy_id!==preview.legacy_id)throw new Error('This Legacy changed. Please check the code again.');
        if(prefix==='COL'){try{sessionStorage.setItem(window.LegaryaWorkspaceRole.COLLABORATION_GREETING_KEY,String(result.legacy_id));}catch{/* Optional greeting must not block entry. */}}
        location.href=destination(result.legacy_id);
      });
    });
    // BFCache/cancelled navigation must not restore a locked form or let an old
    // code's late response redirect into the wrong Legacy.
    window.addEventListener('pagehide',reset);window.addEventListener('pageshow',event=>{if(event.persisted)reset();});reset();
  }
  installJoin({prefix:'LEG',route:'/legacy-access',dialog:'#legacyJoinDialog',form:'#legacyJoinForm',input:'#legacyCode',codeStep:'#legacyCodeStep',confirmStep:'#legacyConfirmStep',status:'#legacyJoinStatus',open:'#openLegacyJoin',close:'#closeLegacyJoin',change:'#changeLegacyCode',previewButton:'#previewLegacyCode',joinButton:'#beginLegacyConversation',
    showPreview:result=>{find('#legacyPreviewName').textContent=result.subject_name?`You're about to talk with ${result.subject_name}'s Legacy`:'You’re about to talk with this Legacy';},destination:id=>`legacy-chat.html?legacy=${id}`});
  installJoin({prefix:'COL',route:'/collaborations',dialog:'#joinDialog',form:'#joinForm',input:'#collaboratorCode',codeStep:'#codeStep',confirmStep:'#confirmStep',status:'#joinStatus',open:'#openJoin',close:'#closeJoin',change:'#changeCode',previewButton:'#previewCode',joinButton:'#confirmJoin',
    showPreview:result=>{find('#joinLegacyName').textContent=`You're joining ${result.subject_name||'this person'}'s Legacy`;find('#joinOwnerName').textContent=`Owner: ${result.owner_name||'Legacy owner'}`;},destination:id=>`chat.html?legacy=${id}`});
  find('#gatewayLogout').addEventListener('click',async()=>{await logout();location.replace('auth.html?mode=login');});
  const retry=find('#gatewayRetry');let authenticating=false;
  async function authenticate(){
    if(authenticating)return;authenticating=true;retry.hidden=true;
    try{const user=await withDeadline(()=>ensureAuthenticated());find('#gatewayWelcome').textContent=`Welcome, ${user.full_name||'friend'}.`;}
    catch(error){if(error.status===401)location.replace('auth.html?mode=login');else{find('#gatewayWelcome').textContent='Connection interrupted. Please retry signing in.';retry.hidden=false;}}
    finally{authenticating=false;}
  }
  retry.addEventListener('click',authenticate);void authenticate();
})();
