import './request-deadline.js';

export function createPictureClient(auth){
  const base=id=>`/legacies/${Number(id)}/visual-companion/display-picture`;
  return {
    profile:(id,signal)=>auth.apiRequest(base(id),{authenticated:true,signal}),
    select:(id,sourceId,signal)=>auth.apiRequest(base(id),{method:'PUT',authenticated:true,signal,body:{source_id:sourceId}}),
    image:async(path,signal)=>(await auth.authenticatedVisualFetch(path,{signal})).blob(),
  };
}

// A private static image with bounded authorization refresh, never a renderer.
export function createDisplayPicture({host,client,legacyId,name='Legacy',guard=()=>true,onState=()=>{},environment=window}){
  let disposed=false,epoch=0,url=null,revision=null,timer=null,expiry=null,abort=null;
  const current=t=>!disposed&&t===epoch&&guard();
  function clear(){if(url)environment.URL.revokeObjectURL(url);url=revision=null;host.replaceChildren();}
  async function refresh(){
    const token=++epoch;abort?.abort();abort=new AbortController();
    if(!current(token)){clear();return;}
    try{
      await environment.LegaryaAsync.withDeadline(async signal=>{
        const info=await client.profile(legacyId,signal);if(!current(token))return;
        if(!info.available){clear();onState('DISABLED');return;}
        if(info.revision!==revision){
          const blob=await client.image(info.content_path,signal);if(!current(token))return;
          if(blob.type!=='image/jpeg'||blob.size>2097152)throw Error('Invalid display picture');
          const next=environment.URL.createObjectURL(blob),img=host.ownerDocument.createElement('img');
          img.className='legacy-display-picture';img.alt=`${name} display picture`;img.src=next;
          try{await img.decode();}catch(error){environment.URL.revokeObjectURL(next);throw error;}
          if(!current(token)||signal.aborted){environment.URL.revokeObjectURL(next);return;}
          clear();url=next;revision=info.revision;host.replaceChildren(img);
        }
        onState('IDLE');
      },{signal:abort.signal,timeoutMs:15000});
      if(current(token)){
        environment.clearTimeout(expiry);
        expiry=environment.setTimeout(()=>{clear();onState('ERROR');},30000);
      }
    }catch{if(current(token)){clear();onState('ERROR');}}
    finally{if(current(token))timer=environment.setTimeout(refresh,15000);}
  }
  return {start:()=>{onState('LOADING');return refresh();},setCallState(){},presentation(){},
    dispose(){disposed=true;++epoch;abort?.abort();environment.clearTimeout(timer);environment.clearTimeout(expiry);clear();}};
}
