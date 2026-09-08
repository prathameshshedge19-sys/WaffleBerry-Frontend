"use strict";
((root)=>{
  function create({request,getLegacy,onChange=()=>{},onDeleted=()=>{}}){
    let epoch=0,abort=null;
    const state={open:false,loading:false,busy:false,legacy:null,preview:null,confirmation:"",acknowledged:false,error:""};
    const emit=()=>onChange(state);
    const current=token=>state.open&&epoch===token&&getLegacy()?.id===state.legacy?.id&&getLegacy()?.access_role==="owner";
    function close(){if(state.busy)return false;abort?.abort();epoch++;Object.assign(state,{open:false,loading:false,legacy:null,preview:null,confirmation:"",acknowledged:false,error:""});emit();return true;}
    async function open(){
      if(state.busy)return;close();const legacy=getLegacy();if(!legacy||legacy.access_role!=="owner")return;
      state.open=true;state.loading=true;state.legacy={...legacy};abort=new AbortController();const token=++epoch;emit();
      try{const preview=await request(`/legacies/${legacy.id}/deletion-preview`,{authenticated:true,signal:abort.signal});if(!current(token))return;
        if(preview.legacy_id!==legacy.id||preview.confirmation_text!==`DELETE LEGACY ${legacy.id}`)throw Error("The selected Legacy changed. Close this warning and try again.");
        if(preview.status!=="available")throw Error("This Legacy is already being deleted.");state.preview=preview;
      }catch(error){if(current(token)&&error.name!=="AbortError")state.error=error.message||"The deletion warning could not be loaded. Nothing was deleted.";}
      finally{if(current(token)){state.loading=false;emit();}}
    }
    function update(confirmation,acknowledged){if(state.busy)return;state.confirmation=confirmation;state.acknowledged=acknowledged===true;emit();}
    const canDelete=()=>Boolean(state.open&&!state.loading&&!state.busy&&state.preview&&state.acknowledged&&state.confirmation===state.preview.confirmation_text&&getLegacy()?.id===state.legacy?.id&&getLegacy()?.access_role==="owner");
    async function remove(){
      if(!canDelete())return false;const id=state.legacy.id;state.busy=true;state.error="";emit();
      try{const result=await request(`/legacies/${id}`,{method:"DELETE",authenticated:true,body:{confirmation:state.confirmation,acknowledge_permanent:true}});
        if(result.legacy_id!==id||result.status!=="deleting")throw Error("Deletion could not be confirmed. Refresh before trying again.");
        state.busy=false;close();onDeleted(id);return true;
      }catch(error){state.busy=false;state.error=error.message||"Deletion could not be confirmed. Check your connection and try again.";emit();return false;}
    }
    return {state,open,close,update,canDelete,remove};
  }
  if(typeof module!=="undefined"&&module.exports)module.exports={create};
  if(!root.document)return;
  const document=root.document,entry=document.querySelector("#deleteLegacy");if(!entry||!root.LegaryaAuthApi)return;
  const el=(tag,text="",cls="")=>{const node=document.createElement(tag);node.textContent=text;if(cls)node.className=cls;return node;};
  const dialog=el("dialog","","legacy-delete-dialog");dialog.setAttribute("aria-labelledby","legacyDeleteTitle");
  const title=el("h2","Delete this Legacy?");title.id="legacyDeleteTitle";
  const warning=el("div","","legacy-delete-warning");warning.append(el("strong","Warning: this cannot be undone in the app."),el("span","This permanently removes the selected Legacy, including its memories, chats, timeline, saved Stories, uploaded photos and documents, and prepared portraits. Visitors and collaborators will lose access."));
  const target=el("p"),counts=el("ul"),note=el("p","Your account and other Legacies will not be deleted. File cleanup can continue in the background. Protected backups are not immediately rewritten.");
  const label=el("label");label.htmlFor="legacyDeleteConfirmation";
  const input=el("input");input.id="legacyDeleteConfirmation";input.type="text";input.autocomplete="off";input.spellcheck=false;input.setAttribute("autocapitalize","off");
  const acknowledge=el("label"),checkbox=el("input");checkbox.type="checkbox";checkbox.id="legacyDeleteAcknowledge";acknowledge.append(checkbox,el("span","I understand that this permanently deletes this Legacy and its contents."));
  const status=el("p","","legacy-delete-status");status.setAttribute("role","status");status.setAttribute("aria-live","polite");
  const actions=el("div","","legacy-delete-actions"),keep=el("button","Keep Legacy"),remove=el("button","Permanently delete Legacy","legacy-delete-confirm");keep.type=remove.type="button";actions.append(keep,remove);
  dialog.append(title,warning,target,counts,note,label,input,acknowledge,status,actions);document.body.append(dialog);
  let shown=null;
  const controller=create({request:root.LegaryaAuthApi.apiRequest,getLegacy:()=>root.LegaryaWorkspace?.getActiveLegacy?.(),onDeleted:()=>root.location.replace("gateway.html?legacyDeleted=1"),onChange:state=>{
    if(!state.open){if(dialog.open)dialog.close();shown=null;input.value="";checkbox.checked=false;return;}
    if(!dialog.open){dialog.showModal();keep.focus();}
    target.textContent=`Selected Legacy: ${state.preview?.subject_name||state.legacy.subject_name||"Unnamed Legacy"} (ID ${state.legacy.id})`;
    if(shown!==state.preview){shown=state.preview;counts.replaceChildren();if(shown)for(const [key,text] of [["memories","stored memories"],["conversations","chats"],["timeline_events","timeline events"],["saved_stories","saved Stories"],["uploaded_files","uploaded files"]])counts.append(el("li",`${shown.counts[key]} ${text}`));}
    label.textContent=state.preview?`Type ${state.preview.confirmation_text} to confirm:`:"Loading confirmation…";
    input.disabled=checkbox.disabled=state.loading||state.busy||!state.preview;keep.disabled=state.busy;remove.disabled=!controller.canDelete();
    status.textContent=state.loading?"Checking this Legacy…":state.busy?"Deleting this Legacy. Please wait…":state.error;
  }});
  entry.addEventListener("click",()=>controller.open());keep.addEventListener("click",()=>{if(controller.close())entry.focus();});remove.addEventListener("click",()=>controller.remove());
  input.addEventListener("input",()=>controller.update(input.value,checkbox.checked));checkbox.addEventListener("change",()=>controller.update(input.value,checkbox.checked));
  dialog.addEventListener("cancel",event=>{event.preventDefault();if(controller.close())entry.focus();});
  const sync=()=>{entry.hidden=root.LegaryaWorkspace?.getActiveLegacy?.()?.access_role!=="owner";controller.close();};
  root.addEventListener("legarya-legacy-change",sync);root.addEventListener("pagehide",()=>controller.close());sync();
})(typeof window!=="undefined"?window:globalThis);
